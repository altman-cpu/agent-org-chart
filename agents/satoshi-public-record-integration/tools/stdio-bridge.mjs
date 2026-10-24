#!/usr/bin/env node
// Local JSON Lines bridge. It accepts only allowlisted validation/status actions.
// stdout is protocol-only; diagnostics are written to stderr. No network calls are made.
import { createInterface } from 'node:readline'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const webRoot = resolve(repoRoot, 'web')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'agent.json'), 'utf8'))
const maxLineBytes = 16 * 1024

const commandByAction = new Map([
  ['validate:charts', ['scripts/validate-charts.mjs']],
  ['validate:api', ['scripts/validate-api-payloads.mjs']],
  ['simulate:api', ['scripts/validate-api-payloads.mjs', '--cycles=10']],
])

function emit(event) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: '1.0', ...event })}\n`)
}

function alert(requestId, code, message) {
  emit({ event: 'alert', requestId, ok: false, code, message })
}

function parseRequest(line) {
  if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
    return { error: ['request_too_large', `Request exceeds ${maxLineBytes} bytes.`] }
  }

  let request
  try {
    request = JSON.parse(line)
  } catch {
    return { error: ['invalid_json', 'Input line must contain one valid JSON object.'] }
  }

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { error: ['invalid_request', 'Request must be a JSON object.'] }
  }

  const keys = Object.keys(request).sort()
  if (keys.length !== 2 || keys[0] !== 'action' || keys[1] !== 'requestId') {
    return { error: ['invalid_request', 'Request must contain only requestId and action.'] }
  }
  if (typeof request.requestId !== 'string' || request.requestId.length < 1 || request.requestId.length > 128) {
    return { error: ['invalid_request_id', 'requestId must be a non-empty string of at most 128 characters.'] }
  }
  if (typeof request.action !== 'string') {
    return { error: ['invalid_action', 'action must be a string.'] }
  }

  return { request }
}

function outputSummary(stdout) {
  const summaryLines = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('✓') || /^\d+\/\d+ /.test(line) || line.startsWith('Local-only simulation complete.'))
    .slice(0, 30)
  return summaryLines.length > 0 ? summaryLines : ['Local validation command completed.']
}

function runAction(request) {
  const { requestId, action } = request
  const availableActions = ['integration:status', ...commandByAction.keys()]
  if (!availableActions.includes(action)) {
    alert(requestId, 'unsupported_action', 'Action is not allowlisted. No command was run.')
    return false
  }

  emit({ event: 'status', requestId, action, status: 'started' })

  if (action === 'integration:status') {
    emit({
      event: 'result',
      requestId,
      action,
      ok: true,
      data: {
        businessApi: manifest.integrations.businessReadOnly.status,
        providerCalls: false,
        bookingWrites: false,
        scienceReview: manifest.integrations.scienceEvidenceReview.conclusion,
        identity: 'public-record specialist; not Satoshi Nakamoto',
      },
    })
    return true
  }

  const args = commandByAction.get(action)
  const result = spawnSync(process.execPath, args, {
    cwd: webRoot,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  })

  if (result.stderr?.trim()) {
    process.stderr.write(`[${requestId}] ${result.stderr.trim()}\n`)
  }

  if (result.error || result.status !== 0) {
    const exitCode = Number.isInteger(result.status) ? result.status : null
    const reason = result.error?.message ?? `Child process exited with status ${String(result.status)}.`
    process.stderr.write(`[${requestId}] ${reason}\n`)
    emit({
      event: 'alert',
      requestId,
      action,
      ok: false,
      code: 'local_check_failed',
      exitCode,
      message: 'The local check failed; see standard error for diagnostics.',
      summary: outputSummary(result.stdout ?? ''),
    })
    return false
  }

  emit({
    event: 'result',
    requestId,
    action,
    ok: true,
    exitCode: 0,
    summary: outputSummary(result.stdout ?? ''),
  })
  return true
}

let failed = false
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of input) {
  if (line.length === 0) continue
  const parsed = parseRequest(line)
  if (parsed.error) {
    const [code, message] = parsed.error
    alert(null, code, message)
    failed = true
    continue
  }
  if (!runAction(parsed.request)) failed = true
}

if (failed) process.exitCode = 1
