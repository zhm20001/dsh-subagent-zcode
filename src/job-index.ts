/**
 * Package-owned, process-local record of every zcode task this plugin
 * started: the facts the generic job registry deliberately does not carry
 * (zcode session id, trace, usage, task directory, prompt excerpt) plus the
 * process-wide concurrency ledger. In-memory by design — the durable resume
 * handle is the zcode session id inside the session log, not this index.
 * @module @deepseek-ai/dsh-subagent-zcode/job-index
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { JobId } from '@deepseek-ai/dsh-jobs'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ZcodeSessionId } from './brand.ts'
import type { ZcodeMode } from './config.ts'
import type { ZcodeUsage } from './cli.ts'

/** Terminal facts of one zcode task. */
export interface ZcodeJobSettlement {
  /** How the run ended. */
  readonly status: 'completed' | 'killed' | 'failed'
  /** The zcode session id, known when the CLI produced a parseable result. */
  readonly zcodeSessionId?: ZcodeSessionId
  /** Per-process trace id, when reported. */
  readonly traceId?: string
  /** Token accounting, when reported. */
  readonly usage?: ZcodeUsage
  /** Terminal reason (exit code plus stderr tail) for a failed or killed run. */
  readonly detail?: string
  /** Epoch ms of settlement. */
  readonly finishedAt: number
}

/** One recorded zcode task: identity, authority posture, and settlement facts. */
export interface ZcodeJobRecord {
  /** The registry-issued job id; absent for a foreground run (no job). */
  readonly jobId?: JobId
  /** Owning session, when dispatched on behalf of an agent. */
  readonly owner?: SessionId
  /** Caller-supplied ticket identifier shown in notices and the roster (e.g. `T3`). */
  readonly ticket?: string
  /** The model-facing short description (the job label). */
  readonly label: string
  /** Resolved task directory. */
  readonly cwd: string
  /** Permission mode the task ran with. */
  readonly mode: ZcodeMode
  /** Whether the run minted a session (`dispatch`) or resumed one (`resume`). */
  readonly round: 'dispatch' | 'resume'
  /** The resumed zcode session id, known from dispatch time for resume rounds. */
  readonly zcodeSessionId?: ZcodeSessionId
  /** Head of the task prompt, for notices and panel rows. */
  readonly promptExcerpt: string
  /** Epoch ms of registration. */
  readonly startedAt: number
  /** Terminal facts, present once settled. */
  readonly settlement?: ZcodeJobSettlement
}

/**
 * The `ctx.zcodeJobs` service: records and the concurrency ledger. Register
 * a record before its job can settle, settle exactly once per task, and claim
 * a concurrency slot synchronously around starting work.
 */
export class ZcodeJobIndex extends Service {
  private readonly records = new Map<JobId, ZcodeJobRecord>()
  private active = 0

  /**
   * @param ctx - owning context; the instance registers as `zcodeJobs`.
   * @param maxConcurrent - the resolved process-level concurrency cap.
   */
  constructor(
    ctx: Context,
    private readonly maxConcurrent: number,
  ) {
    super(ctx, 'zcodeJobs')
  }

  /**
   * Record a task at start.
   * @param record - the task facts known at dispatch time.
   */
  register(record: ZcodeJobRecord): void {
    if (record.jobId !== undefined) this.records.set(record.jobId, record)
  }

  /**
   * Merge terminal facts into one recorded task.
   * @param jobId - the settled job.
   * @param settlement - the terminal facts.
   */
  settle(jobId: JobId, settlement: ZcodeJobSettlement): void {
    const record = this.records.get(jobId)
    if (record === undefined) {
      // Every job settles after its own register() in this process; a miss
      // means the plugin fiber was disposed mid-job — the record is gone with
      // it, and throwing here would flip an already-terminal job to failed.
      this.ctx.logger.warn(`subagent-zcode: settlement for untracked job ${jobId}`)
      return
    }
    if (record.settlement !== undefined) return
    this.records.set(jobId, { ...record, settlement })
  }

  /**
   * Claim one concurrency slot (synchronous, so a claim-and-start pair is
   * atomic against other dispatchers on this thread).
   * @returns `false` when the configured cap is already reached.
   */
  claim(): boolean {
    if (this.active >= this.maxConcurrent) return false
    this.active += 1
    return true
  }

  /** Release one claimed slot (the claim order owns exactly one release). */
  release(): void {
    if (this.active > 0) this.active -= 1
  }

  /** Currently claimed slots (running plus stopping tasks). */
  get activeCount(): number {
    return this.active
  }

  /**
   * Snapshot one recorded task.
   * @param jobId - the job to look up.
   * @returns the record, or `undefined` for an unknown id.
   */
  get(jobId: JobId): ZcodeJobRecord | undefined {
    return this.records.get(jobId)
  }

  /**
   * Snapshot every recorded task in registration order.
   * @returns fresh record copies.
   */
  list(): ZcodeJobRecord[] {
    return [...this.records.values()]
  }
}
