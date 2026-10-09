/**
 * The zcode CLI headless contract: argv assembly for `-p … --json` runs and
 * strict parsing of the single stdout JSON object (ZCode 0.16.9 shape:
 * sessionId/traceId/turnId/response/usage/eventCount/projection). Facts about
 * unverified CLI behavior stay unassumed — only the verified keys are read.
 * @module @deepseek-ai/dsh-subagent-zcode/cli
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { ZcodeSessionId } from './brand.ts'
import type { ZcodeMode } from './config.ts'

/**
 * Join the one-shot task into the single `-p` text.
 * @param prompt - task content accepted from the delegating surface.
 * @returns the exact text sequence as one CLI prompt.
 */
export function joinPromptText(prompt: readonly ContentBlock[]): string {
  if (prompt.length === 0) {
    throw new Error('subagent-zcode: the one-shot task must contain only text blocks')
  }
  const texts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error('subagent-zcode: the one-shot task must contain only text blocks')
    }
    texts.push(block.text)
  }
  if (texts.every(text => text.trim().length === 0)) {
    throw new Error('subagent-zcode: the one-shot task must not be empty')
  }
  return texts.join('')
}

/** Inputs for {@link buildZcodeCommand}. */
export interface ZcodeCommandSpec {
  /** Absolute path of the CLI entry script. */
  readonly cliPath: string
  /** The `-p` prompt text. */
  readonly prompt: string
  /** Task directory passed as `--cwd`. */
  readonly cwd: string
  /** Permission mode passed as `--mode` (always explicit; the CLI's `-p` default is `yolo`). */
  readonly mode: ZcodeMode
  /** Whole tools to remove via `--disallowed-tools`. */
  readonly disallowedTools: readonly string[]
  /** Resume an existing zcode session instead of minting one. */
  readonly resume?: ZcodeSessionId
}

/**
 * Assemble one headless CLI invocation. `--disallowed-tools` is a variadic
 * flag, so the entries are comma-joined into one argument — a separate
 * `--cwd` value after them could otherwise be swallowed as another tool name.
 * @param spec - CLI path, prompt, cwd, mode, removals, and optional resume id.
 * @returns the argv (the entry script is `argv[0]`; it is a shebang executable).
 */
export function buildZcodeCommand(spec: ZcodeCommandSpec): string[] {
  return [
    spec.cliPath,
    ...spec.resume !== undefined ? ['--resume', spec.resume] : [],
    '-p', spec.prompt,
    '--json',
    '--cwd', spec.cwd,
    '--mode', spec.mode,
    ...spec.disallowedTools.length > 0 ? ['--disallowed-tools', spec.disallowedTools.join(',')] : [],
  ]
}

/** Token accounting reported by the CLI for the finished run (verified numeric keys only). */
export interface ZcodeUsage {
  readonly modelRequestCount?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

/** The parsed headless result, carried with the raw stdout for full-fidelity consumers. */
export interface ZcodeHeadlessOutput {
  /** Stable zcode session id (`sess_…`) — the `--resume` handle. */
  readonly zcodeSessionId: ZcodeSessionId
  /** Per-process trace id, when the CLI reported one. */
  readonly traceId: string | undefined
  /** The CLI's final message. */
  readonly response: string
  /** Token accounting, when the CLI reported it. */
  readonly usage: ZcodeUsage | undefined
  /** The complete stdout text (the model-facing `job_output` body after settlement). */
  readonly rawStdout: string
}

/** The CLI stdout did not carry a valid headless JSON result. */
export class ZcodeOutputError extends Error {
  constructor(reason: string, cause?: unknown) {
    super(`subagent-zcode: zcode CLI stdout is not a valid headless result (${reason})`,
      cause === undefined ? undefined : { cause })
    this.name = 'ZcodeOutputError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

const USAGE_KEYS = [
  'modelRequestCount',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
] as const

function parseUsage(value: unknown): ZcodeUsage | undefined {
  if (!isRecord(value)) return undefined
  const usage: { -readonly [K in keyof ZcodeUsage]: ZcodeUsage[K] } = {}
  for (const key of USAGE_KEYS) {
    const parsed = asFiniteNumber(value[key])
    if (parsed !== undefined) usage[key] = parsed
  }
  return usage
}

/**
 * Strictly parse the headless stdout object. Unknown extra keys (turnId,
 * eventCount, projection) are intentionally ignored — they are diagnostics,
 * not dispatch facts.
 * @param stdout - the complete process stdout text.
 * @returns the verified session facts.
 * @throws {@link ZcodeOutputError} when stdout is not one JSON object with a
 * string `sessionId` and string `response`.
 */
export function parseZcodeHeadlessOutput(stdout: string): ZcodeHeadlessOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (error: unknown) {
    throw new ZcodeOutputError('stdout is not JSON', error)
  }
  if (!isRecord(parsed)) {
    throw new ZcodeOutputError('stdout JSON is not an object')
  }
  const sessionId = parsed['sessionId']
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new ZcodeOutputError('sessionId is missing or not a non-empty string')
  }
  const response = parsed['response']
  if (typeof response !== 'string') {
    throw new ZcodeOutputError('response is missing or not a string')
  }
  return {
    zcodeSessionId: ZcodeSessionId(sessionId),
    traceId: asOptionalString(parsed['traceId']),
    response,
    usage: parseUsage(parsed['usage']),
    rawStdout: stdout,
  }
}

/**
 * Narrow an unknown value back to headless facts. The value is produced by
 * this package's own provider across the subagent seam's `structured` slot,
 * which types it as `unknown`; the guard checks the fields consumers rely on.
 * @param value - the `structured` value of a settled run result.
 * @returns the facts, or `undefined` when the value is absent or malformed.
 */
export function asZcodeHeadlessOutput(value: unknown): ZcodeHeadlessOutput | undefined {
  if (!isRecord(value)) return undefined
  const zcodeSessionId = value['zcodeSessionId']
  const response = value['response']
  const rawStdout = value['rawStdout']
  if (typeof zcodeSessionId !== 'string' || typeof response !== 'string' || typeof rawStdout !== 'string') {
    return undefined
  }
  return {
    zcodeSessionId: ZcodeSessionId(zcodeSessionId),
    traceId: asOptionalString(value['traceId']),
    response,
    usage: parseUsage(value['usage']),
    rawStdout,
  }
}
