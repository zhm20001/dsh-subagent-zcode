/**
 * Completion notices for kind-`zcode` jobs. A settled zcode task returns to
 * its owning session as one persistent UserMessage (source kind
 * `zcode-jobs`): idle owners are woken with a follow-up turn under the
 * default `followup` delivery, busy owners are injected, and the
 * `maxConsecutiveWakes` budget degrades repeated self-exciting wakes to
 * injection until user-authored input refills it. Kill settlements notify
 * like any other — the job_kill result and the notice report the same fact.
 * @module @deepseek-ai/dsh-subagent-zcode/notice
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { JobView } from '@deepseek-ai/dsh-jobs'
import type { ResolvedConfig } from './config.ts'
import type { ZcodeJobIndex, ZcodeJobRecord } from './job-index.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Completion notice of one zcode CLI task. */
    'zcode-jobs': { kind: 'zcode-jobs' } & ContextFormed
  }
}

/** Longest first line of a terminal reason carried in a notice. */
const NOTICE_DETAIL_MAX_CHARS = 120

/** One-line status with the first line of the terminal reason, when present. */
function statusLine(job: JobView): string {
  if (job.detail === undefined) return job.status
  const newlineAt = job.detail.indexOf('\n')
  const firstLine = newlineAt === -1 ? job.detail : job.detail.slice(0, newlineAt)
  const reason = firstLine.length > NOTICE_DETAIL_MAX_CHARS
    ? `${firstLine.slice(0, NOTICE_DETAIL_MAX_CHARS - 1)}…`
    : firstLine
  return `${job.status} (${reason})`
}

/**
 * Compose the collapsed-row summary of one settled zcode task.
 * @param job - the settled job projection.
 * @param record - the package-recorded task, when tracked.
 * @returns the bounded notice summary.
 */
export function noticeSummary(job: JobView, record?: ZcodeJobRecord): string {
  const who = record?.ticket === undefined ? job.label : `ticket ${record.ticket}`
  return boundContextSummary(`zcode ${who} ${statusLine(job)}`)
}

/**
 * Compose the notice body for one settled zcode task.
 * @param job - the settled job projection.
 * @param record - the package-recorded task, when tracked.
 * @returns the full notice text (state, task label, session, usage, action).
 */
export function noticeText(job: JobView, record?: ZcodeJobRecord): string {
  const who = record?.ticket === undefined
    ? `zcode task ${job.id} (${job.label})`
    : `zcode ticket ${record.ticket} — task ${job.id} (${job.label})`
  const lines = [`${who} finished ${statusLine(job)}.`]
  const settlement = record?.settlement
  if (settlement?.zcodeSessionId !== undefined) {
    const usage = settlement.usage
    const tokens = usage === undefined
      ? undefined
      : `tokens ${usage.inputTokens ?? '?'} in / ${usage.outputTokens ?? '?'} out (${usage.totalTokens ?? '?'} total)`
    lines.push(`zcode session ${settlement.zcodeSessionId}${tokens === undefined ? '' : `, ${tokens}`}.`)
  }
  lines.push('Full output: job_output.')
  return lines.join('\n')
}

/**
 * Register the settlement listener and the wake-budget refill. Skips
 * non-settled events, settlements a live `job_output` wait already collected
 * (`awaited`), and teardown settlements — a destroyed owner has no reader.
 * Kill settlements notify like any other settlement.
 * @param ctx - context owning the subscription (scoped to its composition).
 * @param config - the resolved deployment config (delivery mode and budget).
 * @param index - the package job index supplying the terminal facts.
 */
export function registerZcodeNoticeListener(ctx: Context, config: ResolvedConfig, index: ZcodeJobIndex): void {
  // Turns this plugin opened on each owner since that owner last consumed
  // human input. Keyed by the exact Agent, so a same-session replacement
  // starts with a full budget.
  const spentWakes = new WeakMap<Agent, number>()
  const wakeBudget = config.maxConsecutiveWakes
  if (config.completionDelivery === 'followup' && wakeBudget !== undefined) {
    ctx.on('agent/inbox/claimed', ({ agent, message }) => {
      // Claiming is the point the human's input actually enters a step; a
      // notice this plugin itself queued must not refill the budget it spent.
      if (message.source.kind === 'user') spentWakes.delete(agent)
    })
  }

  ctx.jobs.events.subscribe({ owners: 'scope' }, (event) => {
    if (event.type !== 'settled') return
    if (event.awaited || event.cause === 'teardown') return
    if (event.job.kind !== 'zcode') return
    const ownerSession = event.job.owner
    if (ownerSession === undefined) return
    const owner = ctx.get('agents')?.get(ownerSession)
    /* v8 ignore next -- the registry only starts jobs for live agents; their disposal settles as teardown and is skipped above */
    if (owner === undefined) return
    const record = index.get(event.job.id)
    const message = createUserMessage({
      content: [{
        type: 'text',
        text: noticeText(event.job, record),
      }],
      source: {
        kind: 'zcode-jobs',
        form: 'notice',
        summary: noticeSummary(event.job, record),
      },
    })
    /* jscpd:ignore-start -- the delivery ladder mirrors the shared job
     * notifier's discipline on purpose (same seam contract, different payload). */
    if (config.completionDelivery === 'followup' && owner.status === 'idle') {
      if (wakeBudget === undefined) {
        owner.followup(message)
        return
      }
      const spent = spentWakes.get(owner) ?? 0
      if (spent < wakeBudget) {
        spentWakes.set(owner, spent + 1)
        owner.followup(message)
        return
      }
    }
    owner.inject(message)
    /* jscpd:ignore-end */
  })
}
