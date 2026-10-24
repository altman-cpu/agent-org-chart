import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { speakWithDeviceVoice, stopDeviceVoice } from './lib/speech'
import './driver-tools.css'

type TabId = 'planner' | 'appeal' | 'integration'

type PlannerInputs = {
  grossPerHour: number
  milesPerHour: number
  vehicleCostPerMile: number
  shiftHours: number
  netTarget: number
}

const PLANNER_KEY = 'agent-army.driver-tools.planner.v1'
const CHECKLIST_KEY = 'agent-army.driver-tools.integration-checklist.v1'
const DEFAULT_PLANNER: PlannerInputs = {
  grossPerHour: 28,
  milesPerHour: 8,
  vehicleCostPerMile: 0.24,
  shiftHours: 6,
  netTarget: 120,
}

const INTEGRATION_CHECKS = [
  {
    id: 'docs',
    title: 'Confirm an official, documented interface exists',
    detail: 'Verify the product, endpoints, data fields, and current terms with the provider. Do not guess or probe private endpoints.',
  },
  {
    id: 'permission',
    title: 'Get explicit permission and define the allowed scope',
    detail: 'Name the user benefit, data required, retention period, and who can access it. Start read-only where possible.',
  },
  {
    id: 'sandbox',
    title: 'Use a sandbox or test account first',
    detail: 'Test against provider-approved sample data before connecting real driver or trip information.',
  },
  {
    id: 'auth',
    title: 'Design secure authentication and secret storage',
    detail: 'Never place OAuth tokens, passwords, or API keys in browser code, source control, or chat.',
  },
  {
    id: 'privacy',
    title: 'Set privacy, deletion, and rate-limit rules',
    detail: 'Collect only what the feature needs, respect provider limits, and give the user a way to disconnect and delete data.',
  },
  {
    id: 'fallback',
    title: 'Keep a safe manual fallback',
    detail: 'Allow a user-reviewed CSV or manual workflow if a supported API is unavailable; never change account or pay settings automatically.',
  },
]

const initialAppeal = {
  company: 'Uber',
  issue: 'Earnings discrepancy',
  dateOrTrip: '',
  reference: '',
  facts: '',
  evidence: '',
  requestedOutcome: '',
  name: '',
}

type AppealForm = typeof initialAppeal

function readStoredObject<T extends object>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
    return { ...fallback, ...value } as T
  } catch {
    return fallback
  }
}

function safeNumber(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

function normalizePlanner(value: Partial<PlannerInputs>): PlannerInputs {
  return {
    grossPerHour: safeNumber(value.grossPerHour, DEFAULT_PLANNER.grossPerHour),
    milesPerHour: safeNumber(value.milesPerHour, DEFAULT_PLANNER.milesPerHour),
    vehicleCostPerMile: safeNumber(value.vehicleCostPerMile, DEFAULT_PLANNER.vehicleCostPerMile),
    shiftHours: safeNumber(value.shiftHours, DEFAULT_PLANNER.shiftHours),
    netTarget: safeNumber(value.netTarget, DEFAULT_PLANNER.netTarget),
  }
}

function money(value: number, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0)
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i]
    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(cell.trim())
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      cell = ''
      if (character === '\r' && text[i + 1] === '\n') i += 1
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('CSV error: a quoted value was not closed.')
  row.push(cell.trim())
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

function aggregateTripCsv(text: string) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV error: add a header row and at least one data row.')

  const normalizeHeader = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const headers = rows[0].map(normalizeHeader)
  const grossIndex = headers.indexOf('gross')
  const milesIndex = headers.indexOf('miles')
  const hoursIndex = headers.indexOf('online_hours')

  if (grossIndex < 0 || milesIndex < 0 || hoursIndex < 0) {
    throw new Error('CSV error: required headers are gross, miles, online_hours.')
  }

  const parseValue = (value: string | undefined) => {
    if (typeof value !== 'string' || !value.trim()) return null
    const numeric = Number(value.replace(/[$,\s]/g, ''))
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
  }
  let grossTotal = 0
  let milesTotal = 0
  let hoursTotal = 0
  let validRows = 0

  for (const values of rows.slice(1)) {
    const gross = parseValue(values[grossIndex] ?? '')
    const miles = parseValue(values[milesIndex] ?? '')
    const hours = parseValue(values[hoursIndex] ?? '')
    if (gross === null || miles === null || hours === null || hours <= 0) continue
    grossTotal += gross
    milesTotal += miles
    hoursTotal += hours
    validRows += 1
  }

  if (!validRows || hoursTotal <= 0) throw new Error('CSV error: no valid rows found; check that gross, miles, and online_hours are numeric.')
  return {
    rows: validRows,
    grossPerHour: roundTwo(grossTotal / hoursTotal),
    milesPerHour: roundTwo(milesTotal / hoursTotal),
  }
}

function buildAppealDraft(form: AppealForm) {
  const evidence = form.evidence.split('\n').map(item => item.trim()).filter(Boolean)
  const lines = [
    `Subject: Request for review — ${form.company || 'Platform'} / ${form.issue || 'Issue review'}`,
    '',
    'Hello Support,',
    '',
    'Please review the matter below. I have included the facts and records that I can verify.',
    '',
    'Issue',
    form.issue || '[Choose an issue type]',
  ]

  if (form.dateOrTrip.trim()) lines.push('', 'Relevant date or trip details', form.dateOrTrip.trim())
  if (form.reference.trim()) lines.push('', 'Reference number', form.reference.trim())
  lines.push(
    '',
    'What happened',
    form.facts.trim() || '[Add a concise, factual timeline. Include only details you can verify.]',
    '',
    'Supporting evidence',
    ...(evidence.length ? evidence.map(item => `- ${item}`) : ['- [List relevant receipts, notices, or screenshots you can provide.]']),
    '',
    'Requested resolution',
    form.requestedOutcome.trim() || '[State the specific review or correction you are requesting.]',
    '',
    'Thank you,',
    form.name.trim() || '[Your name]',
  )
  return lines.join('\n')
}

function downloadText(filename: string, contents: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyText(contents: string) {
  try {
    await navigator.clipboard.writeText(contents)
    return true
  } catch {
    return false
  }
}

function NumberField({
  id,
  label,
  value,
  unit,
  help,
  step = '0.01',
  onChange,
}: {
  id: string
  label: string
  value: number
  unit: string
  help: string
  step?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="driver-field">
      <label htmlFor={id}>{label}</label>
      <div className="driver-number-wrap">
        {unit.startsWith('$') && <span className="driver-number-unit">$</span>}
        <input
          id={id}
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={event => {
            const numeric = Number(event.currentTarget.value)
            onChange(Number.isFinite(numeric) ? Math.max(0, numeric) : 0)
          }}
        />
        {(unit.startsWith('$') ? unit.slice(1).trim() : unit) && (
          <span className="driver-number-unit driver-number-suffix">{unit.startsWith('$') ? unit.slice(1).trim() : unit}</span>
        )}
      </div>
      <small>{help}</small>
    </div>
  )
}

export default function DriverWorkspace({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('planner')
  const [planner, setPlanner] = useState<PlannerInputs>(() => normalizePlanner(readStoredObject(PLANNER_KEY, DEFAULT_PLANNER)))
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => readStoredObject(CHECKLIST_KEY, {}))
  const [csvMessage, setCsvMessage] = useState('')
  const [appealForm, setAppealForm] = useState<AppealForm>(initialAppeal)
  const [appealMessage, setAppealMessage] = useState('')
  const [integrationGoal, setIntegrationGoal] = useState('')
  const [docsUrl, setDocsUrl] = useState('')
  const [integrationMessage, setIntegrationMessage] = useState('')
  const [speechMessage, setSpeechMessage] = useState('')
  const csvInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => stopDeviceVoice(), [])

  useEffect(() => {
    try {
      window.localStorage.setItem(PLANNER_KEY, JSON.stringify(planner))
    } catch {
      // Storage may be disabled; the tool still works for this visit.
    }
  }, [planner])

  useEffect(() => {
    try {
      window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklist))
    } catch {
      // Storage may be disabled; the checklist still works for this visit.
    }
  }, [checklist])

  const estimatedGross = planner.grossPerHour * planner.shiftHours
  const estimatedMiles = planner.milesPerHour * planner.shiftHours
  const estimatedVehicleCost = estimatedMiles * planner.vehicleCostPerMile
  const estimatedNet = estimatedGross - estimatedVehicleCost
  const estimatedNetPerHour = planner.shiftHours > 0 ? estimatedNet / planner.shiftHours : 0
  const hoursToTarget = estimatedNetPerHour > 0 ? planner.netTarget / estimatedNetPerHour : null
  const targetProgress = planner.netTarget > 0
    ? Math.max(0, Math.min(100, (estimatedNet / planner.netTarget) * 100))
    : estimatedNet >= 0 ? 100 : 0

  const appealDraft = useMemo(() => buildAppealDraft(appealForm), [appealForm])
  const completedChecks = INTEGRATION_CHECKS.filter(item => checklist[item.id] === true).length
  const forecastSpeechText = `Estimated gross: ${money(estimatedGross)}. Estimated mileage cost: ${money(estimatedVehicleCost)}. Estimated net: ${money(estimatedNet)} over ${planner.shiftHours} online hours. Your personal target is ${money(planner.netTarget)}. This is an estimate, not a guarantee.`

  const setPlannerValue = (key: keyof PlannerInputs, value: number) => {
    setPlanner(current => ({ ...current, [key]: value }))
  }

  const setAppealValue = (key: keyof AppealForm, value: string) => {
    setAppealForm(current => ({ ...current, [key]: value }))
    setAppealMessage('')
  }

  const readAloud = (text: string) => {
    const result = speakWithDeviceVoice(text)
    setSpeechMessage(result.ok ? `${result.message} Voice: ${result.voiceName}.` : result.message)
  }

  const stopReadAloud = () => {
    stopDeviceVoice()
    setSpeechMessage('Read-aloud stopped.')
  }

  const handleCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const summary = aggregateTripCsv(await file.text())
      setPlanner(current => ({ ...current, grossPerHour: summary.grossPerHour, milesPerHour: summary.milesPerHour }))
      setCsvMessage(`Used ${summary.rows} valid rows to update your average gross and miles per online hour. The file stayed in your browser.`)
    } catch (error) {
      setCsvMessage(error instanceof Error ? error.message : 'CSV error: unable to read this file.')
    } finally {
      input.value = ''
    }
  }

  const resetPlanner = () => {
    setPlanner(DEFAULT_PLANNER)
    setCsvMessage('Example assumptions restored. Edit them to match your own records.')
  }

  const handleCopyAppeal = async () => {
    setAppealMessage(await copyText(appealDraft)
      ? 'Draft copied. Review every detail before submitting it yourself.'
      : 'Clipboard access was blocked. Download the draft instead.')
  }

  const integrationBrief = [
    'Driver toolkit integration brief',
    '',
    `Goal: ${integrationGoal.trim() || '[Describe the driver workflow to support]'}`,
    `Official documentation: ${docsUrl.trim() || '[Add a verified official documentation URL]'}`,
    `Readiness checklist: ${completedChecks} of ${INTEGRATION_CHECKS.length} items marked complete`,
    ...INTEGRATION_CHECKS.map(item => `- [${checklist[item.id] === true ? 'x' : ' '}] ${item.title}`),
    '',
    'Constraints: use only documented, authorized interfaces; obtain user consent; keep secrets out of browser code; do not automate pay/account changes or appeal outcomes.',
    'Status: planning only. No live integration, account access, or server calls are implemented.',
  ].join('\n')

  const handleCopyIntegrationBrief = async () => {
    setIntegrationMessage(await copyText(integrationBrief)
      ? 'Integration brief copied.'
      : 'Clipboard access was blocked. Select the brief text and copy it manually.')
  }

  return (
    <main className="driver-workspace">
      <div className="driver-shell">
        <header className="driver-topbar">
          <button type="button" className="driver-back" onClick={onBack} aria-label="Back to Agent Army org charts">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Agent Army</span>
          </button>
          <div className="driver-topbar-center"><span className="driver-mark" aria-hidden="true">DT</span><span>Driver toolkit</span></div>
          <span className="driver-local-pill"><span aria-hidden="true" />Local-first</span>
        </header>

        <section className="driver-intro">
          <p className="driver-eyebrow">INDEPENDENT RIDESHARE WORKSPACE</p>
          <h1>Make each shift more intentional.</h1>
          <p className="driver-intro-copy">Estimate shift economics, prepare a fact-based support request, and plan any future integration around documented, authorized access.</p>
          <p className="driver-disclaimer"><strong>Independent prototype.</strong> Not affiliated with Mystro or Uber. It makes no provider account/API calls, unlocks no paid features, changes no pay/account settings, and submits no appeals. Read-aloud uses the browser/device voice; speech-to-text has no provider configured.</p>
        </section>

        <nav className="driver-tabs" role="tablist" aria-label="Driver toolkit">
          <button type="button" role="tab" id="tab-planner" aria-selected={activeTab === 'planner'} aria-controls="panel-planner" className={activeTab === 'planner' ? 'is-active' : ''} onClick={() => setActiveTab('planner')}>
            <span className="driver-tab-index">01</span><span>Earnings planner</span>
          </button>
          <button type="button" role="tab" id="tab-appeal" aria-selected={activeTab === 'appeal'} aria-controls="panel-appeal" className={activeTab === 'appeal' ? 'is-active' : ''} onClick={() => setActiveTab('appeal')}>
            <span className="driver-tab-index">02</span><span>Appeal prep</span>
          </button>
          <button type="button" role="tab" id="tab-integration" aria-selected={activeTab === 'integration'} aria-controls="panel-integration" className={activeTab === 'integration' ? 'is-active' : ''} onClick={() => setActiveTab('integration')}>
            <span className="driver-tab-index">03</span><span>Integration plan</span>
          </button>
        </nav>

        {activeTab === 'planner' && (
          <section className="driver-tabpanel" id="panel-planner" role="tabpanel" aria-labelledby="tab-planner">
            <div className="driver-layout driver-layout-planner">
              <section className="driver-card driver-input-card">
                <div className="driver-card-head">
                  <div><p className="driver-section-label">SHIFT ASSUMPTIONS</p><h2>Use your own numbers</h2><p>Start with the example, edit it, or import a trip-summary CSV.</p></div>
                  <span className="driver-card-icon" aria-hidden="true">↗</span>
                </div>
                <div className="driver-fields">
                  <NumberField id="gross-per-hour" label="Average gross per online hour" unit="$ / hr" value={planner.grossPerHour} help="Use your historical gross, before costs." onChange={value => setPlannerValue('grossPerHour', value)} />
                  <NumberField id="miles-per-hour" label="Average miles per online hour" unit="mi / hr" value={planner.milesPerHour} help="Include pickup and repositioning miles if known." onChange={value => setPlannerValue('milesPerHour', value)} />
                  <NumberField id="vehicle-cost" label="Estimated vehicle cost per mile" unit="$ / mi" value={planner.vehicleCostPerMile} help="Your own estimate for fuel, wear, and maintenance." onChange={value => setPlannerValue('vehicleCostPerMile', value)} />
                  <NumberField id="shift-hours" label="Planned online hours" unit="hours" step="0.25" value={planner.shiftHours} help="Your planned time available for this shift." onChange={value => setPlannerValue('shiftHours', value)} />
                  <NumberField id="net-target" label="Personal net target" unit="$" value={planner.netTarget} help="Your target after the mileage cost entered above." onChange={value => setPlannerValue('netTarget', value)} />
                </div>
                <div className="driver-import-row">
                  <input ref={csvInput} className="driver-hidden-file" type="file" accept=".csv,text/csv" onChange={handleCsv} aria-label="Choose a trip summary CSV" />
                  <button type="button" className="driver-button driver-button-primary" onClick={() => csvInput.current?.click()}>Import trip CSV</button>
                  <button type="button" className="driver-button driver-button-quiet" onClick={() => downloadText('driver-trip-summary-template.csv', 'gross,miles,online_hours\n140,42,5\n', 'text/csv;charset=utf-8')}>Get CSV template</button>
                  <button type="button" className="driver-text-button" onClick={resetPlanner}>Reset example</button>
                </div>
                {csvMessage && <p className={`driver-status${csvMessage.startsWith('CSV error') ? ' is-error' : ''}`} role="status">{csvMessage}</p>}
                <p className="driver-privacy-note">CSV is parsed in this browser; it is not uploaded. Required headers: <code>gross,miles,online_hours</code>.</p>
              </section>

              <aside className="driver-card driver-results-card" aria-live="polite">
                <p className="driver-section-label">ESTIMATED SHIFT RESULT</p>
                <h2>Personal forecast</h2>
                <p className="driver-result-kicker">Estimated net after the vehicle cost you entered</p>
                <p className="driver-net-total">{money(estimatedNet)}</p>
                <div className="driver-progress-wrap">
                  <div className="driver-progress-label"><span>Personal net target</span><strong>{money(planner.netTarget)}</strong></div>
                  <div className="driver-progress" role="progressbar" aria-label="Estimated progress toward personal net target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(targetProgress)}><span style={{ width: `${targetProgress}%` }} /></div>
                  <div className="driver-progress-meta"><span>{money(estimatedNet)} forecast</span><span>{Math.round(targetProgress)}%</span></div>
                </div>
                <dl className="driver-metrics">
                  <div><dt>Estimated gross</dt><dd>{money(estimatedGross)}</dd></div>
                  <div><dt>Estimated mileage cost</dt><dd>−{money(estimatedVehicleCost)}</dd></div>
                  <div><dt>Estimated miles</dt><dd>{estimatedMiles.toFixed(1)} mi</dd></div>
                  <div><dt>Net per online hour</dt><dd>{money(estimatedNetPerHour)} / hr</dd></div>
                </dl>
                <p className={`driver-target-note${estimatedNet >= planner.netTarget ? ' is-good' : ''}`}>
                  {estimatedNet >= planner.netTarget
                    ? 'At these assumptions, your forecast reaches the personal target.'
                    : hoursToTarget !== null
                      ? `At this estimated net rate, about ${hoursToTarget.toFixed(1)} online hours would reach the target.`
                      : 'This estimate is at or below zero net per hour; adjust assumptions or review the cost inputs.'}
                </p>
                <div className="driver-speech-actions">
                  <button type="button" className="driver-button driver-button-quiet" onClick={() => readAloud(forecastSpeechText)}>Read forecast aloud</button>
                  <button type="button" className="driver-text-button" onClick={stopReadAloud}>Stop</button>
                </div>
                {speechMessage && <p className="driver-status" role="status">{speechMessage}</p>}
                <p className="driver-footnote">Estimate only — excludes taxes, tolls, insurance, downtime, and other costs unless included in your inputs. Actual earnings are not guaranteed and this tool cannot change platform pay.</p>
              </aside>
            </div>
          </section>
        )}

        {activeTab === 'appeal' && (
          <section className="driver-tabpanel" id="panel-appeal" role="tabpanel" aria-labelledby="tab-appeal">
            <div className="driver-appeal-grid">
              <section className="driver-card driver-input-card">
                <div className="driver-card-head">
                  <div><p className="driver-section-label">SUPPORT REQUEST BUILDER</p><h2>Organize a clear appeal</h2><p>Use verifiable details and list the records you can attach.</p></div>
                  <span className="driver-card-icon" aria-hidden="true">✎</span>
                </div>
                <div className="driver-fields driver-fields-appeal">
                  <div className="driver-field"><label htmlFor="appeal-company">Company to contact</label><select id="appeal-company" value={appealForm.company} onChange={event => setAppealValue('company', event.currentTarget.value)}><option>Uber</option><option>Mystro</option><option>Other</option></select></div>
                  <div className="driver-field"><label htmlFor="appeal-issue">Issue type</label><select id="appeal-issue" value={appealForm.issue} onChange={event => setAppealValue('issue', event.currentTarget.value)}><option>Earnings discrepancy</option><option>Account access</option><option>Trip or fare review</option><option>Policy notice</option><option>Other</option></select></div>
                  <div className="driver-field"><label htmlFor="appeal-date">Relevant date or trip details <span>(optional)</span></label><input id="appeal-date" value={appealForm.dateOrTrip} onChange={event => setAppealValue('dateOrTrip', event.currentTarget.value)} placeholder="Date, trip ID, or time window" /></div>
                  <div className="driver-field"><label htmlFor="appeal-reference">Support/reference number <span>(optional)</span></label><input id="appeal-reference" value={appealForm.reference} onChange={event => setAppealValue('reference', event.currentTarget.value)} placeholder="Case or notice reference" /></div>
                  <div className="driver-field driver-field-wide"><label htmlFor="appeal-facts">What happened?</label><textarea id="appeal-facts" rows={4} value={appealForm.facts} onChange={event => setAppealValue('facts', event.currentTarget.value)} placeholder="Write a short, neutral timeline. Include only facts you can verify." /></div>
                  <div className="driver-field driver-field-wide"><label htmlFor="appeal-evidence">Evidence you can provide <span>(one item per line)</span></label><textarea id="appeal-evidence" rows={3} value={appealForm.evidence} onChange={event => setAppealValue('evidence', event.currentTarget.value)} placeholder={'Trip receipt or earnings statement\nRelevant support notice\nScreenshot with date visible'} /></div>
                  <div className="driver-field driver-field-wide"><label htmlFor="appeal-outcome">What resolution are you requesting?</label><textarea id="appeal-outcome" rows={3} value={appealForm.requestedOutcome} onChange={event => setAppealValue('requestedOutcome', event.currentTarget.value)} placeholder="For example, ask for a review of a specific trip or a written explanation." /></div>
                  <div className="driver-field"><label htmlFor="appeal-name">Sign-off <span>(optional)</span></label><input id="appeal-name" value={appealForm.name} onChange={event => setAppealValue('name', event.currentTarget.value)} placeholder="Your name" /></div>
                </div>
                <div className="driver-action-row">
                  <button type="button" className="driver-button driver-button-primary" onClick={handleCopyAppeal}>Copy draft</button>
                  <button type="button" className="driver-button driver-button-quiet" onClick={() => downloadText('support-appeal-draft.txt', appealDraft)}>Download draft</button>
                  <button type="button" className="driver-button driver-button-quiet" onClick={() => readAloud(appealDraft)}>Read draft aloud</button>
                  <button type="button" className="driver-text-button" onClick={stopReadAloud}>Stop audio</button>
                  <button type="button" className="driver-text-button" onClick={() => { setAppealForm(initialAppeal); setAppealMessage('Draft cleared.') }}>Clear</button>
                </div>
                {appealMessage && <p className="driver-status" role="status">{appealMessage}</p>}
                {speechMessage && <p className="driver-status" role="status">{speechMessage}</p>}
                <p className="driver-privacy-note">Draft details remain in this tab only; they are not saved or sent. Read-aloud uses one browser/device English voice and does not use Qwen or upload audio. Speech-to-text requires a separate provider and is not connected yet. Do not include passwords, one-time codes, full payment-card numbers, or Social Security numbers.</p>
              </section>

              <aside className="driver-card driver-preview-card">
                <p className="driver-section-label">LIVE PREVIEW</p>
                <h2>Review before you send</h2>
                <p className="driver-preview-hint">Check names, dates, amounts, and attachments. Remove anything you cannot substantiate.</p>
                <pre className="driver-appeal-preview">{appealDraft}</pre>
                <p className="driver-footnote">This drafts text only. It does not submit an appeal or influence the platform’s decision.</p>
              </aside>
            </div>
          </section>
        )}

        {activeTab === 'integration' && (
          <section className="driver-tabpanel" id="panel-integration" role="tabpanel" aria-labelledby="tab-integration">
            <div className="driver-integration-grid">
              <section className="driver-card driver-input-card">
                <div className="driver-card-head">
                  <div><p className="driver-section-label">AUTHORIZED ACCESS ONLY</p><h2>Plan before connecting</h2><p>No API or account connection is active in this prototype.</p></div>
                  <span className="driver-card-icon" aria-hidden="true">⌘</span>
                </div>
                <div className="driver-integration-form">
                  <div className="driver-field"><label htmlFor="integration-goal">Driver workflow to support</label><textarea id="integration-goal" rows={3} value={integrationGoal} onChange={event => { setIntegrationGoal(event.currentTarget.value); setIntegrationMessage('') }} placeholder="Example: import a driver-approved trip summary for personal earnings analysis." /></div>
                  <div className="driver-field"><label htmlFor="integration-docs">Verified official documentation URL <span>(optional)</span></label><input id="integration-docs" type="url" value={docsUrl} onChange={event => { setDocsUrl(event.currentTarget.value); setIntegrationMessage('') }} placeholder="https://…" /></div>
                </div>

                <div className="driver-checklist-head">
                  <div><h3>Readiness checklist</h3><p>Mark items only after you have confirmed them.</p></div>
                  <strong>{completedChecks}/{INTEGRATION_CHECKS.length}</strong>
                </div>
                <div className="driver-checklist">
                  {INTEGRATION_CHECKS.map(item => (
                    <label key={item.id} className="driver-check-item">
                      <input type="checkbox" checked={checklist[item.id] === true} onChange={() => setChecklist(current => ({ ...current, [item.id]: current[item.id] !== true }))} />
                      <span className="driver-check-text"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    </label>
                  ))}
                </div>
                <div className="driver-action-row">
                  <button type="button" className="driver-button driver-button-primary" onClick={handleCopyIntegrationBrief}>Copy integration brief</button>
                  <button type="button" className="driver-button driver-button-quiet" onClick={() => downloadText('driver-integration-brief.txt', integrationBrief)}>Download brief</button>
                  <button type="button" className="driver-text-button" onClick={() => { setChecklist({}); setIntegrationMessage('Checklist reset.') }}>Reset checklist</button>
                </div>
                {integrationMessage && <p className="driver-status" role="status">{integrationMessage}</p>}
                <p className="driver-privacy-note">Checklist progress is saved in local browser storage. Do not paste credentials or secrets into the documentation field.</p>
              </section>

              <aside className="driver-side-stack">
                <section className="driver-card driver-boundaries-card">
                  <p className="driver-section-label">SAFE BUILD SEQUENCE</p>
                  <h2>What to do next</h2>
                  <ol className="driver-sequence">
                    <li><span>01</span><div><strong>Verify support</strong><small>Confirm in current official docs that the exact data and operation are supported.</small></div></li>
                    <li><span>02</span><div><strong>Start read-only</strong><small>Use user-consented imports before considering a live connection.</small></div></li>
                    <li><span>03</span><div><strong>Secure credentials</strong><small>Keep tokens server-side or in a managed vault; never ship secrets to the browser.</small></div></li>
                    <li><span>04</span><div><strong>Test and audit</strong><small>Add rate-limit handling, deletion controls, and a manual fallback.</small></div></li>
                  </ol>
                  <a className="driver-doc-link" href="https://developer.uber.com/" target="_blank" rel="noreferrer">Uber Developer portal <span aria-hidden="true">↗</span></a>
                  <p className="driver-footnote">The link is a starting point only. This project has not verified that a driver account API or the desired scopes are available.</p>
                </section>

                <section className="driver-card driver-roadmap-card">
                  <p className="driver-section-label">WAYS TO STRENGTHEN THE APP</p>
                  <h2>Good next upgrades</h2>
                  <ul className="driver-roadmap-list">
                    <li><span aria-hidden="true">↗</span><div><strong>Better trip imports</strong><small>Support more user-owned export formats and validate their columns.</small></div></li>
                    <li><span aria-hidden="true">⌁</span><div><strong>Privacy controls</strong><small>Add one-click deletion, clear data notices, and an optional encrypted backup.</small></div></li>
                    <li><span aria-hidden="true">✓</span><div><strong>Accuracy checks</strong><small>Test cost calculations and CSV edge cases against sample records.</small></div></li>
                    <li><span aria-hidden="true">▣</span><div><strong>Mobile & offline polish</strong><small>Make the planner installable, keyboard-friendly, and useful without a connection.</small></div></li>
                  </ul>
                </section>
              </aside>
            </div>
          </section>
        )}

        <footer className="driver-footer">Planning estimates are not earnings guarantees. Use official support channels for account matters. Your data stays in this browser unless you choose to copy or download it.</footer>
      </div>
    </main>
  )
}
