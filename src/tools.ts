/**
 * The model-facing dispatch tool. `zcode_dispatch` mirrors the shared
 * delegation semantics (foreground by default, `run_in_background` for a
 * job-owned run) while starting a kind-`zcode` job so the package's own
 * records, completion notices, and panel own the whole lifecycle.
 * @module @deepseek-ai/dsh-subagent-zcode/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JobId, JobOutcome } from '@deepseek-ai/dsh-jobs'
import { resolveChildCwd, type SubagentResult, type SubagentRun } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { ZcodeSessionId } from './brand.ts'
import type { BillingGuard } from './billing.ts'
import { asZcodeHeadlessOutput } from './cli.ts'
import { assertInsideTaskRoots, PLUGIN_NAME, type ResolvedConfig } from './config.ts'
import { ZcodeJobIndex } from './job-index.ts'
import { zcodeLogTailSource } from './log-tail.ts'
import { startZcodeRun, subprocessSources } from './run.ts'
import type { ZcodeRunSpec } from './run.ts'

/** Wire name of the dispatch tool. */
export const DISPATCH_TOOL_NAME = 'zcode_dispatch'

/** Wire name of the follow-up tool. */
export const FOLLOWUP_TOOL_NAME = 'zcode_followup'

/** Wire name of the roster tool. */
export const ROSTER_TOOL_NAME = 'zcode_roster'

/** Longest prompt head kept as the task excerpt. */
const PROMPT_EXCERPT_MAX_CHARS = 120

/** Longest accepted ticket identifier (roster rows and notices stay one-line). */
const TICKET_MAX_CHARS = 64

/**
 * Normalize a caller-supplied ticket identifier.
 * @param value - the raw tool argument, when supplied.
 * @returns the trimmed identifier, or `undefined` when absent or blank.
 * @throws when the trimmed identifier exceeds the one-line budget.
 */
function ticketArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > TICKET_MAX_CHARS) {
    throw new Error(
      `${PLUGIN_NAME}: ticket identifier must be at most ${TICKET_MAX_CHARS} characters: ${trimmed.slice(0, TICKET_MAX_CHARS)}…`,
    )
  }
  return trimmed
}

/** Normalized tool output of a foreground dispatch. */
export interface ForegroundDispatch {
  readonly kind: 'foreground'
  readonly zcodeSessionId: ZcodeSessionId
  readonly response: string
}

/** One-line head of the task prompt for records and notices. */
function promptExcerpt(prompt: string): string {
  const single = prompt.replaceAll(/\s+/gu, ' ').trim()
  return single.length > PROMPT_EXCERPT_MAX_CHARS ? `${single.slice(0, PROMPT_EXCERPT_MAX_CHARS - 1)}…` : single
}

/** A non-`completed` stop reason means the CLI run did not finish cleanly. */
function stopReasonHeadline(stopReason: SubagentResult['stopReason']): string {
  switch (stopReason) {
    case 'aborted':
      return 'zcode run was cancelled'
    case 'error':
      return 'zcode run failed'
    case 'max-tokens':
      return 'zcode run hit its token limit before finishing'
    case 'refusal':
      return 'the zcode subagent declined the task'
    // Merge-extensible union: a backend may add stop reasons. Treat an unknown
    // terminal reason as a failure rather than reporting partial output as success.
    default:
      return `zcode run ended abnormally (${stopReason})`
  }
}

/** Headline plus provider-authored diagnostic for a failed foreground result. */
function failureText(result: SubagentResult): string {
  return result.diagnostic === undefined
    ? stopReasonHeadline(result.stopReason)
    : `${stopReasonHeadline(result.stopReason)}\n${result.diagnostic}`
}

/**
 * Narrow the settled run's structured facts, rejecting a malformed payload.
 * @param result - the settled run result.
 * @returns the headless facts.
 */
function settledFacts(result: SubagentResult) {
  const facts = asZcodeHeadlessOutput(result.structured)
  if (facts === undefined) {
    throw new Error(`${PLUGIN_NAME}: settled zcode run carried no parsable headless facts`)
  }
  return facts
}

/**
 * Settle one background dispatch: map the run result to the job outcome,
 * record the terminal facts, and release the concurrency slot exactly once.
 * @param start - the pending run publication.
 * @param signal - the job-owned cancellation signal.
 * @param jobId - the registry-issued job id.
 * @param index - the package job index.
 * @returns the job outcome (never rejects; the registry forbids it).
 */
export async function settleZcodeJob(
  start: Promise<SubagentRun>,
  signal: AbortSignal,
  jobId: JobId,
  index: ZcodeJobIndex,
): Promise<JobOutcome> {
  try {
    const run = await start
    const result = await run.result
    if (result.stopReason === 'aborted') {
      index.settle(jobId, { status: 'killed', finishedAt: Date.now() })
      return { status: 'killed' }
    }
    if (result.stopReason !== 'completed') {
      const detail = failureText(result)
      index.settle(jobId, { status: 'failed', detail, finishedAt: Date.now() })
      return { status: 'failed', detail }
    }
    const facts = settledFacts(result)
    index.settle(jobId, {
      status: 'completed',
      zcodeSessionId: facts.zcodeSessionId,
      ...(facts.traceId !== undefined ? { traceId: facts.traceId } : {}),
      ...(facts.usage !== undefined ? { usage: facts.usage } : {}),
      finishedAt: Date.now(),
    })
    return { status: 'completed', result: facts.rawStdout }
  } catch (error: unknown) {
    // Startup rejected before publication. Cancellation must not turn a
    // failed cleanup into a cleanly killed job (the shared delegation
    // discipline for aggregated provider failures).
    const killed = signal.aborted && !(error instanceof AggregateError)
    index.settle(jobId, {
      status: killed ? 'killed' : 'failed',
      ...(!killed && error instanceof Error ? { detail: error.message } : {}),
      finishedAt: Date.now(),
    })
    return killed
      ? { status: 'killed' }
      : { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
  } finally {
    index.release()
  }
}

/**
 * Collect and release one foreground run without letting disposal replace an
 * independent result failure.
 * @param run - the published foreground run.
 * @returns the normalized foreground dispatch.
 */
export async function settleForegroundRun(run: SubagentRun): Promise<ForegroundDispatch> {
  const [execution] = await Promise.allSettled([
    run.result.then((result): ForegroundDispatch => {
      if (result.stopReason !== 'completed') {
        throw new Error(failureText(result))
      }
      const facts = settledFacts(result)
      /* jscpd:ignore-start -- the dispose/results discipline mirrors the shared
       * delegation tool's foreground settlement on purpose (same seam contract). */
      return { kind: 'foreground', zcodeSessionId: facts.zcodeSessionId, response: facts.response }
    }),
  ])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    if (disposal.status === 'rejected') {
      throw new AggregateError(
        [execution.reason, disposal.reason],
        `zcode run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`,
      )
    }
    throw execution.reason
  }
  if (disposal.status === 'rejected') throw disposal.reason
  return execution.value
}
/* jscpd:ignore-end */

/**
 * Register the zcode dispatch and follow-up tools.
 * @param ctx - context owning the tool registration.
 * @param config - the resolved deployment config.
 * @param index - the package job index (records and concurrency ledger).
 * @param billing - the first-dispatch billing weak-check guard.
 */
export function registerZcodeTools(ctx: Context, config: ResolvedConfig, index: ZcodeJobIndex, billing: BillingGuard): void {
  const claimOrThrow = (): void => {
    if (!index.claim()) {
      throw new Error(
        `${PLUGIN_NAME}: concurrent zcode task limit reached (active ${index.activeCount}, cap ${config.maxConcurrent})`
          + ' — wait for a running task to settle, dispatch a smaller task, or raise maxConcurrent in cordis.yml',
      )
    }
  }
  const taskCwd = (parent: Agent): string => {
    const cwd = resolveChildCwd(PLUGIN_NAME, undefined, parent.session.header.cwd)
    assertInsideTaskRoots(cwd, config.taskRoots)
    return cwd
  }
  const runSpec = (cwd: string): ZcodeRunSpec => ({
    cwd,
    mode: config.defaultMode,
    disallowedTools: config.disallowedTools,
    cliPath: config.zcodeCliPath,
    builtinProviderConfigPath: config.builtinProviderConfigPath,
    spawn: spawnSpec => ctx.subprocess.spawn(spawnSpec),
  })
  /** Job output sources: live CLI streams plus the observer-only day-log tail. */
  const jobSources = (child: () => SubprocessHandle | undefined) => [
    ...subprocessSources(child),
    zcodeLogTailSource(config.zcodeLogDir, Date.now()),
  ]

  ctx.tools.register(defineTool({
    name: DISPATCH_TOOL_NAME,
    description: 'Dispatch a self-contained one-shot task to a zcode subagent — an independent coding-agent'
      + ' process that runs headless in its own working directory and context. This call waits for the final'
      + ' response by default; with run_in_background it starts a background job, returns its id, and you are'
      + ' notified when it settles (collect the full output with job_output, stop it with job_kill).',
    parameters: {
      description: {
        type: 'string',
        required: true,
        description: 'A short (3-5 word) description of the task, for display and completion notices.',
      },
      ticket: {
        type: 'string',
        description: 'Optional ticket identifier this task belongs to (e.g. "T3"). Shown in the completion notice and zcode_roster.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'The complete, self-contained task for the zcode subagent. It does not share this'
          + ' conversation\'s context, so include everything it needs.',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Run as a background job and return its id (collect with job_output, stop with job_kill).'
          + ' Defaults to false.',
      },
    },
    output: {
      schema: {
        /* jscpd:ignore-start -- the background arm mirrors the shared delegation
         * tool's normalized output so every background job reports alike. */
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'background' },
              jobId: { type: 'string', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'foreground' },
              zcodeSessionId: { type: 'string', required: true },
              response: { type: 'string', required: true },
            },
          },
        ],
        /* jscpd:ignore-end */
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.kind === 'background'
          ? `started background zcode task ${value.jobId}`
          : `${value.response}\n\n(zcode session ${value.zcodeSessionId} — continue it with zcode_followup)`,
      }],
    },
    // The dispatch starts out-of-process work; it never mutates this session.
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (!parent) {
        throw new Error('zcode_dispatch requires a calling agent (exec.agent was undefined)')
      }
      const cwd = taskCwd(parent)
      const prompt: ContentBlock[] = [{ type: 'text', text: args.prompt }]
      const ticket = ticketArg(args.ticket)
      billing.ensureChecked()
      if (args.run_in_background === true) {
        claimOrThrow()
        let child: SubprocessHandle | undefined
        try {
          const jobId = ctx.jobs.start({
            kind: 'zcode',
            label: args.description,
            owner: parent.id,
            output: jobSources(() => child),
            run: (job) => {
              index.register({
                jobId: job.id,
                owner: parent.id,
                ...(ticket !== undefined ? { ticket } : {}),
                label: args.description,
                cwd,
                mode: config.defaultMode,
                round: 'dispatch',
                promptExcerpt: promptExcerpt(args.prompt),
                startedAt: Date.now(),
              })
              const controller = new AbortController()
              const start = startZcodeRun(prompt, controller.signal, runSpec(cwd))
              return {
                cancel: (reason?: string) => {
                  controller.abort(reason ?? 'background zcode task killed')
                },
                done: settleZcodeJob(start, controller.signal, job.id, index),
              }
            },
          })
          return { kind: 'background' as const, jobId }
        } catch (error: unknown) {
          index.release()
          throw error
        }
      }
      claimOrThrow()
      try {
        const run = await startZcodeRun(prompt, exec.signal, runSpec(cwd))
        return await settleForegroundRun(run)
      } finally {
        index.release()
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: ticketArg(args.ticket) === undefined
        ? `Dispatch zcode subagent: ${args.description}`
        : `Dispatch zcode subagent [${ticketArg(args.ticket)}]: ${args.description}`,
      kind: 'execute',
    }),
  }))

  ctx.tools.register(defineTool({
    name: FOLLOWUP_TOOL_NAME,
    description: 'Continue an existing zcode subagent session: send one more prompt to the session identified by'
      + ' `zcode_session_id` (from a zcode_dispatch result, a completion notice, or job_output) as a new background'
      + ' job. The subagent sees its own prior rounds, not this conversation. You are notified when the round'
      + ' settles; collect the full output with job_output.',
    parameters: {
      zcode_session_id: {
        type: 'string',
        required: true,
        description: 'The zcode session id (`sess_…`) to resume.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'The next instruction for the zcode subagent.',
      },
      ticket: {
        type: 'string',
        description: 'Optional ticket identifier this round belongs to (e.g. "T3"). Shown in the completion notice and zcode_roster.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'background' },
          jobId: { type: 'string', required: true },
          zcodeSessionId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `resumed zcode session ${value.zcodeSessionId} as background task ${value.jobId}`,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args, exec) {
      const parent = exec.agent
      if (!parent) {
        throw new Error('zcode_followup requires a calling agent (exec.agent was undefined)')
      }
      const cwd = taskCwd(parent)
      const resume = ZcodeSessionId(args.zcode_session_id)
      const prompt: ContentBlock[] = [{ type: 'text', text: args.prompt }]
      const ticket = ticketArg(args.ticket)
      billing.ensureChecked()
      claimOrThrow()
      let child: SubprocessHandle | undefined
      try {
        const jobId = ctx.jobs.start({
          kind: 'zcode',
          label: promptExcerpt(args.prompt),
          owner: parent.id,
          output: jobSources(() => child),
          run: (job) => {
            index.register({
              jobId: job.id,
              owner: parent.id,
              ...(ticket !== undefined ? { ticket } : {}),
              label: promptExcerpt(args.prompt),
              cwd,
              mode: config.defaultMode,
              round: 'resume',
              zcodeSessionId: resume,
              promptExcerpt: promptExcerpt(args.prompt),
              startedAt: Date.now(),
            })
            const controller = new AbortController()
            const start = startZcodeRun(prompt, controller.signal, { ...runSpec(cwd), resume })
            return {
              cancel: (reason?: string) => {
                controller.abort(reason ?? 'background zcode task killed')
              },
              done: settleZcodeJob(start, controller.signal, job.id, index),
            }
          },
        })
        return Promise.resolve({ kind: 'background' as const, jobId, zcodeSessionId: resume })
      } catch (error: unknown) {
        index.release()
        throw error
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: ticketArg(args.ticket) === undefined
        ? `Resume zcode session ${args.zcode_session_id}`
        : `Resume zcode session [${ticketArg(args.ticket)}]: ${args.zcode_session_id}`,
      kind: 'execute',
    }),
  }))

  ctx.tools.register(defineTool({
    name: ROSTER_TOOL_NAME,
    description: 'List every zcode task this process started: ticket id, round, status, zcode session id,'
      + ' tokens, and timing. Read-only. Use it after a completion notice to review the whole task roster'
      + ' instead of re-reading past notices; records live only for this process lifetime.',
    parameters: {},
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ticket: { type: 'string' },
            jobId: { type: 'string' },
            label: { type: 'string', required: true },
            round: { type: 'string', required: true, enum: ['dispatch', 'resume'] },
            status: { type: 'string', required: true, enum: ['running', 'completed', 'killed', 'failed'] },
            zcodeSessionId: { type: 'string' },
            totalTokens: { type: 'integer' },
            startedAt: { type: 'integer', required: true },
            finishedAt: { type: 'integer' },
            cwd: { type: 'string', required: true },
          },
        },
      },
      render: (_args, rows) => [{
        type: 'text',
        text: rows.length === 0
          ? '(no zcode tasks yet)'
          : rows.map(row => [
            row.ticket === undefined ? '—' : row.ticket,
            `[${row.status}]`,
            row.round,
            row.label,
            ...(row.zcodeSessionId === undefined ? [] : [row.zcodeSessionId]),
            ...(row.totalTokens === undefined ? [] : [`${row.totalTokens} tokens`]),
          ].join(' ')).join('\n'),
      }],
    },
    isConcurrencySafe: () => true,
    // oxlint-disable-next-line typescript/require-await -- the tool signature requires an async execute
    async execute() {
      return index.list().map((record) => {
        const row: {
          label: string
          round: 'dispatch' | 'resume'
          status: 'running' | 'completed' | 'killed' | 'failed'
          startedAt: number
          cwd: string
          ticket?: string
          jobId?: string
          zcodeSessionId?: string
          totalTokens?: number
          finishedAt?: number
        } = {
          label: record.label,
          round: record.round,
          status: record.settlement?.status ?? 'running',
          startedAt: record.startedAt,
          cwd: record.cwd,
        }
        const ticket = record.ticket
        if (ticket !== undefined) row.ticket = ticket
        const jobId = record.jobId
        if (jobId !== undefined) row.jobId = jobId
        const session = record.settlement?.zcodeSessionId ?? record.zcodeSessionId
        if (session !== undefined) row.zcodeSessionId = session
        const tokens = record.settlement?.usage?.totalTokens
        if (tokens !== undefined) row.totalTokens = tokens
        const finishedAt = record.settlement?.finishedAt
        if (finishedAt !== undefined) row.finishedAt = finishedAt
        return row
      })
    },
    presentCall: () => ({
      card: 'generic',
      title: 'zcode task roster',
      kind: 'execute',
    }),
  }))
}
