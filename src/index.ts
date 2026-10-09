/**
 * Profile-named zcode subagent plugin: registers the `zcode` provider on
 * `ctx.subagents`, the package job index on `ctx.zcodeJobs`, and the
 * `zcode_dispatch` model tool. Every contribution is an effect of this
 * plugin fiber; disposing it unregisters the provider, the tools, the
 * controller, and the index.
 * @module @deepseek-ai/dsh-subagent-zcode
 */

import type { Context } from '@deepseek-ai/cordis'
import { createBillingGuard } from './billing.ts'
import { Config, resolveConfig } from './config.ts'
import { ZcodeJobIndex } from './job-index.ts'
import { registerZcodeNoticeListener } from './notice.ts'
import { ZcodeProvider } from './provider.ts'
import { registerZcodeTools } from './tools.ts'

export const name = 'subagent-zcode'
export const inject = ['subagents', 'subprocess', 'tools', 'jobs']
export { Config }

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    /** One zcode CLI child process, dispatch or `--resume` round. */
    zcode: 'zcode'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** This package's zcode task records and concurrency ledger. */
    zcodeJobs: ZcodeJobIndex
  }
}

/**
 * Register one zcode subagent composition.
 * @param ctx - context carrying the subagent registry, subprocess seam, tool
 * registry, and job registry.
 * @param config - the deployment config; validated here, at load.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.jobs.attachController('subagent-zcode')
  const index = new ZcodeJobIndex(ctx, resolved.maxConcurrent)
  const billing = createBillingGuard(resolved.zcodeDbPath, resolved.expectedProviderIds)
  ctx.subagents.registerProvider(new ZcodeProvider(ctx, resolved))
  registerZcodeNoticeListener(ctx, resolved, index)
  registerZcodeTools(ctx, resolved, index, billing)
}
