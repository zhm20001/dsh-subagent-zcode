/**
 * One-shot zcode CLI lifecycle: spawn the shebang entry under the shared
 * subprocess seam, require a zero exit plus a strictly parsed headless JSON
 * result, and publish the standard never-rejecting run handle. Cancellation
 * escalates through the subprocess seam's managed range; teardown waits for
 * quiescence.
 * @module @deepseek-ai/dsh-subagent-zcode/run
 */

import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  settleRunResult,
  subprocessRunHandle,
  type SubagentResult,
  type SubagentRun,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import type {
  JobOutputSource,
  JobSourceRead,
} from '@deepseek-ai/dsh-jobs'
import {
  type SubprocessHandle,
  type SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { buildZcodeCommand, joinPromptText, parseZcodeHeadlessOutput, ZcodeOutputError } from './cli.ts'
import type { ZcodeHeadlessOutput } from './cli.ts'
import { BUILTIN_PROVIDER_CONFIG_ENV, PLUGIN_NAME, type ZcodeMode } from './config.ts'
import type { ZcodeSessionId } from './brand.ts'

/** Grace between the subprocess seam's termination tiers, and for draining collected pipes. */
export const DISPOSE_GRACE_MS = 3_000

/** In-memory cap of the collected stdout; overflow keeps the tail. */
const STDOUT_MAX_BYTES = 1_048_576

/** Whole-stream spill cap for stdout so a large result stays recoverable. */
const STDOUT_SPILL_MAX_BYTES = 16 * 1_048_576

/** In-memory cap of the collected stderr (the failure-reason tail). */
const STDERR_MAX_BYTES = 65_536

/** Longest failure-reason text carried in a job detail or diagnostic. */
const FAILURE_DETAIL_MAX_CHARS = 2_000

/** The zcode CLI process ended without a usable result. */
export class ZcodeProcessFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZcodeProcessFailure'
  }
}

/** Fully resolved inputs for one headless CLI run. */
export interface ZcodeRunSpec {
  /** Task directory (already whitelist-checked by the caller). */
  readonly cwd: string
  /** Permission mode passed as `--mode`. */
  readonly mode: ZcodeMode
  /** Whole tools removed from the child. */
  readonly disallowedTools: readonly string[]
  /** Resume an existing zcode session instead of minting one. */
  readonly resume?: ZcodeSessionId
  /** Absolute path of the CLI entry script. */
  readonly cliPath: string
  /**
   * Builtin provider config injected into the child environment as
   * {@link BUILTIN_PROVIDER_CONFIG_ENV}; `undefined` forwards nothing and lets
   * the CLI resolve its own copy.
   */
  readonly builtinProviderConfigPath?: string | undefined
  /** Shared subprocess service spawn operation. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Host diagnostic sink for a failure flattened to a stop reason. */
  readonly onError?: (error: Error, stopReason: SubagentStopReason) => void
}

function boundDetail(text: string): string {
  return text.length > FAILURE_DETAIL_MAX_CHARS ? `${text.slice(0, FAILURE_DETAIL_MAX_CHARS)}…` : text
}

/** Read one collected stream whole (offset 0 — the batch shape). */
function readCollected(handle: SubprocessHandle, channel: 'stdout' | 'stderr'): string {
  const reader = channel === 'stdout' ? handle.collected.stdout : handle.collected.stderr
  return reader === undefined ? '' : reader.readFrom(0).text
}

/**
 * Pull sources binding a spawned handle's collected streams into a job's
 * output ring. The handle is captured lazily: the job's pull pump starts
 * after the starter ran, and a missing handle reads as empty.
 * @param handle - accessor for the live child, `undefined` before spawn.
 * @returns one source per collected channel, labeled `stdout`/`stderr`.
 */
export function subprocessSources(handle: () => SubprocessHandle | undefined): JobOutputSource[] {
  const source = (channel: 'stdout' | 'stderr'): JobOutputSource => ({
    channel,
    read: (fromByte): JobSourceRead => {
      const live = handle()
      const reader = live === undefined
        ? undefined
        : channel === 'stdout' ? live.collected.stdout : live.collected.stderr
      return reader === undefined
        ? { text: '', nextOffset: fromByte, lossy: false }
        : reader.readFrom(fromByte)
    },
  })
  return [source('stdout'), source('stderr')]
}

/**
 * Terminate the child's managed range and wait for quiescence.
 * @param child - the shared-service handle owning the CLI process.
 * @throws when termination or the quiescence wait itself fails.
 */
export async function disposeZcodeChild(child: SubprocessHandle): Promise<void> {
  child.terminate()
  try {
    await child.waitForExit()
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ZcodeProcessFailure(`${PLUGIN_NAME}: zcode CLI teardown failed: ${boundDetail(reason)}`)
  }
  await child.done.catch(() => {})
}

/**
 * Start one headless CLI run and publish its one-shot run.
 * @param prompt - task content; joined into the single `-p` text.
 * @param signal - cancellation of the whole run (kill or tool-call abort).
 * @param spec - resolved task directory, authority posture, and spawn wiring.
 * @returns the published run; its result settles `completed` only for a zero
 * exit carrying a valid headless JSON object.
 */
// oxlint-disable-next-line typescript/require-await -- every startup failure must reject, never throw synchronously
export async function startZcodeRun(
  prompt: readonly ContentBlock[],
  signal: AbortSignal,
  spec: ZcodeRunSpec,
): Promise<SubagentRun> {
  const text = joinPromptText(prompt)
  if (signal.aborted) {
    throw new Error(`${PLUGIN_NAME}: request was aborted before CLI startup`)
  }
  const controller = new AbortController()
  const requestCancel = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`${PLUGIN_NAME}: run cancelled locally`))
    }
  }
  const onAbort = (): void => { requestCancel() }
  signal.addEventListener('abort', onAbort, { once: true })

  let child: SubprocessHandle
  try {
    child = spec.spawn({
      argv: buildZcodeCommand({
        cliPath: spec.cliPath,
        prompt: text,
        cwd: spec.cwd,
        mode: spec.mode,
        disallowedTools: spec.disallowedTools,
        ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
      }),
      cwd: spec.cwd,
      ...(spec.builtinProviderConfigPath !== undefined
        ? { env: { [BUILTIN_PROVIDER_CONFIG_ENV]: spec.builtinProviderConfigPath } }
        : {}),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: STDOUT_MAX_BYTES, spill: { maxBytes: STDOUT_SPILL_MAX_BYTES } },
        stderr: { maxBytes: STDERR_MAX_BYTES },
      },
      graceMs: DISPOSE_GRACE_MS,
      signal: controller.signal,
    })
  } catch (error: unknown) {
    signal.removeEventListener('abort', onAbort)
    throw error
  }

  let diagnostic: string | undefined
  const spawnedChild = child
  const withStderrTail = (message: string): string => {
    const stderrTail = readCollected(spawnedChild, 'stderr').trim()
    return stderrTail.length === 0 ? message : `${message}; stderr: ${boundDetail(stderrTail)}`
  }
  const result = settleRunResult({
    attempt: async (): Promise<SubagentResult> => {
      try {
        const outcome = await spawnedChild.done
        const stderrTail = readCollected(spawnedChild, 'stderr')
        if (outcome.exitCode !== 0 || outcome.signal !== null) {
          const reason = outcome.exitCode !== null
            ? `exit code ${outcome.exitCode}`
            : `terminated by signal ${outcome.signal}`
          const detail = boundDetail(stderrTail.length > 0 ? `${reason}; stderr: ${stderrTail.trim()}` : reason)
          throw new ZcodeProcessFailure(`${PLUGIN_NAME}: zcode CLI run failed (${detail})`)
        }
        const parsed: ZcodeHeadlessOutput = parseZcodeHeadlessOutput(readCollected(spawnedChild, 'stdout'))
        return {
          output: [{ type: 'text', text: parsed.response }],
          structured: parsed,
          stopReason: 'completed',
        }
      } catch (error: unknown) {
        // One diagnostic per attempt: prefer the typed failures' own message,
        // and attach the stderr tail to an output-parse failure.
        diagnostic = error instanceof ZcodeProcessFailure
          ? error.message
          : error instanceof ZcodeOutputError
            ? withStderrTail(error.message)
            : String(error)
        throw error
      }
    },
    collectOutput: () => [],
    collectDiagnostic: () => diagnostic,
    cancelled: () => controller.signal.aborted,
    onError: spec.onError,
    signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: brandString<SessionId>(randomUUID()),
    result,
    signal,
    onAbort,
    requestCancel,
    teardown: () => disposeZcodeChild(spawnedChild),
  })
}
