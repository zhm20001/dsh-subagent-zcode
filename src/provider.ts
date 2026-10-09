/**
 * The `zcode` SubagentProvider: the standard registry face of the zcode CLI
 * backend, shaped like the codex and claude-code siblings. One start is one
 * headless `zcode -p … --json` process; there is no continuable capability.
 * @module @deepseek-ai/dsh-subagent-zcode/provider
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  NO_START_CAPABILITIES,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import { assertInsideTaskRoots, PLUGIN_NAME, type ResolvedConfig } from './config.ts'
import { startZcodeRun } from './run.ts'

/* jscpd:ignore-start -- sibling out-of-process providers intentionally share
 * the advertisement/start shape without a shared config owner. */

/**
 * The registry provider for the zcode CLI backend. The package's own
 * `zcode_dispatch` tool drives the same runner directly (it needs the parsed
 * headless facts and the `--resume` round channel that the shared provider
 * request has no field for); this face keeps the backend available to any
 * tool-subagent composition row like every other out-of-process backend.
 */
export class ZcodeProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  readonly name = 'zcode'

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest) {
    const cwd = resolveChildCwd(PLUGIN_NAME, undefined, request.parent.session.header.cwd)
    assertInsideTaskRoots(cwd, this.config.taskRoots)
    return startZcodeRun(request.prompt, request.signal, {
      cwd,
      mode: this.config.defaultMode,
      disallowedTools: this.config.disallowedTools,
      cliPath: this.config.zcodeCliPath,
      builtinProviderConfigPath: this.config.builtinProviderConfigPath,
      spawn: spawnSpec => this.ctx.subprocess.spawn(spawnSpec),
      onError: (error, stopReason) => {
        this.ctx.logger.warn(`subagent-zcode: child run failed (${stopReason}): %o`, error)
      },
    })
  }
}
/* jscpd:ignore-end */
