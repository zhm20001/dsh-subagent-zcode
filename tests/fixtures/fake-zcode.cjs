#!/usr/bin/env node
'use strict'
/**
 * Scriptable fake of the zcode CLI headless surface for behavior tests.
 * Behavior is selected with FAKE_ZCODE_BEHAVIOR (`ok` by default):
 * - `ok`             print the 7-key JSON result and exit 0
 * - `fail-exit`      write FAKE_ZCODE_STDERR to stderr and exit FAKE_ZCODE_EXIT_CODE (default 3)
 * - `bad-json`       print a non-JSON line and exit 0
 * - `not-object`     print a JSON array and exit 0
 * - `missing-session` print a JSON object without `sessionId` and exit 0
 * - `bad-response`   print a JSON object whose `response` is a number and exit 0
 * - `empty-stdout`   print nothing and exit 0
 * FAKE_ZCODE_DELAY_MS delays the behavior to keep a run in flight.
 * FAKE_ZCODE_RESPONSE overrides the final message; FAKE_ZCODE_SESSION_ID
 * overrides the minted session id for fresh dispatches.
 */

const args = process.argv.slice(2)

function flagValue(name) {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

const behavior = process.env.FAKE_ZCODE_BEHAVIOR ?? 'ok'
const delay = Number(process.env.FAKE_ZCODE_DELAY_MS ?? '0')
const resume = flagValue('--resume')
const sessionId = resume ?? process.env.FAKE_ZCODE_SESSION_ID ?? 'sess_fake-00000000-0000-4000-8000-000000000000'

setTimeout(() => {
  if (behavior === 'fail-exit') {
    process.stderr.write(process.env.FAKE_ZCODE_STDERR ?? 'boom: quota exhausted\n')
    process.exit(Number(process.env.FAKE_ZCODE_EXIT_CODE ?? '3'))
  }
  if (behavior === 'bad-json') {
    if (process.env.FAKE_ZCODE_STDERR) process.stderr.write(process.env.FAKE_ZCODE_STDERR)
    process.stdout.write('not json at all\n')
    process.exit(0)
  }
  if (behavior === 'not-object') {
    process.stdout.write('[1, 2]\n')
    process.exit(0)
  }
  if (behavior === 'missing-session') {
    process.stdout.write(JSON.stringify({ response: 'ok' }))
    process.exit(0)
  }
  if (behavior === 'bad-response') {
    process.stdout.write(JSON.stringify({ sessionId: 'sess_x', response: 42 }))
    process.exit(0)
  }
  if (behavior === 'empty-stdout') {
    process.exit(0)
  }
  const usage = {
    source: 'provider',
    modelRequestCount: 2,
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    cacheReadTokens: 64,
    cacheWriteTokens: 8,
    reasoningTokens: 0,
    webFetchRequests: 0,
    webSearchRequests: 0,
  }
  const prompt = flagValue('-p') ?? ''
  const output = {
    sessionId,
    traceId: 'trace_fake-1',
    turnId: 'turn_fake-1',
    response: process.env.FAKE_ZCODE_RESPONSE ?? `ok (${prompt})`,
    usage,
    eventCount: 4,
    projection: { status: 'idle', turnCount: 1, totalTokenCount: 120, contextUsed: 120, contextWindow: 200000 },
  }
  process.stdout.write(JSON.stringify(output))
  process.exit(0)
}, delay)
