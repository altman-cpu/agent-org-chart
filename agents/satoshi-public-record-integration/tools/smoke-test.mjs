#!/usr/bin/env node
// Exercise the JSON Lines bridge and assert stdout remains protocol-only.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolsRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(toolsRoot, '../../..')
const bridgePath = resolve(toolsRoot, 'stdio-bridge.mjs')
const webRoot = resolve(repoRoot, 'web')
const requests = [
  { requestId: 'status-1', action: 'integration:status' },
  { requestId: 'charts-1', action: 'validate:charts' },
  { requestId: 'api-1', action: 'validate:api' },
  { requestId: 'simulation-1', action: 'simulate:api' },
  { requestId: 'blocked-1', action: 'run-arbitrary-command' },
]
const input = `${requests.map(request => JSON.stringify(request)).join('\n')}\n`
const child = spawnSync(process.execPath, [bridgePath], {
  cwd: webRoot,
  input,
  encoding: 'utf8',
  timeout: 180_000,
  maxBuffer: 2 * 1024 * 1024,
  windowsHide: true,
})

assert.equal(child.error, undefined, child.error?.message)
assert.equal(child.status, 1, 'An unsupported action should be reported and return a nonzero status.')
assert.equal(child.stderr, '', `Unexpected stderr during successful local checks: ${child.stderr}`)

const lines = child.stdout.trim().split(/\r?\n/)
const events = lines.map((line, index) => {
  try {
    return JSON.parse(line)
  } catch {
    assert.fail(`stdout line ${index + 1} was not JSON: ${line}`)
  }
})

assert.equal(events.length, 9, 'Expected start/result events for four supported requests and one alert for the blocked action.')
for (const request of requests.slice(0, 4)) {
  const requestEvents = events.filter(event => event.requestId === request.requestId)
  assert.deepEqual(requestEvents.map(event => event.event), ['status', 'result'])
  assert.equal(requestEvents[0].action, request.action)
  assert.equal(requestEvents[1].ok, true)
}

const simulation = events.find(event => event.requestId === 'simulation-1' && event.event === 'result')
assert(simulation.summary.some(line => line.includes('1000/1000')), 'Simulation result should expose the 1,000-case summary.')
const blocked = events.find(event => event.requestId === 'blocked-1')
assert.equal(blocked.event, 'alert')
assert.equal(blocked.code, 'unsupported_action')

process.stdout.write(`${JSON.stringify({ ok: true, protocol: 'JSON Lines', events: events.length, arbitraryCommandsBlocked: true })}\n`)
