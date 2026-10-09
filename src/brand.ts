/**
 * Owned opaque ids of the zcode subagent seam.
 * @module @deepseek-ai/dsh-subagent-zcode/brand
 */

import { Branded } from '@deepseek-ai/dsh-brand'

/** A zcode session id minted by the zcode CLI (`sess_…`, stable across `--resume` rounds). */
export type ZcodeSessionId = Branded<'ZcodeSessionId'>

/**
 * Brand a validated zcode session id.
 * @param value - the `sess_…` string reported by the CLI.
 * @returns the branded id.
 */
export function ZcodeSessionId(value: string): ZcodeSessionId {
  return value as ZcodeSessionId
}
