import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './telemetry.css'
import {
  BEACONS, BEACON_CLASSES, COMPARTMENTS, CryptoAutomationHarness, GOLD_MULTIPLIER, INITIAL_TICKERS,
  LOG_CADENCE_MS, PROTOCOL_ID, REGISTRY_STORAGE_KEY, SCRIPT_BOILERPLATE, TRANSCRIPT_MULTISIG, TRUTH_ANCHOR,
  addNextSignature, cacheToGoldSim, cardinal, contractTemplate, decodePayload, generate100Fixtures,
  generate100Requests, mockHashFromString, mulberry32, nextTickers, sha256Key, validateTransaction,
  type BeaconClass, type LedgerState, type MultiSigState, type Ticker,
} from './lib/telemetry'
import {
  SEVERITY_LABEL, SNIPPET_CORPUS, analyzeSnippet, customSnippet, loadSnippet, riskScore, runScannerSelfTest,
  type SnippetBlock, type VulnFinding,
} from './lib/vuln-intel'

interface LogEntry { id: number; kind: 'thinking' | 'signal' | 'system' | 'script' | 'vuln'; ts: string; tsPurpose: string; text: string; cls?: BeaconClass }
interface RegistryDoc { title: string; body: string; hash: string; hashKind: 'sha256' | 'mock-det'; compartment: string }
interface CreditEntry { id: string; amountSim: number; note: string }

const ALL_CLASSES = Object.keys(BEACON_CLASSES) as BeaconClass[]
const TS_PURPOSES: Record<string, string> = {
  thinking: 'buffer stamp — marks when the automated-thinking pass started, before any output is committed',
  signal: 'arrival stamp — orders this beacon ping against every other zone so the stream can be replayed in sequence',
  system: 'state stamp — pins the generation/freeze change to the moment you pressed the control',
  script: 'injection stamp — marks when your script wrote into the console through TelemetryAPI',
  vuln: 'recon stamp — marks the exact decode moment a weakness pattern completed in the typing buffer',
}
const JSX_SNIPPETS = [
  '<Beacon id="genesis-0" hash="0xKEY_…" anchor />',
  '<SignalLog cadence={2200} thinkingBuffer />',
  '<Compass heading={deg} cardinal={cardinal(deg)} />',
  '<HashRegistry protocol="ABI_API_1" persist="on-save-only" />',
  '<Ticker symbol="GGSG" simulated />',
  '<ThresholdVault required={2} signers={3} simulated />',
  '<CacheToGold multiplier={10000} simulated />',
  '<Compartment id="Genesis" layers={["L0","L1","L2","L3"]} />',
]

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
const nowTs = () => new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z'

interface SavedRegistry { docs?: RegistryDoc[]; credits?: CreditEntry[]; generation?: number; savedAt?: string }
function loadSavedRegistry(): SavedRegistry | null {
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedRegistry) : null
  } catch { return null }
}

export default function TelemetryConsole({ onBack }: { onBack: () => void }) {
  // Restore only what was explicitly saved with SAVE WORK REGISTRY. Nothing is
  // tracked, profiled, or lazily personalised — this component is eager-loaded.
  const [savedOnce] = useState(loadSavedRegistry)
  const [frozen, setFrozen] = useState(false)
  const [generation, setGeneration] = useState(savedOnce?.generation ?? 1)
  const [heading, setHeading] = useState(35)
  const [tickers, setTickers] = useState<Ticker[]>(INITIAL_TICKERS)
  const [logs, setLogs] = useState<LogEntry[]>(() => [{
    id: 1, kind: 'system', ts: nowTs(), tsPurpose: TS_PURPOSES.system,
    text: `${PROTOCOL_ID} bridge online · anchor ${mockHashFromString('Shane')} · eager load, zero analytics, no personalised loops`,
  }])
  const [visible, setVisible] = useState<Set<BeaconClass>>(new Set(ALL_CLASSES))
  const [selectedId, setSelectedId] = useState('genesis-0')
  const [docs, setDocs] = useState<RegistryDoc[]>(savedOnce?.docs ?? [])
  const [docTitle, setDocTitle] = useState('Session notes')
  const [docBody, setDocBody] = useState('Genesis anchor verified. Coast 360 ring nominal. Continue hashing with 0x_KEY strings.')
  const [saveState, setSaveState] = useState(savedOnce ? `restored registry saved at ${savedOnce.savedAt ?? 'unknown time'}` : 'not saved yet this session')
  const [credits, setCredits] = useState<CreditEntry[]>(savedOnce?.credits ?? [])
  const [cacheUnits, setCacheUnits] = useState(250)
  const [multiSig, setMultiSig] = useState<MultiSigState>(TRANSCRIPT_MULTISIG)
  const [seed, setSeed] = useState(888888)
  const [block, setBlock] = useState<LedgerState | null>(null)
  const [injectFailures, setInjectFailures] = useState(true)
  const [batchResult, setBatchResult] = useState('')
  const [script, setScript] = useState(SCRIPT_BOILERPLATE)
  const [scriptOut, setScriptOut] = useState('')
  const [decoderIn, setDecoderIn] = useState(JSON.stringify(TRANSCRIPT_MULTISIG, null, 2))
  const [decoderOut, setDecoderOut] = useState('')
  const [contractName, setContractName] = useState('GenesisVault')
  const [contractReq, setContractReq] = useState(2)
  const [contractSigners, setContractSigners] = useState(3)
  const [contractOut, setContractOut] = useState('')
  const [jsxLines, setJsxLines] = useState<string[]>(['// thumbs generate the next JSX from here — tap a thumb pad'])
  const [focusLine, setFocusLine] = useState('One thought, set once: steady betterment activity, high refresh, no loops.')
  const [typed, setTyped] = useState({ id: 0, n: 0 })
  // Vulnerability Threat Intelligence console state
  const [activeSnippet, setActiveSnippet] = useState<SnippetBlock>(() => loadSnippet(0))
  const [snippetIndex, setSnippetIndex] = useState(0)
  const [decodeChars, setDecodeChars] = useState(0)
  const [decodeRunning, setDecodeRunning] = useState(true)
  const [pressure, setPressure] = useState(3) // classic mechanical pressure: chars per decode tick
  const [reconMatrix, setReconMatrix] = useState<Record<string, VulnFinding[]>>({})
  const [modalFinding, setModalFinding] = useState<VulnFinding | null>(null)
  const [customCode, setCustomCode] = useState('')
  const [selfTestResult, setSelfTestResult] = useState('')

  const logId = useRef(1)
  const seenFindings = useRef<Set<string>>(new Set())
  const recordedDecode = useRef('')
  const rngRef = useRef(mulberry32(424242))
  const stepRef = useRef(0)
  const logBoxRef = useRef<HTMLDivElement>(null)

  const pushLog = useCallback((kind: LogEntry['kind'], text: string, cls?: BeaconClass) => {
    logId.current += 1
    const entry: LogEntry = { id: logId.current, kind, ts: nowTs(), tsPurpose: TS_PURPOSES[kind], text, cls }
    setLogs(prev => [...prev.slice(-119), entry])
  }, [])

  // Slower, deliberate cadence: think first (buffered), then emit the signal.
  useEffect(() => {
    if (frozen) return
    const timer = window.setInterval(() => {
      const rng = rngRef.current
      const pool = BEACONS.filter(b => visible.has(b.cls))
      const beacon = pool.length ? pool[Math.floor(rng() * pool.length)] : BEACONS[0]
      stepRef.current += 1
      const step = stepRef.current
      pushLog('thinking', `[AUTOMATED THINKING] step ${step}: resolving ${beacon.name} heading, entropy window, hash string…`, beacon.cls)
      window.setTimeout(() => {
        const deg = Math.floor(rng() * 360)
        setHeading(deg)
        setTickers(prev => nextTickers(prev, rng))
        pushLog(
          'signal',
          `${beacon.name} [${beacon.zone}] ${beacon.hash} · dir ${deg}° ${cardinal(deg)} · entropy ${(rng() * 100).toFixed(2)} · gen ${generation}`,
          beacon.cls,
        )
      }, 650)
    }, LOG_CADENCE_MS)
    return () => window.clearInterval(timer)
  }, [frozen, visible, generation, pushLog])

  useEffect(() => { logBoxRef.current?.scrollTo({ top: logBoxRef.current.scrollHeight }) }, [logs])

  // Non-stop typing: the newest line types itself out character by character.
  const latest = logs[logs.length - 1]
  const latestId = latest?.id ?? 0
  const latestLen = latest?.text.length ?? 0
  useEffect(() => {
    if (!latestId) return
    const t = window.setInterval(() => {
      setTyped(prev => (prev.id !== latestId ? { id: latestId, n: 3 } : { id: latestId, n: Math.min(latestLen, prev.n + 3) }))
    }, 24)
    return () => window.clearInterval(t)
  }, [latestId, latestLen])

  const cacheRef = useRef<Record<string, unknown>>({})
  useEffect(() => {
    cacheRef.current = { generation, frozen, heading, docs, credits, tickers, multiSig, cacheUnits, goldSim: cacheToGoldSim(cacheUnits) }
  })

  // --- Vulnerability Threat Intelligence: live decoding + recon ---
  // loadSnippet() loop mechanics: deterministically loads the next mainframe
  // sequence block, resets the typing matrix buffer, and injects the block's
  // analytical vulnerability note beside it. Classic controls are preserved:
  // mechanical pressure (chars/tick), the hidden undecoded buffer, oscillator
  // feedback, and FREEZE halting decode along with the signal stream.
  const loadSnippetIntoMatrix = useCallback((snippet: SnippetBlock) => {
    seenFindings.current = new Set()
    recordedDecode.current = ''
    setActiveSnippet(snippet)
    setDecodeChars(0)
    setDecodeRunning(true)
    setModalFinding(null)
    pushLog('vuln', `loadSnippet() → ${snippet.id} “${snippet.title}” streamed into typing matrix buffer · analyst note injected · ${snippet.code.length} chars held in hidden execution buffer`)
  }, [pushLog])

  const loadNextSnippet = useCallback(() => {
    const next = snippetIndex + 1
    setSnippetIndex(next)
    loadSnippetIntoMatrix(loadSnippet(next))
  }, [snippetIndex, loadSnippetIntoMatrix])

  const decodedText = activeSnippet.code.slice(0, decodeChars)
  const decodeDone = decodeChars >= activeSnippet.code.length
  const liveFindings = useMemo(() => analyzeSnippet(decodedText), [decodedText])
  const liveRisk = riskScore(liveFindings)
  const matrixFindings = useMemo(() => Object.values(reconMatrix).flat(), [reconMatrix])

  useEffect(() => {
    cacheRef.current = {
      ...cacheRef.current,
      vulnIntel: {
        activeSnippet: activeSnippet.id, decodedChars: decodeChars, decodeDone,
        liveFindings: liveFindings.map(f => `${f.cwe}@L${f.line}`),
        riskScore: liveRisk, sequencesScanned: Object.keys(reconMatrix).length,
      },
    }
  })

  useEffect(() => {
    if (!decodeRunning || frozen || decodeDone) return
    const t = window.setInterval(() => {
      setDecodeChars(n => Math.min(activeSnippet.code.length, n + pressure))
    }, 34)
    return () => window.clearInterval(t)
  }, [decodeRunning, frozen, decodeDone, pressure, activeSnippet])

  // Findings surface the moment their pattern completes in the buffer.
  useEffect(() => {
    for (const f of liveFindings) {
      const key = `${activeSnippet.id}:${f.ruleId}:${f.line}:${activeSnippet.code.length}`
      if (!seenFindings.current.has(key)) {
        seenFindings.current.add(key)
        pushLog('vuln', `⚠ ${f.cwe} [${SEVERITY_LABEL[f.severity]}] ${f.name} — ${activeSnippet.id} line ${f.line}: ${f.evidence}`)
      }
    }
  }, [liveFindings, activeSnippet, pushLog])

  // Completed decode commits the sequence into the recon matrix.
  useEffect(() => {
    const key = `${activeSnippet.id}:${activeSnippet.code.length}`
    if (!decodeDone || recordedDecode.current === key) return
    recordedDecode.current = key
    const full = analyzeSnippet(activeSnippet.code)
    setReconMatrix(prev => ({ ...prev, [activeSnippet.id]: full }))
    pushLog('vuln', full.length
      ? `DECODE COMPLETE ${activeSnippet.id} → ${full.length} weakness pattern(s) committed to recon matrix · risk ${riskScore(full)}/100`
      : `DECODE COMPLETE ${activeSnippet.id} → clean sequence, no CWE patterns matched · committed to recon matrix`)
  }, [decodeDone, activeSnippet, pushLog])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalFinding(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selected = BEACONS.find(b => b.id === selectedId) ?? BEACONS[0]
  const creditTotal = credits.reduce((s, c) => s + c.amountSim, 0)
  const filteredLogs = useMemo(() => logs.filter(l => !l.cls || visible.has(l.cls)), [logs, visible])

  const toggleClass = (cls: BeaconClass) =>
    setVisible(prev => { const next = new Set(prev); if (next.has(cls)) next.delete(cls); else next.add(cls); return next })

  const addDocument = async (title: string, body: string, hashKind: 'sha256' | 'mock-det' = 'sha256') => {
    const hash = hashKind === 'sha256' ? await sha256Key(`${title}\n${body}`) : mockHashFromString(`${title}\n${body}`)
    setDocs(prev => [...prev, { title, body, hash, hashKind, compartment: 'Genesis' }])
    pushLog('system', `document registered: “${title}” → ${hash} (${hashKind})`)
    return hash
  }

  const saveRegistry = () => {
    const snapshot = { protocol: PROTOCOL_ID, truthAnchor: TRUTH_ANCHOR, simulation: true, savedAt: nowTs(), generation, docs, credits, multiSig }
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(snapshot, null, 2))
    setSaveState(`saved ${snapshot.savedAt} — ${docs.length} documents, ${credits.length} simulated credit entries, generation ${generation}`)
    pushLog('system', `SAVE WORK REGISTRY committed locally (${docs.length} docs with all hashes registered)`)
  }

  const runScript = () => {
    const out: string[] = []
    const TelemetryAPI = {
      getCache: () => structuredClone(cacheRef.current),
      log: (msg: string) => { out.push(String(msg)); pushLog('script', String(msg)) },
      hashString: (s: string) => mockHashFromString(String(s)),
      getBeacons: () => BEACONS,
      scan: (code: string) => analyzeSnippet(String(code)),
      loadSnippet: (i: number) => { const s = loadSnippet(Number(i) || 0); setSnippetIndex(Number(i) || 0); loadSnippetIntoMatrix(s); return s.id },
      tickers: () => tickers,
      advanceGen: () => setGeneration(g => g + 1),
      updateHashRegistry: (e: { title: string; body: string }) => {
        void addDocument(e.title || 'Script entry', e.body || '', 'mock-det')
      },
    }
    try {
      const result = new Function('TelemetryAPI', script)(TelemetryAPI) as unknown // user's own code, own tab only
      setScriptOut([...out, result !== undefined ? `↩ returned: ${String(result)}` : '✓ ran clean'].join('\n'))
    } catch (err) {
      setScriptOut([...out, `✗ ${err instanceof Error ? err.message : String(err)}`].join('\n'))
    }
  }

  const runHashingCycle = () => {
    const base = 25 + Math.floor(rngRef.current() * 225)
    const entry: CreditEntry = {
      id: mockHashFromString(`credit-cycle-${credits.length}-${base}`),
      amountSim: base * 100,
      note: 'simulated provisional credit cycle — no real funds',
    }
    setCredits(prev => [...prev, entry])
    pushLog('system', `hashing cycle ${entry.id} → +${entry.amountSim.toLocaleString()} SIM units credited to Genesis Tabozo Sanga vault (simulated)`)
  }

  const thumbTap = (side: 'LEFT' | 'RIGHT') => {
    try { navigator.vibrate?.(15) } catch { /* desktop: no haptics */ }
    const line = JSX_SNIPPETS[jsxLines.length % JSX_SNIPPETS.length]
    setJsxLines(prev => [...prev.slice(-7), line])
    pushLog('system', `${side} THUMB → haptic nucleus generated next JSX: ${line}`)
  }

  const generateBlock = () => {
    const b = new CryptoAutomationHarness(seed).compileMockBlock(1001, 5, injectFailures)
    setBlock(b)
    pushLog('system', `mock block #${b.blockNumber} compiled (seed ${seed}) · merkle ${b.merkleRoot} · first amount ${b.transactions[0].amount} (×100)`)
  }

  const generateBatch = (downloadIt: boolean) => {
    const fixtures = generate100Fixtures(seed)
    const requests = generate100Requests(seed)
    const bad = fixtures.flatMap(f => validateTransaction(f.transaction))
    const distinct = new Set(requests.map(r => r.requestId)).size
    setBatchResult(bad.length
      ? `✗ ${bad.slice(0, 3).join(' · ')}`
      : `✓ 100/100 fixtures valid · ${distinct}/100 distinct requests · deterministic seed ${seed}`)
    if (downloadIt) download('genesis-telemetry-100.json', JSON.stringify({ protocol: PROTOCOL_ID, truthAnchor: TRUTH_ANCHOR, simulation: true, fixtures, requests, multiSig }, null, 2))
  }

  return (
    <div className="tc">
      <header className="tc-head">
        <button type="button" className="tc-back" onClick={onBack}>← Teams</button>
        <div>
          <h1>GENESIS // CYBER-TELEMETRY CONSOLE</h1>
          <p>{PROTOCOL_ID} · Shane · Coast 360 · always-now generation {generation} · heading {heading}° {cardinal(heading)}</p>
        </div>
        <div className="tc-head-btns">
          <button type="button" onClick={() => { setFrozen(f => !f); pushLog('system', frozen ? 'tracking resumed' : 'tracking FROZEN — indicators held') }}>{frozen ? '▶ RESUME' : '⏸ FREEZE'}</button>
          <button type="button" onClick={() => { setGeneration(g => g + 1); pushLog('system', `world-state advanced → generation ${generation + 1} (bridge continuous, no config loss)`) }}>ADVANCE WORLD STATE CYCLE</button>
          <button type="button" className="tc-save" onClick={saveRegistry}>⬢ SAVE WORK REGISTRY</button>
        </div>
      </header>

      <p className="tc-banner" role="note">
        <strong>SIMULATION ONLY.</strong> No real bank, Apple Card, Marcus/Goldman Sachs, blockchain, gold, or marketplace
        connection exists in this app, and nothing here creates an account or moves money. Ledgers, tickers, and cache→gold
        are deterministic local simulations labelled <strong>SIM</strong>, built so a verified provider can be wired in later.
        Octokit compartments are a local data model — no GitHub calls are made. Zero analytics, zero personalisation,
        nothing leaves this tab; data persists only when you press SAVE WORK REGISTRY. Registry: {saveState}.
      </p>

      <div className="tc-tickers" aria-label="Simulated tickers">
        {tickers.map(t => (
          <span key={t.symbol} className="tc-ticker" title={t.label}>
            <strong>{t.symbol}</strong> {t.price.toFixed(2)} <em className={t.delta >= 0 ? 'up' : 'down'}>{t.delta >= 0 ? '▲' : '▼'}{Math.abs(t.delta).toFixed(2)}%</em> <small>SIM</small>
          </span>
        ))}
        <span className="tc-ticker"><strong>CACHE→AU</strong> {cacheUnits.toLocaleString()} × {GOLD_MULTIPLIER.toLocaleString()} = {cacheToGoldSim(cacheUnits).toLocaleString()} <small>SIM gold units</small></span>
      </div>

      <div className="tc-grid">
        <section className="tc-panel tc-map-panel">
          <h2>DISTRIBUTED BEACON MAP — 600-MILE GRID</h2>
          <svg viewBox="0 0 100 62" className="tc-map" role="img" aria-label="Vector map of telemetry beacons">
            {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="62" className="tc-gridline" />)}
            {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} className="tc-gridline" />)}
            <circle cx="50" cy="30" r="22" className="tc-ring" />
            <circle cx="50" cy="30" r="30" className="tc-ring faint" />
            {BEACONS.filter(b => visible.has(b.cls) && b.cls !== 'genesis-anchor').map(b => (
              <line key={`l-${b.id}`} x1="50" y1="30" x2={b.x} y2={b.y} className="tc-link" />
            ))}
            {BEACONS.filter(b => visible.has(b.cls)).map(b => (
              <g key={b.id} className={`tc-beacon${selected.id === b.id ? ' sel' : ''}`} onClick={() => setSelectedId(b.id)} tabIndex={0}
                 onKeyDown={e => { if (e.key === 'Enter') setSelectedId(b.id) }} role="button" aria-label={`Select ${b.name}`}>
                <circle cx={b.x} cy={b.y} r={selected.id === b.id ? 2.4 : 1.7} fill={BEACON_CLASSES[b.cls].color} />
                <text x={b.x + 2.6} y={b.y + 1}>{b.name}</text>
              </g>
            ))}
          </svg>
          <div className="tc-legend">
            {ALL_CLASSES.map(cls => (
              <button key={cls} type="button" className={`tc-legend-btn${visible.has(cls) ? ' on' : ''}`} onClick={() => toggleClass(cls)} aria-pressed={visible.has(cls)} title={BEACON_CLASSES[cls].purpose}>
                <span className="tc-dot" style={{ background: BEACON_CLASSES[cls].color }} />{BEACON_CLASSES[cls].label}
              </button>
            ))}
          </div>
          <p className="tc-hint">Toggle points on the map or in the legend to filter the live signal log. Selected beacon payload is in the preview panel →</p>
          <div className="tc-compass-row">
            <svg viewBox="0 0 100 100" className="tc-compass" role="img" aria-label={`Compass heading ${heading} degrees ${cardinal(heading)}`}>
              <circle cx="50" cy="50" r="46" className="tc-compass-ring" />
              {['N', 'E', 'S', 'W'].map((d, i) => (
                <text key={d} x={50 + 38 * Math.sin((i * Math.PI) / 2)} y={54 - 38 * Math.cos((i * Math.PI) / 2)} className="tc-compass-txt">{d}</text>
              ))}
              <g transform={`rotate(${heading} 50 50)`}>
                <polygon points="50,10 55,52 50,46 45,52" fill="#39ff6a" />
                <polygon points="50,90 55,52 50,58 45,52" fill="#14532d" />
              </g>
              <circle cx="50" cy="50" r="4" fill="#ffd34d" />
            </svg>
            <div>
              <p><strong>GENERAL DIRECTION / COMPASS</strong><br />{heading}° {cardinal(heading)} · generation {generation} · cadence {LOG_CADENCE_MS}ms (slower, deliberate)</p>
              <p className="tc-hint">Every log line carries a buffered description of what its timestamp is for — hover/inspect the ⟨ts: …⟩ note under each line below.</p>
            </div>
          </div>
        </section>

        <section className="tc-panel tc-log-panel">
          <h2>LIVE SIGNAL LOG — NON-STOP TYPING TERMINAL {frozen && <span className="tc-frozen">FROZEN</span>}</h2>
          <div className="tc-logs" ref={logBoxRef} aria-live="polite">
            {filteredLogs.map((l, i) => (
              <div key={l.id} className={`tc-log ${l.kind}`}>
                <span className="tc-ts">[{l.ts}]</span>{' '}
                <span>{l.id === typed.id ? l.text.slice(0, typed.n) : l.text}</span>
                {i === filteredLogs.length - 1 && <span className="tc-caret">▊</span>}
                <div className="tc-ts-purpose">⟨ts: {l.tsPurpose}⟩</div>
              </div>
            ))}
          </div>
          <h3>PAYLOAD PREVIEW — {selected.name}</h3>
          <pre className="tc-pre">{JSON.stringify({ ...selected, color: BEACON_CLASSES[selected.cls].color, purpose: BEACON_CLASSES[selected.cls].purpose, protocol: PROTOCOL_ID, generation }, null, 2)}</pre>
        </section>
      </div>

      <section className="tc-panel tc-vuln" aria-label="Vulnerability Threat Intelligence Console">
        <h2>🛡 VULNERABILITY THREAT INTELLIGENCE CONSOLE — LIVE RECON MATRIX</h2>
        <p className="tc-hint">
          Each mainframe sequence block is decoded into the typing matrix buffer while the recon column exposes
          CWE-classified weaknesses <strong>the moment their pattern completes</strong>. Defensive static heuristics only —
          analysed code is <strong>never executed</strong>, findings carry confidence levels, and this aids (never replaces) real SAST + review.
          Classic flow preserved: mechanical pressure, hidden execution buffer ({Math.max(0, activeSnippet.code.length - decodeChars)} chars undecoded),
          oscillator feedback, and FREEZE halting decode. Corpus: {SNIPPET_CORPUS.length} sequences incl. 2 clean references.
        </p>
        <div className="tc-btn-row">
          <button type="button" className="tc-save" onClick={loadNextSnippet}>▶ LOAD NEXT SEQUENCE — loadSnippet()</button>
          <button type="button" onClick={() => { seenFindings.current = new Set(); recordedDecode.current = ''; setDecodeChars(0); setDecodeRunning(true) }}>↺ RESTART DECODE</button>
          <button type="button" onClick={() => setDecodeRunning(r => !r)}>{decodeRunning ? '⏸ PAUSE DECODE' : '▶ RESUME DECODE'}</button>
          <button type="button" onClick={() => { const r = runScannerSelfTest(); setSelfTestResult(r.failures.length ? `✗ ${r.passed}/${r.total} — ${r.failures.join(' · ')}` : `✓ scanner self-test ${r.passed}/${r.total}: every vulnerable block yields exactly its expected CWE set; clean references stay silent`); pushLog('vuln', `scanner self-test ${r.passed}/${r.total} passed`) }}>RUN SCANNER SELF-TEST</button>
          <label className="tc-pressure">mechanical pressure {pressure} chars/tick
            <input type="range" min={1} max={12} value={pressure} onChange={e => setPressure(Number(e.target.value))} />
          </label>
        </div>
        {selfTestResult && <p className="tc-ok">{selfTestResult}</p>}

        <div className="tc-vuln-grid">
          <div className="tc-vuln-col">
            <h3>TYPING MATRIX BUFFER — {activeSnippet.id} · {activeSnippet.title} [{activeSnippet.language}]</h3>
            <p className="tc-analyst">◈ ANALYST NOTE (injected by loadSnippet): {activeSnippet.analystNote}</p>
            <div className="tc-decodebar" role="progressbar" aria-valuenow={Math.round((decodeChars / Math.max(1, activeSnippet.code.length)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Decode progress">
              <span style={{ width: `${(decodeChars / Math.max(1, activeSnippet.code.length)) * 100}%` }} />
            </div>
            <pre className="tc-pre tc-code" aria-live="polite">{decodedText}{!decodeDone && <span className="tc-caret">▊</span>}{decodeDone && '\n// — DECODE COMPLETE —'}</pre>
            <div className="tc-vuln-osc" aria-hidden="true" title={`Oscillator feedback — recon pressure ${liveRisk}/100`}>
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i} style={{ height: `${6 + ((liveRisk * (i % 5 + 2)) % 44)}px`, animationDuration: `${Math.max(0.35, 1.6 - liveRisk / 90)}s` }} />
              ))}
            </div>
            <p className="tc-hint">recon pressure <strong>{liveRisk}/100</strong> · oscillator tempo tracks live severity · {liveFindings.length} pattern(s) exposed so far in this sequence</p>
            <label>Inject your own sequence (analysed as text only — never run)
              <textarea rows={5} value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder={"// paste code to scan, e.g.\nconst q = \"SELECT * FROM t WHERE id = '\" + id + \"'\""} spellCheck={false} /></label>
            <button type="button" onClick={() => customCode.trim() && loadSnippetIntoMatrix(customSnippet(customCode))} disabled={!customCode.trim()}>LOAD CUSTOM SEQUENCE INTO MATRIX</button>
          </div>

          <div className="tc-vuln-col tc-recon">
            <h3>LIVE RECON MATRIX — CWE DIAGNOSTICS</h3>
            {liveFindings.length === 0 && (
              <p className={decodeDone ? 'tc-ok' : 'tc-hint'}>{decodeDone ? '✓ No weakness patterns matched — clean sequence.' : '…decoding — no patterns matched yet in the revealed buffer.'}</p>
            )}
            <ul className="tc-findings">
              {liveFindings.map((f, i) => (
                <li key={`${f.ruleId}:${f.line}:${i}`} className={`tc-finding sev-${f.severity}`}>
                  <span className="tc-sev">{SEVERITY_LABEL[f.severity]}</span>
                  <strong>{f.cwe}</strong> {f.name}
                  <div className="tc-evidence">L{f.line} · confidence {f.confidence} · <code>{f.evidence}</code></div>
                  <button type="button" onClick={() => setModalFinding(f)}>DECONSTRUCT ▸</button>
                </li>
              ))}
            </ul>
            <h3>SEQUENCE MATRIX — COMPLETED DECODES ({Object.keys(reconMatrix).length})</h3>
            {Object.keys(reconMatrix).length === 0 && <p className="tc-hint">No completed sequences yet — finish a decode or raise the pressure.</p>}
            <div className="tc-matrix">
              {Object.entries(reconMatrix).map(([id, fs]) => (
                <div key={id} className="tc-matrix-row">
                  <strong>{id}</strong>
                  <span>{fs.length ? [...new Set(fs.map(f => f.cwe))].join(' · ') : '✓ clean'}</span>
                  <span className={fs.length ? 'tc-risk-on' : 'tc-ok'}>risk {riskScore(fs)}/100</span>
                </div>
              ))}
            </div>
            {matrixFindings.length > 0 && (
              <p className="tc-hint">
                matrix totals: {(['critical', 'high', 'medium', 'low'] as const).map(s => `${SEVERITY_LABEL[s]} ${matrixFindings.filter(f => f.severity === s).length}`).join(' · ')}
                {' '}· distinct CWEs {[...new Set(matrixFindings.map(f => f.cwe))].length}
              </p>
            )}
            <button type="button" onClick={() => download('genesis-recon-matrix.json', JSON.stringify({ protocol: PROTOCOL_ID, exportedAt: nowTs(), disclaimer: 'Heuristic static diagnostics on simulated blocks; analysed code was never executed.', reconMatrix }, null, 2))} disabled={Object.keys(reconMatrix).length === 0}>EXPORT RECON MATRIX JSON</button>
          </div>
        </div>
      </section>

      <div className="tc-grid">
        <section className="tc-panel">
          <h2>DOCUMENT MATRIX REGISTRY — ALL HASHES REGISTERED</h2>
          <label>Title <input value={docTitle} onChange={e => setDocTitle(e.target.value)} /></label>
          <label>Document <textarea rows={3} value={docBody} onChange={e => setDocBody(e.target.value)} /></label>
          <div className="tc-btn-row">
            <button type="button" onClick={() => void addDocument(docTitle, docBody)}>REGISTER DOCUMENT (SHA-256 → 0xKEY_)</button>
            <button type="button" onClick={() => download('genesis-work-registry.json', JSON.stringify({ protocol: PROTOCOL_ID, truthAnchor: TRUTH_ANCHOR, simulation: true, exportedAt: nowTs(), generation, docs, credits, multiSig, compartments: COMPARTMENTS.map(c => c.id) }, null, 2))}>EXPORT REGISTRY JSON</button>
            <button type="button" onClick={() => { localStorage.removeItem(REGISTRY_STORAGE_KEY); setSaveState('cleared — nothing persisted') }}>CLEAR SAVED REGISTRY</button>
          </div>
          <ul className="tc-list">
            {docs.length === 0 && <li>No documents yet — register one, then SAVE WORK REGISTRY to persist it for later work.</li>}
            {docs.map((d, i) => <li key={i}><strong>{d.title}</strong> [{d.compartment} · {d.hashKind}]<br /><code>{d.hash}</code></li>)}
          </ul>

          <h3>PROVISIONAL CREDIT LEDGER (SIMULATED VAULT)</h3>
          <p className="tc-hint">
            Beneficiary label: <strong>Genesis Tabozo Sanga</strong> · source label: “Apple Card by Goldman Sachs” · store label:
            “Marcus-style vault”. <strong>These are text labels in a simulation.</strong> No Marcus/Goldman account was generated
            (only Marcus itself can open one, after identity verification at Marcus.com), and no provisional credit exists outside this tab.
          </p>
          <div className="tc-btn-row">
            <button type="button" onClick={runHashingCycle}>RUN HASHING CYCLE → CREDIT (SIM)</button>
            <span>TOTAL: <strong>{creditTotal.toLocaleString()}</strong> SIM units · {credits.length} cycles · every cycle strung with 0x_KEY</span>
          </div>
          <ul className="tc-list">{credits.slice(-5).map(c => <li key={c.id}><code>{c.id}</code> +{c.amountSim.toLocaleString()} SIM</li>)}</ul>

          <h3>CACHE → GOLD CONVERTER (SIMULATED ×{GOLD_MULTIPLIER.toLocaleString()})</h3>
          <label>Cache units <input type="number" min={0} value={cacheUnits} onChange={e => setCacheUnits(Math.max(0, Number(e.target.value) || 0))} /></label>
          <p>= <strong>{cacheToGoldSim(cacheUnits).toLocaleString()}</strong> simulated gold units. A display multiplier from the original spec — it does not create value or real gold.</p>
        </section>

        <section className="tc-panel">
          <h2>HAPTIC THUMB NUCLEUS — MEMORY LOOP</h2>
          <p className="tc-hint">No personalised lazy load: this console eager-loads whole, keeps no analytics/statistics about you, and holds its loop only in this tab's memory (plus whatever you explicitly save). On a phone, thumb taps fire real haptic vibration and generate the next JSX line.</p>
          <div className="tc-thumbs">
            <button type="button" className="tc-thumb" onPointerDown={() => thumbTap('LEFT')}>👍 LEFT THUMB<br /><small>generate JSX</small></button>
            <div className="tc-wave" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
            <button type="button" className="tc-thumb" onPointerDown={() => thumbTap('RIGHT')}>👍 RIGHT THUMB<br /><small>generate JSX</small></button>
          </div>
          <pre className="tc-pre">{jsxLines.join('\n')}</pre>
          <label>Betterment focus line (your words, shown — not a health claim; this app can't change a body)
            <input value={focusLine} onChange={e => setFocusLine(e.target.value)} /></label>
          <p className="tc-focus">◈ {focusLine}</p>
          <p className="tc-hint">Autonomous isolation: no lineage, no roles to play for anyone else — just the work. :P</p>

          <h3>THRESHOLD SIGNING RUN (SIMULATED)</h3>
          <p>Payload state: <strong>{multiSig.payloadState}</strong> · Sigs: {multiSig.signaturePayloads.length}/{multiSig.requiredSignatures}</p>
          <pre className="tc-pre">{JSON.stringify(multiSig, null, 2)}</pre>
          <div className="tc-btn-row">
            <button type="button" onClick={() => { setMultiSig(addNextSignature); pushLog('system', 'threshold run advanced by next signer (simulated)') }}>SIMULATE NEXT SIGNATURE</button>
            <button type="button" onClick={() => setMultiSig(TRANSCRIPT_MULTISIG)}>RESET TO REGISTERED PAYLOAD (1/2)</button>
          </div>
        </section>
      </div>

      <div className="tc-grid">
        <section className="tc-panel">
          <h2>CRYPTO AUTOMATION HARNESS — GENESIS SCHEMA BATCHES</h2>
          <label>Entropy seed <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} /></label>
          <label className="tc-check"><input type="checkbox" checked={injectFailures} onChange={e => setInjectFailures(e.target.checked)} /> failure-state injection (FAILED / PENDING)</label>
          <div className="tc-btn-row">
            <button type="button" onClick={generateBlock}>COMPILE MOCK BLOCK #1001 ×5</button>
            <button type="button" onClick={() => generateBatch(false)}>GENERATE + VALIDATE 100 FIXTURES / 100 REQUESTS</button>
            <button type="button" onClick={() => generateBatch(true)}>DOWNLOAD BATCH JSON</button>
          </div>
          {batchResult && <p className="tc-ok">{batchResult}</p>}
          <p className="tc-hint">Same batch is committed in the repo at <code>web/scripts/fixtures/genesis-telemetry-100.json</code> and re-validated in CI by <code>npm run validate:genesis</code> against <code>schemas/genesis-telemetry.schema.json</code>.</p>
          {block && <pre className="tc-pre">{JSON.stringify(block, null, 2)}</pre>}

          <h3>SMART-CONTRACT BUILDER (TEMPLATE ONLY)</h3>
          <label>Contract name <input value={contractName} onChange={e => setContractName(e.target.value)} /></label>
          <label>Required sigs <input type="number" min={1} max={9} value={contractReq} onChange={e => setContractReq(Math.max(1, Number(e.target.value) || 1))} /></label>
          <label>Signers <input type="number" min={1} max={9} value={contractSigners} onChange={e => setContractSigners(Math.max(1, Number(e.target.value) || 1))} /></label>
          <button type="button" onClick={() => setContractOut(contractTemplate(contractName, Math.min(contractReq, contractSigners), contractSigners))}>GENERATE TEMPLATE</button>
          {contractOut && <pre className="tc-pre">{contractOut}</pre>}
          <p className="tc-hint">Generated text only — unaudited, never deployed by this app. Review + audit before any real use.</p>
        </section>

        <section className="tc-panel">
          <h2>API SCHEMA DECODER</h2>
          <textarea rows={10} value={decoderIn} onChange={e => setDecoderIn(e.target.value)} aria-label="Payload to decode" />
          <div className="tc-btn-row">
            <button type="button" onClick={() => { const r = decodePayload(decoderIn); setDecoderOut(`shape: ${r.shape}\n${r.summary}\n${r.errors.length ? '✗ ' + r.errors.join('\n✗ ') : '✓ all genesis rules pass (0xKEY_ format · ×100 scaling · signer set)'}`) }}>DECODE + VALIDATE</button>
            <button type="button" onClick={() => block && setDecoderIn(JSON.stringify(block, null, 2))}>LOAD LAST BLOCK</button>
            <button type="button" onClick={() => setDecoderIn(JSON.stringify(TRANSCRIPT_MULTISIG, null, 2))}>LOAD REGISTERED MULTI-SIG</button>
          </div>
          {decoderOut && <pre className="tc-pre">{decoderOut}</pre>}

          <h3>OCTOKIT COMPARTMENTS (LOCAL MODEL — NO LIVE GITHUB CALLS)</h3>
          {COMPARTMENTS.map(c => (
            <details key={c.id} className="tc-compartment">
              <summary><strong>{c.title}</strong> · <code>{c.octokitRepo}</code></summary>
              <ul className="tc-list">{c.layers.map(l => <li key={l.level}><code>{l.level} {l.api}</code> — {l.purpose}</li>)}</ul>
            </details>
          ))}
          <button type="button" onClick={() => download('genesis-compartments.json', JSON.stringify({ protocol: PROTOCOL_ID, compartments: COMPARTMENTS, cache: cacheRef.current }, null, 2))}>EXPORT COMPARTMENT MAP (VACUUM CACHE SNAPSHOT)</button>
        </section>
      </div>

      <section className="tc-panel">
        <h2>OPEN SANDBOXED SCRIPT PORT — TelemetryAPI INJECTION PLAYGROUND</h2>
        <p className="tc-hint">Your script runs only in this browser tab, against <code>TelemetryAPI</code>: <code>getCache()</code> (vacuum-collect the live cache wherever it exists in the console state) · <code>updateHashRegistry({'{'}title, body{'}'})</code> (inject straight back into the asset registry) · <code>log()</code> · <code>hashString()</code> → 0xKEY_ · <code>getBeacons()</code> · <code>tickers()</code> · <code>advanceGen()</code>. Channel growth, no friction — and nothing leaves the tab.</p>
        <textarea rows={12} value={script} onChange={e => setScript(e.target.value)} aria-label="Script to inject" spellCheck={false} />
        <div className="tc-btn-row">
          <button type="button" className="tc-save" onClick={runScript}>▶ RUN SCRIPT</button>
          <button type="button" onClick={() => setScript(SCRIPT_BOILERPLATE)}>LOAD BOILERPLATE EXAMPLE</button>
        </div>
        {scriptOut && <pre className="tc-pre">{scriptOut}</pre>}
      </section>

      <section className="tc-panel">
        <h2>TIMESTAMP BUFFER REGISTRY — WHAT EACH STAMP IS FOR</h2>
        <ul className="tc-list">
          <li><code>log ts</code> — orders the non-stop stream; the ⟨ts: …⟩ note under every line states its purpose.</li>
          <li><code>[AUTOMATED THINKING] ts</code> — start of the thinking buffer; output commits ~650ms later inside the {LOG_CADENCE_MS}ms cycle.</li>
          <li><code>transaction.timestamp</code> — pinned deterministic fixture time (1792892079596) so CI batches are byte-identical.</li>
          <li><code>signaturePayloads[].timestamp</code> — when each simulated signer approved; proves threshold order 1/2 → 2/2.</li>
          <li><code>savedAt / exportedAt</code> — when YOU pressed save/export. The only persistence stamps that exist.</li>
          <li><code>recon ts (⚠ lines)</code> — the exact decode moment a CWE pattern completed in the typing matrix buffer.</li>
        </ul>
        <p className="tc-hint">Truth anchor: <code>{TRUTH_ANCHOR}</code> · registered verbatim in <code>docs/telemetry/HASH-REGISTRY.md</code> with every hash from the working session, saved for later work.</p>
      </section>

      {modalFinding && (
        <div className="tc-modal-backdrop" onClick={() => setModalFinding(null)}>
          <div className="tc-modal" role="dialog" aria-modal="true" aria-label={`Security deconstruction ${modalFinding.cwe}`} onClick={e => e.stopPropagation()}>
            <header>
              <span className={`tc-sev sev-${modalFinding.severity}`}>{SEVERITY_LABEL[modalFinding.severity]}</span>
              <h2>{modalFinding.cwe} — SECURITY DECONSTRUCTION</h2>
              <button type="button" className="tc-modal-close" onClick={() => setModalFinding(null)} aria-label="Close deconstruction">✕</button>
            </header>
            <p><strong>{modalFinding.name}</strong> · rule <code>{modalFinding.ruleId}</code> · confidence {modalFinding.confidence} (heuristic pattern match)</p>
            <h3>⚠ WHAT THE FLAW IS</h3>
            <p>{modalFinding.description}</p>
            <h3>⌖ EVIDENCE — {activeSnippet.id} line {modalFinding.line}</h3>
            <pre className="tc-pre">{modalFinding.evidence}</pre>
            <h3>⬢ DEFENSIVE FIX</h3>
            <p>{modalFinding.remediation}</p>
            <h3>◈ CONTEXT IN THIS CONSOLE</h3>
            <ul className="tc-list">
              <li>Sequence: <code>{activeSnippet.id}</code> “{activeSnippet.title}” — simulated training block; its code was scanned as text and never executed.</li>
              <li>Discovered live at decode offset ~{decodeChars}/{activeSnippet.code.length} chars, then committed to the recon matrix on decode completion.</li>
              <li>Preserved flow at discovery: cadence {LOG_CADENCE_MS}ms · mechanical pressure {pressure} chars/tick · generation {generation} · {frozen ? 'stream frozen' : 'stream live'}.</li>
            </ul>
            <p className="tc-hint">
              Reference: <a href={`https://cwe.mitre.org/data/definitions/${modalFinding.cwe.replace('CWE-', '')}.html`} target="_blank" rel="noreferrer">MITRE {modalFinding.cwe}</a>
              {' '}· Esc or click outside to close · findings are diagnostics with fixes — this console publishes no exploit steps.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
