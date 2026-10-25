// Genesis cyber-telemetry core — deterministic, zero-dependency, simulation-only.
//
// Everything in this file is a local mock/simulation. It makes no network calls,
// holds no keys, moves no money, and connects to no bank, chain, or marketplace.
// Amounts follow the enterprise rule from the original harness: base * 100.
// Canonical hash string format: `0xKEY_<40 lowercase hex>` (written `0x_KEY`
// in prose). Mock hashes are deterministic PRNG output — they are stable for
// tests but are NOT cryptographic proofs. Document-registry hashes in the UI
// use real SHA-256 (SubtleCrypto) over the document text, same prefix format.

export const HASH_PREFIX = '0xKEY_'
export const HASH_RE = /^0xKEY_[0-9a-f]{40}$/
export const PROTOCOL_ID = 'ABI_API_1'
export const TRUTH_ANCHOR = 'ABI_API_1LOOKATCODEATNO-ONEHADTHEABSOLUTETRUTHEXCEPTFORMYSELF'
export const GOLD_MULTIPLIER = 10000
export const LOG_CADENCE_MS = 2200
export const REGISTRY_STORAGE_KEY = 'genesis.telemetry.registry.v1'

/** FNV-1a 32-bit — stable string seed (same algorithm mirrored in the Node validator). */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small deterministic PRNG. Same seed ⇒ same stream, every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HEX = '0123456789abcdef'
export function hexFromRng(rng: () => number, len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += HEX[Math.floor(rng() * 16)]
  return out
}

/** Deterministic mock hash string for any input: `0xKEY_<40 hex>`. */
export function mockHashFromString(input: string): string {
  return HASH_PREFIX + hexFromRng(mulberry32(fnv1a(input)), 40)
}

/** Real content hash for registry documents: SHA-256(text), truncated, `0xKEY_` format. */
export async function sha256Key(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  return HASH_PREFIX + hex.slice(0, 40)
}

// ---------------------------------------------------------------------------
// Transaction / ledger mock harness (the original CryptoAutomationHarness,
// same public API, with a stronger deterministic PRNG than Math.sin)
// ---------------------------------------------------------------------------

export type FinancialUnit = number // base * 100
export type TxStatus = 'CONFIRMED' | 'PENDING' | 'FAILED'

export interface TransactionMock {
  transactionId: string
  senderAddress: string
  recipientAddress: string
  amount: FinancialUnit
  gasFee: FinancialUnit
  timestamp: number
  status: TxStatus
  signature: string
}

export interface LedgerState {
  blockNumber: number
  merkleRoot: string
  transactions: TransactionMock[]
}

export class CryptoAutomationHarness {
  private rng: () => number
  readonly seed: number
  constructor(seed = 123456789) {
    this.seed = seed
    this.rng = mulberry32(seed)
  }
  private nextRandom(): number {
    return this.rng()
  }
  /** Standardized mock address. Default prefix is the canonical `0xKEY_`. */
  public mockAddress(prefix: string = HASH_PREFIX): string {
    return prefix + hexFromRng(() => this.nextRandom(), 40)
  }
  public generateTransaction(
    sender: string,
    recipient: string,
    baseAmount: number,
    status: TxStatus = 'CONFIRMED',
    timestamp = 1792892079596,
  ): TransactionMock {
    const mockHash = this.mockAddress('tx_')
    return {
      transactionId: mockHash,
      senderAddress: sender,
      recipientAddress: recipient,
      amount: baseAmount * 100,
      gasFee: Math.floor(this.nextRandom() * 50) * 100,
      timestamp,
      status,
      signature: `sig_det_${mockHash.substring(3, 15)}`,
    }
  }
  public compileMockBlock(blockNumber: number, txCount: number, injectFailures = false): LedgerState {
    const transactions: TransactionMock[] = []
    const genesisSender = this.mockAddress('0xGENESIS_')
    for (let i = 0; i < txCount; i++) {
      const status: TxStatus = !injectFailures ? 'CONFIRMED' : i % 10 === 9 ? 'FAILED' : i % 10 === 4 ? 'PENDING' : 'CONFIRMED'
      transactions.push(this.generateTransaction(genesisSender, this.mockAddress(), 5000, status))
    }
    return { blockNumber, merkleRoot: this.mockAddress('root_'), transactions }
  }
}

// ---------------------------------------------------------------------------
// Threshold (multi-sig) simulation
// ---------------------------------------------------------------------------

export interface SignaturePayload {
  signerAddress: string
  signature: string
  timestamp: number
}
export interface MultiSigState {
  multiSigTxId: string
  requiredSignatures: number
  totalConfiguredSigners: number
  signersMatrix: string[]
  amount: FinancialUnit
  gasFee: FinancialUnit
  signaturePayloads: SignaturePayload[]
  payloadState: 'PENDING SIGNATURES' | 'THRESHOLD MET (SIMULATED)'
}

/** The exact payload saved from the working transcript — registered, not regenerated. */
export const TRANSCRIPT_MULTISIG: MultiSigState = {
  multiSigTxId: 'mstx_fb941390f680f37d8cc0084e15e0212194ac9bf1',
  requiredSignatures: 2,
  totalConfiguredSigners: 3,
  signersMatrix: [
    '0xKEY_cdd2201a1affbb21047141fbcd780d6225db88b4',
    '0xKEY_6668d05cd33abccbdb4aebdb4ae1c00d2d793c31',
    '0xKEY_663ca9a5d1ebf7cc0cd0fe74e51ab6d7b030eac3',
  ],
  amount: 250000,
  gasFee: 3500,
  signaturePayloads: [
    {
      signerAddress: '0xKEY_cdd2201a1affbb21047141fbcd780d6225db88b4',
      signature: 'sig_det_auth_246171e29fd2',
      timestamp: 1792892079596,
    },
  ],
  payloadState: 'PENDING SIGNATURES',
}

export function addNextSignature(state: MultiSigState): MultiSigState {
  const signed = new Set(state.signaturePayloads.map(s => s.signerAddress))
  const next = state.signersMatrix.find(s => !signed.has(s))
  if (!next) return state
  const signaturePayloads = [
    ...state.signaturePayloads,
    {
      signerAddress: next,
      signature: `sig_det_auth_${mockHashFromString(`${state.multiSigTxId}:${next}`).slice(6, 18)}`,
      timestamp: 1792892079596 + signatureStep(state),
    },
  ]
  return {
    ...state,
    signaturePayloads,
    payloadState: signaturePayloads.length >= state.requiredSignatures ? 'THRESHOLD MET (SIMULATED)' : 'PENDING SIGNATURES',
  }
}
function signatureStep(state: MultiSigState): number {
  return (state.signaturePayloads.length + 1) * 60000
}

// ---------------------------------------------------------------------------
// 100 fixtures + 100 requests (deterministic; mirrored by the Node validator)
// ---------------------------------------------------------------------------

export interface GenesisFixture {
  caseId: string
  kind: 'transaction' | 'zero-balance' | 'high-throughput' | 'failure-injected' | 'multisig'
  protocol: typeof PROTOCOL_ID
  transaction: TransactionMock
  expected: { valid: true; amountScaledBy100: true }
}
export interface GenesisRequest {
  requestId: string
  operation: 'simulate.transfer' | 'simulate.multisig.sign' | 'simulate.block.compile' | 'simulate.cache.collect'
  protocol: typeof PROTOCOL_ID
  idempotencyKey: string
  params: { from: string; to: string; baseAmount: number; amount: FinancialUnit }
}

export function generate100Fixtures(seed = 888888): GenesisFixture[] {
  const h = new CryptoAutomationHarness(seed)
  const sender = h.mockAddress('0xGENESIS_')
  return Array.from({ length: 100 }, (_, i) => {
    const kind: GenesisFixture['kind'] =
      i % 25 === 24 ? 'multisig' : i % 10 === 9 ? 'failure-injected' : i % 10 === 0 ? 'zero-balance' : i % 7 === 3 ? 'high-throughput' : 'transaction'
    const status: TxStatus = kind === 'failure-injected' ? (i % 20 === 9 ? 'FAILED' : 'PENDING') : 'CONFIRMED'
    const base = kind === 'zero-balance' ? 0 : 100 + i * 10
    return {
      caseId: `genesis-fixture-${String(i + 1).padStart(3, '0')}`,
      kind,
      protocol: PROTOCOL_ID,
      transaction: h.generateTransaction(sender, h.mockAddress(), base, status),
      expected: { valid: true, amountScaledBy100: true },
    }
  })
}

export function generate100Requests(seed = 888888): GenesisRequest[] {
  const h = new CryptoAutomationHarness(seed ^ 0x9e3779b9)
  const ops: GenesisRequest['operation'][] = ['simulate.transfer', 'simulate.multisig.sign', 'simulate.block.compile', 'simulate.cache.collect']
  return Array.from({ length: 100 }, (_, i) => {
    const baseAmount = 50 + i * 5
    return {
      requestId: mockHashFromString(`genesis-request-${seed}-${i}`),
      operation: ops[i % ops.length],
      protocol: PROTOCOL_ID,
      idempotencyKey: mockHashFromString(`genesis-idem-${seed}-${i}`),
      params: { from: h.mockAddress(), to: h.mockAddress(), baseAmount, amount: baseAmount * 100 },
    }
  })
}

// ---------------------------------------------------------------------------
// Runtime validation / decoder (same rules as schemas/genesis-telemetry.schema.json)
// ---------------------------------------------------------------------------

export function validateTransaction(tx: unknown): string[] {
  const e: string[] = []
  if (!tx || typeof tx !== 'object') return ['payload is not an object']
  const t = tx as Record<string, unknown>
  if (typeof t.transactionId !== 'string' || !/^tx_[0-9a-f]{40}$/.test(t.transactionId)) e.push('transactionId must be tx_<40 hex>')
  if (typeof t.recipientAddress !== 'string' || !HASH_RE.test(t.recipientAddress)) e.push('recipientAddress must be 0xKEY_<40 hex>')
  if (typeof t.senderAddress !== 'string' || !/^(0xKEY_|0xGENESIS_)[0-9a-f]{40}$/.test(t.senderAddress)) e.push('senderAddress must be 0xKEY_/0xGENESIS_<40 hex>')
  if (typeof t.amount !== 'number' || t.amount % 100 !== 0 || t.amount < 0) e.push('amount must be a non-negative multiple of 100 (base × 100)')
  if (typeof t.gasFee !== 'number' || t.gasFee % 100 !== 0 || t.gasFee < 0) e.push('gasFee must be a non-negative multiple of 100')
  if (!['CONFIRMED', 'PENDING', 'FAILED'].includes(String(t.status))) e.push('status must be CONFIRMED | PENDING | FAILED')
  if (typeof t.signature !== 'string' || !/^sig_det_/.test(t.signature)) e.push('signature must start with sig_det_')
  for (const k of Object.keys(t)) if (/key|secret|token|password|private/i.test(k) && k !== 'transactionId') e.push(`forbidden credential-like field: ${k}`)
  return e
}

export function validateMultiSig(m: unknown): string[] {
  const e: string[] = []
  if (!m || typeof m !== 'object') return ['payload is not an object']
  const s = m as Record<string, unknown>
  const signers = Array.isArray(s.signersMatrix) ? (s.signersMatrix as unknown[]) : []
  if (!signers.length || signers.some(x => typeof x !== 'string' || !HASH_RE.test(x))) e.push('every signer must be 0xKEY_<40 hex>')
  if (new Set(signers).size !== signers.length) e.push('duplicate signer in signersMatrix')
  if (typeof s.requiredSignatures !== 'number' || s.requiredSignatures < 1 || s.requiredSignatures > signers.length)
    e.push('requiredSignatures must be between 1 and total signers')
  if (typeof s.amount !== 'number' || s.amount % 100 !== 0) e.push('amount must be a multiple of 100')
  const payloads = Array.isArray(s.signaturePayloads) ? (s.signaturePayloads as Array<Record<string, unknown>>) : []
  const seen = new Set<string>()
  for (const p of payloads) {
    if (typeof p.signerAddress !== 'string' || !signers.includes(p.signerAddress)) e.push('signature from a signer outside signersMatrix')
    if (seen.has(String(p.signerAddress))) e.push('duplicate signature from same signer')
    seen.add(String(p.signerAddress))
  }
  return e
}

/** Decode any pasted payload: report which genesis shape it is and every rule it breaks. */
export function decodePayload(text: string): { shape: string; errors: string[]; summary: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { shape: 'unparseable', errors: ['not valid JSON'], summary: 'Paste a JSON transaction, block, or multi-sig payload.' }
  }
  const o = parsed as Record<string, unknown>
  if (o && typeof o === 'object' && 'signersMatrix' in o) {
    const errors = validateMultiSig(o)
    const n = Array.isArray(o.signaturePayloads) ? o.signaturePayloads.length : 0
    return { shape: 'multi-sig threshold payload', errors, summary: `Sigs ${n}/${String(o.requiredSignatures)} · amount ${String(o.amount)} (×100 scaled) · gas ${String(o.gasFee)}` }
  }
  if (o && typeof o === 'object' && 'transactions' in o) {
    const txs = Array.isArray(o.transactions) ? o.transactions : []
    const errors = txs.flatMap((t, i) => validateTransaction(t).map(x => `tx[${i}]: ${x}`))
    return { shape: 'ledger block', errors, summary: `Block #${String(o.blockNumber)} · ${txs.length} transactions · merkle ${String(o.merkleRoot)}` }
  }
  if (o && typeof o === 'object' && 'transactionId' in o) {
    return { shape: 'transaction', errors: validateTransaction(o), summary: `${String(o.transactionId)} · ${String(o.status)} · amount ${String(o.amount)}` }
  }
  return { shape: 'unknown', errors: ['no transactionId, transactions[], or signersMatrix found'], summary: 'Not a recognised genesis payload shape.' }
}

// ---------------------------------------------------------------------------
// Beacons, compartments, tickers — the original console's data model
// ---------------------------------------------------------------------------

export type BeaconClass = 'genesis-anchor' | 'network-signature' | 'randomness-telemetry' | 'neural-engine' | 'protection-vector'
export interface Beacon {
  id: string
  name: string
  cls: BeaconClass
  /** map position in a 100×62 viewBox */
  x: number
  y: number
  zone: string
  hash: string
}
export const BEACON_CLASSES: Record<BeaconClass, { label: string; color: string; purpose: string }> = {
  'genesis-anchor': { label: 'Shane // Genesis anchor', color: '#ffd34d', purpose: 'Primary secure validation anchor point.' },
  'network-signature': { label: 'Network signature profile ×4', color: '#39ff6a', purpose: '4 independent signature profiles across distant zones — invalidates single-point profiling.' },
  'randomness-telemetry': { label: 'Randomness telemetry ×2', color: '#37e0ff', purpose: '2 dedicated randomness/entropy signature monitors.' },
  'neural-engine': { label: 'AI neural content engine ×3', color: '#ff7ad9', purpose: '3 neural engines parsing cryptographic text strings, block verification, state balances.' },
  'protection-vector': { label: 'Coast 360 protection vector', color: '#ffa53a', purpose: 'Multi-location tracking array isolating components from central data pools — decentralized 600-mile grid layer.' },
}
export const BEACONS: Beacon[] = [
  { id: 'genesis-0', name: 'Shane', cls: 'genesis-anchor', x: 50, y: 30, zone: 'GENESIS-CORE' },
  { id: 'net-1', name: 'NET-SIG-1', cls: 'network-signature', x: 14, y: 16, zone: 'NW-GRID' },
  { id: 'net-2', name: 'NET-SIG-2', cls: 'network-signature', x: 86, y: 14, zone: 'NE-GRID' },
  { id: 'net-3', name: 'NET-SIG-3', cls: 'network-signature', x: 18, y: 48, zone: 'SW-GRID' },
  { id: 'net-4', name: 'NET-SIG-4', cls: 'network-signature', x: 84, y: 46, zone: 'SE-GRID' },
  { id: 'rnd-1', name: 'RND-TLM-1', cls: 'randomness-telemetry', x: 32, y: 10, zone: 'N-ENTROPY' },
  { id: 'rnd-2', name: 'RND-TLM-2', cls: 'randomness-telemetry', x: 66, y: 54, zone: 'S-ENTROPY' },
  { id: 'neu-1', name: 'NEURAL-1', cls: 'neural-engine', x: 36, y: 38, zone: 'W-CORE' },
  { id: 'neu-2', name: 'NEURAL-2', cls: 'neural-engine', x: 64, y: 22, zone: 'E-CORE' },
  { id: 'neu-3', name: 'NEURAL-3', cls: 'neural-engine', x: 50, y: 52, zone: 'S-CORE' },
  { id: 'coast-360', name: 'COAST-360', cls: 'protection-vector', x: 8, y: 32, zone: '600MI-RING' },
].map(b => ({ ...b, hash: mockHashFromString(`beacon:${b.id}`) })) as Beacon[]

export interface Compartment {
  id: string
  title: string
  octokitRepo: string
  layers: { level: string; api: string; purpose: string }[]
}
export const COMPARTMENTS: Compartment[] = [
  {
    id: 'Genesis',
    title: 'Genesis layers',
    octokitRepo: 'genesis-tencen-registry (proposed)',
    layers: [
      { level: 'L0', api: 'RegistryAPI.save(doc)', purpose: 'Persist documents + SHA-256 0xKEY_ hashes locally.' },
      { level: 'L1', api: 'TelemetryAPI.getCache()', purpose: 'Read the live in-memory cache snapshot.' },
      { level: 'L2', api: 'TelemetryAPI.updateHashRegistry(e)', purpose: 'Inject/update a hash-registry entry.' },
      { level: 'L3', api: 'RegistryAPI.export()', purpose: 'Download the full work registry as JSON.' },
    ],
  },
  {
    id: 'entropy',
    title: 'Entropy parameters',
    octokitRepo: 'entropy-beacons (proposed)',
    layers: [
      { level: 'L0', api: 'Harness(seed)', purpose: 'Deterministic PRNG stream from a fixed seed.' },
      { level: 'L1', api: 'mockAddress(prefix)', purpose: 'Mint reproducible 0xKEY_ mock addresses.' },
      { level: 'L2', api: 'compileMockBlock(n, count)', purpose: 'Build identical mock blocks for CI regression.' },
      { level: 'L3', api: 'generate100Fixtures()', purpose: '100 validated edge-case payloads incl. failure injection.' },
    ],
  },
  {
    id: 'shields',
    title: 'Decentralized cryptographic shields',
    octokitRepo: 'coast-360-shields (proposed)',
    layers: [
      { level: 'L0', api: 'validateTransaction(tx)', purpose: 'Schema + ×100 + 0xKEY_ rule checks.' },
      { level: 'L1', api: 'validateMultiSig(m)', purpose: 'Threshold, signer-set, duplicate-sig checks.' },
      { level: 'L2', api: 'addNextSignature(state)', purpose: 'Advance a simulated threshold signing run.' },
      { level: 'L3', api: 'decodePayload(json)', purpose: 'Identify and decode any genesis payload shape.' },
    ],
  },
  {
    id: 'automation',
    title: 'Automation (B2B-ready, inert)',
    octokitRepo: 'abi-api-1-bridge (proposed)',
    layers: [
      { level: 'L0', api: 'TelemetryAPI.log(msg)', purpose: 'Write a line to the console stream.' },
      { level: 'L1', api: 'TelemetryAPI.advanceGen()', purpose: 'Advance world-state generation counter.' },
      { level: 'L2', api: 'TelemetryAPI.tickers()', purpose: 'Read simulated ticker snapshot (no live feed).' },
      { level: 'L3', api: 'Octokit (not connected)', purpose: 'Needs a vault token + target repos before any live GitHub call.' },
    ],
  },
]

export interface Ticker {
  symbol: string
  label: string
  price: number
  delta: number
}
export function nextTickers(prev: Ticker[], rng: () => number): Ticker[] {
  return prev.map(t => {
    const delta = (rng() - 0.48) * 2.4
    return { ...t, price: Math.max(0.01, t.price * (1 + delta / 100)), delta }
  })
}
export const INITIAL_TICKERS: Ticker[] = [
  { symbol: 'GGSG', label: 'Gatsby Genesis Sanchez (SIM)', price: 100.0, delta: 0 },
  { symbol: 'TEMU-SIM', label: 'TEMU basket (SIM, not the marketplace)', price: 12.5, delta: 0 },
  { symbol: 'CACHE', label: 'Cache units (SIM)', price: 1.0, delta: 0 },
  { symbol: 'AU-SIM', label: 'Gold units = CACHE × 10000 (SIM)', price: 10000.0, delta: 0 },
]

/** Simulated conversion only: cache units × 10000 = simulated gold units. No real asset. */
export function cacheToGoldSim(cacheUnits: number): number {
  return cacheUnits * GOLD_MULTIPLIER
}

export const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

/** Solidity-style threshold-vault template — generated text only: unaudited, never deployed by this app. */
export function contractTemplate(name: string, required: number, signerCount: number): string {
  const safe = name.replace(/[^A-Za-z0-9_]/g, '') || 'GenesisVault'
  return `// SPDX-License-Identifier: MIT
// TEMPLATE ONLY — generated by the telemetry console. Not audited. Do not deploy with real assets.
pragma solidity ^0.8.24;

contract ${safe} {
    // Threshold: ${required} of ${signerCount} signers (0xKEY_ registry in genesis schema)
    address[] public signers;
    uint256 public required = ${required};
    mapping(bytes32 => mapping(address => bool)) public approved;
    mapping(bytes32 => uint256) public approvalCount;
    event Approved(bytes32 indexed txId, address indexed signer, uint256 count);
    event ThresholdMet(bytes32 indexed txId);

    constructor(address[] memory _signers) {
        require(_signers.length == ${signerCount}, "signer count");
        require(required >= 1 && required <= _signers.length, "threshold");
        signers = _signers;
    }

    function approve(bytes32 txId) external {
        require(isSigner(msg.sender), "not a signer");
        require(!approved[txId][msg.sender], "already approved");
        approved[txId][msg.sender] = true;
        uint256 count = ++approvalCount[txId];
        emit Approved(txId, msg.sender, count);
        if (count == required) emit ThresholdMet(txId);
    }

    function isSigner(address a) public view returns (bool) {
        for (uint256 i = 0; i < signers.length; i++) if (signers[i] == a) return true;
        return false;
    }
}
`
}

export const SCRIPT_BOILERPLATE = `// TelemetryAPI boilerplate — runs ONLY in this browser tab.
// Available: TelemetryAPI.getCache() · TelemetryAPI.updateHashRegistry({title, body})
// TelemetryAPI.log(msg) · TelemetryAPI.hashString(s) · TelemetryAPI.getBeacons()
// TelemetryAPI.advanceGen() · TelemetryAPI.tickers()

const cache = TelemetryAPI.getCache();
TelemetryAPI.log('cache keys: ' + Object.keys(cache).join(', '));

const beacons = TelemetryAPI.getBeacons();
TelemetryAPI.log(beacons.length + ' beacons online; anchor = ' + beacons[0].hash);

const key = TelemetryAPI.hashString('Shane');
TelemetryAPI.log('0x_KEY string for Shane -> ' + key);

TelemetryAPI.updateHashRegistry({
  title: 'Injected note from script port',
  body: 'channel growth, compartment: Genesis, protocol: ABI_API_1'
});
TelemetryAPI.log('registry updated — press SAVE WORK REGISTRY to persist it.');
return key;
`
