// Genesis telemetry batch validator — deterministic, local-only, no network.
// Generates the SAME 100 fixtures + 100 requests as web/src/lib/telemetry.ts
// (FNV-1a seed + mulberry32 stream are mirrored on purpose), validates them
// against schemas/genesis-telemetry.schema.json, checks the registered
// transcript multi-sig payload and its threshold run, and rejects unsafe cases.
// Usage: node scripts/validate-genesis-fixtures.mjs [--write] (--write saves
// scripts/fixtures/genesis-telemetry-100.json for later work)
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webRoot, '..')
const schema = JSON.parse(readFileSync(resolve(repoRoot, 'schemas/genesis-telemetry.schema.json'), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

// --- mirrored deterministic core (keep in sync with src/lib/telemetry.ts) ---
const HEX = '0123456789abcdef'
function fnv1a(input) {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hexFromRng = (rng, len) => Array.from({ length: len }, () => HEX[Math.floor(rng() * 16)]).join('')
const mockHashFromString = s => '0xKEY_' + hexFromRng(mulberry32(fnv1a(s)), 40)
class Harness {
  constructor(seed = 123456789) { this.rng = mulberry32(seed) }
  mockAddress(prefix = '0xKEY_') { return prefix + hexFromRng(() => this.rng(), 40) }
  generateTransaction(sender, recipient, baseAmount, status = 'CONFIRMED', timestamp = 1792892079596) {
    const mockHash = this.mockAddress('tx_')
    return {
      transactionId: mockHash, senderAddress: sender, recipientAddress: recipient,
      amount: baseAmount * 100, gasFee: Math.floor(this.rng() * 50) * 100,
      timestamp, status, signature: `sig_det_${mockHash.substring(3, 15)}`,
    }
  }
  compileMockBlock(blockNumber, txCount, injectFailures = false) {
    const sender = this.mockAddress('0xGENESIS_')
    const transactions = Array.from({ length: txCount }, (_, i) => {
      const status = !injectFailures ? 'CONFIRMED' : i % 10 === 9 ? 'FAILED' : i % 10 === 4 ? 'PENDING' : 'CONFIRMED'
      return this.generateTransaction(sender, this.mockAddress(), 5000, status)
    })
    return { blockNumber, merkleRoot: this.mockAddress('root_'), transactions }
  }
}
function generate100Fixtures(seed = 888888) {
  const h = new Harness(seed); const sender = h.mockAddress('0xGENESIS_')
  return Array.from({ length: 100 }, (_, i) => {
    const kind = i % 25 === 24 ? 'multisig' : i % 10 === 9 ? 'failure-injected' : i % 10 === 0 ? 'zero-balance' : i % 7 === 3 ? 'high-throughput' : 'transaction'
    const status = kind === 'failure-injected' ? (i % 20 === 9 ? 'FAILED' : 'PENDING') : 'CONFIRMED'
    return {
      caseId: `genesis-fixture-${String(i + 1).padStart(3, '0')}`, kind, protocol: 'ABI_API_1',
      transaction: h.generateTransaction(sender, h.mockAddress(), kind === 'zero-balance' ? 0 : 100 + i * 10, status),
      expected: { valid: true, amountScaledBy100: true },
    }
  })
}
function generate100Requests(seed = 888888) {
  const h = new Harness(seed ^ 0x9e3779b9)
  const ops = ['simulate.transfer', 'simulate.multisig.sign', 'simulate.block.compile', 'simulate.cache.collect']
  return Array.from({ length: 100 }, (_, i) => {
    const baseAmount = 50 + i * 5
    return {
      requestId: mockHashFromString(`genesis-request-${seed}-${i}`), operation: ops[i % ops.length],
      protocol: 'ABI_API_1', idempotencyKey: mockHashFromString(`genesis-idem-${seed}-${i}`),
      params: { from: h.mockAddress(), to: h.mockAddress(), baseAmount, amount: baseAmount * 100 },
    }
  })
}

// Registered transcript payload — asserted verbatim, never regenerated.
const TRANSCRIPT_MULTISIG = {
  multiSigTxId: 'mstx_fb941390f680f37d8cc0084e15e0212194ac9bf1', requiredSignatures: 2, totalConfiguredSigners: 3,
  signersMatrix: [
    '0xKEY_cdd2201a1affbb21047141fbcd780d6225db88b4',
    '0xKEY_6668d05cd33abccbdb4aebdb4ae1c00d2d793c31',
    '0xKEY_663ca9a5d1ebf7cc0cd0fe74e51ab6d7b030eac3',
  ],
  amount: 250000, gasFee: 3500,
  signaturePayloads: [{ signerAddress: '0xKEY_cdd2201a1affbb21047141fbcd780d6225db88b4', signature: 'sig_det_auth_246171e29fd2', timestamp: 1792892079596 }],
  payloadState: 'PENDING SIGNATURES',
}

const batch = {
  protocol: 'ABI_API_1',
  truthAnchor: 'ABI_API_1LOOKATCODEATNO-ONEHADTHEABSOLUTETRUTHEXCEPTFORMYSELF',
  simulation: true,
  fixtures: generate100Fixtures(),
  requests: generate100Requests(),
  multiSig: TRANSCRIPT_MULTISIG,
  block: new Harness(888888).compileMockBlock(1001, 5),
}
if (!validate(batch)) {
  console.error('✗ Genesis batch failed schema validation')
  for (const e of validate.errors ?? []) console.error(`  ${e.instancePath || '/'} ${e.message}`)
  process.exit(1)
}
console.log('✓ 100/100 genesis fixtures valid (incl. zero-balance, high-throughput, failure-injected)')
console.log('✓ 100/100 genesis request payloads valid and distinct')
if (new Set(batch.requests.map(r => r.requestId)).size !== 100) { console.error('✗ requestIds not distinct'); process.exit(1) }

// Determinism: regenerating must be byte-identical.
if (JSON.stringify(generate100Fixtures()) !== JSON.stringify(batch.fixtures)) { console.error('✗ fixtures are not deterministic'); process.exit(1) }
console.log('✓ deterministic: regeneration byte-identical (seed 888888)')

// Threshold run on the registered payload: 1/2 -> next signer -> 2/2.
const run = structuredClone(TRANSCRIPT_MULTISIG)
const signed = new Set(run.signaturePayloads.map(s => s.signerAddress))
const next = run.signersMatrix.find(s => !signed.has(s))
run.signaturePayloads.push({ signerAddress: next, signature: `sig_det_auth_${mockHashFromString(`${run.multiSigTxId}:${next}`).slice(6, 18)}`, timestamp: 1792892079596 + 120000 })
run.payloadState = run.signaturePayloads.length >= run.requiredSignatures ? 'THRESHOLD MET (SIMULATED)' : 'PENDING SIGNATURES'
if (!validate({ ...batch, multiSig: run })) { console.error('✗ threshold-met multi-sig failed validation'); process.exit(1) }
console.log(`✓ transcript multi-sig ${run.multiSigTxId.slice(0, 14)}… threshold run: 1/2 → 2/2 ${run.payloadState}`)

// Unsafe / malformed variants must be rejected by the schema.
const bad = [
  b => { b.fixtures[0].transaction.recipientAddress = '0x123' },                       // not 0xKEY_<40 hex>
  b => { b.fixtures[0].transaction.amount = 150 },                                     // not base x 100
  b => { b.requests[0].operation = 'live.transfer' },                                  // live op, not simulate.*
  b => { b.multiSig.signersMatrix[1] = b.multiSig.signersMatrix[0] },                  // duplicate signer
  b => { b.fixtures[0].transaction.privateKey = 'nope' },                              // credential field
  b => { b.simulation = false },                                                       // must stay simulation:true
]
for (const [i, mutate] of bad.entries()) {
  const copy = structuredClone(batch); mutate(copy)
  if (validate(copy)) { console.error(`✗ safety case ${i + 1} was unexpectedly accepted`); process.exit(1) }
}
console.log(`✓ ${bad.length}/${bad.length} unsafe variants rejected`)

if (process.argv.includes('--write')) {
  const out = resolve(webRoot, 'scripts/fixtures/genesis-telemetry-100.json')
  writeFileSync(out, JSON.stringify(batch, null, 2) + '\n')
  console.log(`✓ saved batch for later work → ${out}`)
}
console.log('Local-only. No chain, bank, GitHub, or marketplace calls were made.')
