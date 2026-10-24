import { useEffect, useMemo, useState } from 'react'
import { BUSINESS_CONNECTORS, DIGITAL_ASSET_READ_POLICY, REQUESTED_DIGITAL_ASSET_SOURCE } from './lib/business-adapters'
import './business-workspace.css'

type BusinessTab = 'overview' | 'services' | 'rideshare' | 'integrations'

type BusinessProfile = {
  name: string
  location: string
  contact: string
}

type ServiceItem = {
  id: string
  name: string
  description: string
  audience: string
  price: string
  enabled: boolean
}

const PROFILE_KEY = 'agent-army.business.profile.v1'
const SERVICES_KEY = 'agent-army.business.services.v1'
const PROFILE_DEFAULT: BusinessProfile = { name: 'DASH Car Wash', location: '', contact: '' }
const SERVICES_DEFAULT: ServiceItem[] = [
  { id: 'quick-wash', name: 'Quick wash', description: 'Exterior clean for a quick vehicle turnaround.', audience: 'All customers', price: '', enabled: true },
  { id: 'interior-reset', name: 'Interior reset', description: 'Interior-focused cleanup between busy driving days.', audience: 'All customers', price: '', enabled: true },
  { id: 'driver-ready', name: 'Rideshare-ready clean', description: 'A repeatable interior and exterior service for driver vehicles.', audience: 'Rideshare drivers', price: '', enabled: true },
  { id: 'fleet-plan', name: 'Fleet recurring plan', description: 'Scheduled washes for partner fleets; configure terms before offering.', audience: 'Fleet accounts', price: '', enabled: true },
]

const TABS: Array<{ id: BusinessTab; number: string; label: string }> = [
  { id: 'overview', number: '01', label: 'Business overview' },
  { id: 'services', number: '02', label: 'Service menu' },
  { id: 'rideshare', number: '03', label: 'Rideshare add-on' },
  { id: 'integrations', number: '04', label: 'Integrations' },
]

function loadStoredObject<T extends object>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    return { ...fallback, ...parsed } as T
  } catch {
    return fallback
  }
}

function loadServices(): ServiceItem[] {
  try {
    const raw = window.localStorage.getItem(SERVICES_KEY)
    if (!raw) return SERVICES_DEFAULT
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return SERVICES_DEFAULT
    return parsed.filter((item): item is ServiceItem =>
      !!item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string',
    ).map(item => ({
      id: item.id,
      name: item.name,
      description: typeof item.description === 'string' ? item.description : '',
      audience: typeof item.audience === 'string' ? item.audience : 'All customers',
      price: typeof item.price === 'string' ? item.price : '',
      enabled: item.enabled !== false,
    }))
  } catch {
    return SERVICES_DEFAULT
  }
}

function safeCopy(contents: string) {
  return navigator.clipboard.writeText(contents)
}

function downloadSpec(contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'dash-car-wash-integration-brief.txt'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function BusinessWorkspace({
  onBack,
  onOpenDriverTools,
}: {
  onBack: () => void
  onOpenDriverTools: () => void
}) {
  const [tab, setTab] = useState<BusinessTab>('overview')
  const [profile, setProfile] = useState<BusinessProfile>(() => loadStoredObject(PROFILE_KEY, PROFILE_DEFAULT))
  const [services, setServices] = useState<ServiceItem[]>(loadServices)
  const [message, setMessage] = useState('')
  const activeServices = services.filter(service => service.enabled).length

  useEffect(() => {
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } catch {
      // The workspace remains usable if local browser storage is unavailable.
    }
  }, [profile])

  useEffect(() => {
    try {
      window.localStorage.setItem(SERVICES_KEY, JSON.stringify(services))
    } catch {
      // The workspace remains usable if local browser storage is unavailable.
    }
  }, [services])

  const integrationBrief = useMemo(() => [
    'DASH Car Wash — integration brief',
    '',
    `Business: ${profile.name.trim() || '[Business name]'}`,
    `Location/service area: ${profile.location.trim() || '[Not configured]'}`,
    `Contact: ${profile.contact.trim() || '[Not configured]'}`,
    '',
    'Requested connectors:',
    ...BUSINESS_CONNECTORS.map(item => `- ${item.label}: ${item.provider} (${item.status})`),
    '',
    `Requested digital-asset provider label: ${REQUESTED_DIGITAL_ASSET_SOURCE.providerLabel} / ${REQUESTED_DIGITAL_ASSET_SOURCE.requestedSpec} (identity and official documentation still need confirmation).`,
    `Read policy: read-only=${DIGITAL_ASSET_READ_POLICY.readOnly}; past analytics=${DIGITAL_ASSET_READ_POLICY.storePastAnalytics}; personalization=${DIGITAL_ASSET_READ_POLICY.personalizeFromUserHistory}; transactions=${DIGITAL_ASSET_READ_POLICY.executeTransactions}; wallet credentials=${DIGITAL_ASSET_READ_POLICY.accessWalletCredentials}.`,
    '',
    'Integration constraints: use only current official documentation and authorized scopes; obtain user consent; keep secrets server-side or in a managed vault; do not expose API keys in browser code or source control.',
    'Status: local starter workspace only. No live provider API calls are implemented.',
  ].join('\n'), [profile])

  const setProfileValue = (key: keyof BusinessProfile, value: string) => {
    setProfile(current => ({ ...current, [key]: value }))
    setMessage('')
  }

  const setServiceValue = (id: string, key: keyof ServiceItem, value: string | boolean) => {
    setServices(current => current.map(service => service.id === id ? { ...service, [key]: value } : service))
    setMessage('')
  }

  const addService = () => {
    const id = `custom-${Date.now()}`
    setServices(current => [...current, {
      id,
      name: 'New service',
      description: '',
      audience: 'All customers',
      price: '',
      enabled: true,
    }])
    setMessage('New service added. Add your own description and price before publishing it.')
  }

  const resetBusinessTemplate = () => {
    setProfile(PROFILE_DEFAULT)
    setServices(SERVICES_DEFAULT)
    setMessage('DASH Car Wash starter template restored. No business data was sent anywhere.')
  }

  const copyIntegrationBrief = async () => {
    try {
      await safeCopy(integrationBrief)
      setMessage('Integration brief copied.')
    } catch {
      setMessage('Clipboard access was blocked. Download the brief instead.')
    }
  }

  return (
    <main className="business-workspace">
      <div className="business-shell">
        <header className="business-topbar">
          <button type="button" className="business-back" onClick={onBack} aria-label="Back to Agent Army org charts">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Agent Army</span>
          </button>
          <div className="business-brand"><span className="business-brand-mark" aria-hidden="true">D</span><span>Business starter</span></div>
          <span className="business-demo-pill"><span aria-hidden="true" />Skeleton · local data</span>
        </header>

        <section className="business-intro">
          <div>
            <p className="business-eyebrow">CONFIGURED STARTER BUSINESS</p>
            <h1>{profile.name.trim() || 'DASH Car Wash'}</h1>
            <p className="business-intro-copy">A reusable business foundation with car-wash operations and a rideshare-driver service line ready to configure.</p>
          </div>
          <div className="business-status-card">
            <span className="business-status-dot" aria-hidden="true" />
            <div><strong>Starter mode</strong><small>Demo/local setup · no live connections</small></div>
          </div>
        </section>

        <div className="business-notice" role="note">
          <strong>Integration boundary:</strong> provider adapters are placeholders. This app cannot change Arena.ai defaults or access its private APIs. “{REQUESTED_DIGITAL_ASSET_SOURCE.providerLabel} / {REQUESTED_DIGITAL_ASSET_SOURCE.requestedSpec}” remains unverified until you provide the exact official documentation. The proposed crypto scope is current read-only data only, with no history or personalization.
        </div>

        <nav className="business-tabs" role="tablist" aria-label="DASH Car Wash business workspace">
          {TABS.map(item => (
            <button key={item.id} type="button" role="tab" id={`business-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`business-panel-${item.id}`} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>
              <span>{item.number}</span>{item.label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && (
          <section className="business-panel" id="business-panel-overview" role="tabpanel" aria-labelledby="business-tab-overview">
            <div className="business-stat-grid">
              <article className="business-stat-card"><span>ACTIVE SERVICE MENU</span><strong>{activeServices}</strong><small>Local template items</small></article>
              <article className="business-stat-card"><span>LIVE INTEGRATIONS</span><strong>0</strong><small>Connectors are placeholders</small></article>
              <article className="business-stat-card"><span>RIDESHARE SERVICE LINE</span><strong className="business-stat-word">Ready to configure</strong><small>Manual workflow starter</small></article>
            </div>

            <div className="business-overview-grid">
              <section className="business-card business-profile-card">
                <div className="business-card-head"><div><p className="business-section-label">BUSINESS PROFILE</p><h2>Start with the basics</h2><p>Set details for this browser-only starter; add verified business information when ready.</p></div><span className="business-card-icon" aria-hidden="true">⌂</span></div>
                <div className="business-form-grid">
                  <div className="business-field"><label htmlFor="business-name">Business name</label><input id="business-name" value={profile.name} onChange={event => setProfileValue('name', event.currentTarget.value)} /></div>
                  <div className="business-field"><label htmlFor="business-location">Location / service area</label><input id="business-location" value={profile.location} onChange={event => setProfileValue('location', event.currentTarget.value)} placeholder="Add your service area" /></div>
                  <div className="business-field business-field-wide"><label htmlFor="business-contact">Business contact</label><input id="business-contact" value={profile.contact} onChange={event => setProfileValue('contact', event.currentTarget.value)} placeholder="Phone or email (optional)" /></div>
                </div>
                <p className="business-local-note">Profile and service-menu edits are stored locally in this browser only.</p>
              </section>

              <section className="business-card business-setup-card">
                <p className="business-section-label">BUSINESS SKELETON</p>
                <h2>Core + add-on model</h2>
                <div className="business-model-stack">
                  <div><span className="business-model-number">01</span><span><strong>Core business</strong><small>Service catalog, customer workflow, and basic operations for a car wash.</small></span></div>
                  <div><span className="business-model-number">02</span><span><strong>Rideshare extension</strong><small>Driver-ready cleans, repeat visits, and fleet/partner plans.</small></span></div>
                  <div><span className="business-model-number">03</span><span><strong>Provider adapters</strong><small>Booking, rideshare, payments, and optional read-only digital-asset data.</small></span></div>
                </div>
                <button type="button" className="business-button business-button-primary" onClick={() => setTab('services')}>Configure the service menu <span aria-hidden="true">→</span></button>
              </section>

              <section className="business-card business-flow-card">
                <div className="business-card-head"><div><p className="business-section-label">DRIVER SERVICE LINE</p><h2>Attach rideshare work to the wash business</h2></div><span className="business-card-icon" aria-hidden="true">↗</span></div>
                <div className="business-flow-steps">
                  <span>Driver chooses a service</span><i aria-hidden="true">→</i><span>Wash visit is recorded</span><i aria-hidden="true">→</i><span>Repeat or fleet plan</span>
                </div>
                <p>This starter does not access driver accounts. Begin with driver-selected services and manual booking; connect platform data only after official API access is verified.</p>
                <button type="button" className="business-link-button" onClick={onOpenDriverTools}>Open the driver earnings &amp; appeal tools <span aria-hidden="true">↗</span></button>
              </section>
            </div>
          </section>
        )}

        {tab === 'services' && (
          <section className="business-panel" id="business-panel-services" role="tabpanel" aria-labelledby="business-tab-services">
            <div className="business-page-head">
              <div><p className="business-section-label">EDITABLE STARTER MENU</p><h2>Services and plans</h2><p>These are draft service concepts, not published offers. Set actual prices, taxes, terms, and operating capacity before launch.</p></div>
              <button type="button" className="business-button business-button-primary" onClick={addService}>+ Add service</button>
            </div>
            <div className="business-service-list">
              {services.map((service, index) => (
                <article className={`business-service-row${service.enabled ? '' : ' is-disabled'}`} key={service.id}>
                  <div className="business-service-index">{String(index + 1).padStart(2, '0')}</div>
                  <div className="business-service-fields">
                    <div className="business-form-grid">
                      <div className="business-field"><label htmlFor={`service-name-${service.id}`}>Service name</label><input id={`service-name-${service.id}`} value={service.name} onChange={event => setServiceValue(service.id, 'name', event.currentTarget.value)} /></div>
                      <div className="business-field"><label htmlFor={`service-audience-${service.id}`}>Audience</label><input id={`service-audience-${service.id}`} value={service.audience} onChange={event => setServiceValue(service.id, 'audience', event.currentTarget.value)} /></div>
                      <div className="business-field business-field-wide"><label htmlFor={`service-description-${service.id}`}>Description</label><textarea id={`service-description-${service.id}`} rows={2} value={service.description} onChange={event => setServiceValue(service.id, 'description', event.currentTarget.value)} placeholder="Describe what is included; avoid unverified claims." /></div>
                      <div className="business-field"><label htmlFor={`service-price-${service.id}`}>Draft price (USD)</label><div className="business-price-field"><span>$</span><input id={`service-price-${service.id}`} type="number" min="0" step="0.01" value={service.price} onChange={event => setServiceValue(service.id, 'price', event.currentTarget.value)} placeholder="Set price" /></div></div>
                      <label className="business-enabled"><input type="checkbox" checked={service.enabled} onChange={event => setServiceValue(service.id, 'enabled', event.currentTarget.checked)} /><span>{service.enabled ? 'In draft menu' : 'Hidden from draft menu'}</span></label>
                    </div>
                  </div>
                  <button type="button" className="business-remove-button" onClick={() => setServices(current => current.filter(item => item.id !== service.id))} aria-label={`Remove ${service.name || 'service'}`}>×</button>
                </article>
              ))}
              {services.length === 0 && <div className="business-empty-services"><strong>No draft services yet</strong><span>Add a service to start shaping the menu.</span></div>}
            </div>
            <div className="business-bottom-actions">
              <button type="button" className="business-button business-button-quiet" onClick={resetBusinessTemplate}>Restore starter template</button>
              <span>{message || 'Changes save locally on this device; nothing is published or charged.'}</span>
            </div>
          </section>
        )}

        {tab === 'rideshare' && (
          <section className="business-panel" id="business-panel-rideshare" role="tabpanel" aria-labelledby="business-tab-rideshare">
            <div className="business-page-head">
              <div><p className="business-section-label">BUSINESS EXTENSION</p><h2>Rideshare driver services</h2><p>Attach a driver-focused service line to the car-wash operation without depending on account access.</p></div>
              <button type="button" className="business-button business-button-quiet" onClick={onOpenDriverTools}>Open driver toolkit <span aria-hidden="true">↗</span></button>
            </div>
            <div className="business-rideshare-grid">
              <article className="business-workflow-card"><span className="business-workflow-icon" aria-hidden="true">01</span><p className="business-section-label">INDIVIDUAL DRIVER</p><h3>Fast repeat visit</h3><p>Driver selects a wash, books through the business’s chosen channel, and receives a clear service receipt.</p><ul><li>Visible service and price</li><li>Vehicle and appointment details collected with consent</li><li>Optional repeat-visit reminder</li></ul></article>
              <article className="business-workflow-card"><span className="business-workflow-icon" aria-hidden="true">02</span><p className="business-section-label">FLEET PARTNER</p><h3>Recurring fleet care</h3><p>Set up a business account with a vehicle roster, service cadence, and terms agreed directly with the customer.</p><ul><li>Manual roster or approved import</li><li>Scheduled wash windows</li><li>Business invoice summary</li></ul></article>
              <article className="business-workflow-card"><span className="business-workflow-icon" aria-hidden="true">03</span><p className="business-section-label">DRIVER PLANNING</p><h3>Know the cost of a shift</h3><p>Use the companion planner to compare personal earnings assumptions with vehicle costs. It is separate from platform pay systems.</p><ul><li>Driver-entered or CSV summary data</li><li>Personal planning only</li><li>No account or payout changes</li></ul><button type="button" className="business-link-button" onClick={onOpenDriverTools}>Open earnings planner <span aria-hidden="true">→</span></button></article>
            </div>
            <div className="business-safety-note"><strong>Keep the add-on independent.</strong> No driver passwords, session cookies, internal endpoints, or automated account actions are needed for the starter workflow. Real platform integration requires current official API documentation and authorization.</div>
          </section>
        )}

        {tab === 'integrations' && (
          <section className="business-panel" id="business-panel-integrations" role="tabpanel" aria-labelledby="business-tab-integrations">
            <div className="business-page-head">
              <div><p className="business-section-label">CONNECTOR SKELETON</p><h2>Adapters ready to be specified</h2><p>Each entry is a placeholder, not a live integration. Exact provider docs and authorized scopes are required before implementation.</p></div>
              <span className="business-unconnected-pill"><span aria-hidden="true" />0 live connections</span>
            </div>
            <div className="business-connectors">
              {BUSINESS_CONNECTORS.map(item => (
                <article className="business-connector-card" key={item.id}>
                  <div className="business-connector-top"><span className={`business-connector-symbol symbol-${item.id}`} aria-hidden="true">{item.id === 'digital-assets' ? '₿' : item.id === 'rideshare' ? '↗' : item.id === 'payments' ? '$' : '▦'}</span><span className="business-connector-status">{item.status}</span></div>
                  <p className="business-section-label">{item.label}</p>
                  <h3>{item.provider}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
            <div className="business-arena-note"><strong>Arena API note:</strong> this repository can define APIs for this application, but it cannot change Arena.ai’s platform defaults or private services. The app’s requested connector is read-only current crypto data; it will not retain past analytics, personalize from user history, access wallet credentials, or execute transactions. The provider/spec label “{REQUESTED_DIGITAL_ASSET_SOURCE.providerLabel} / {REQUESTED_DIGITAL_ASSET_SOURCE.requestedSpec}” still needs verification.</div>
            <div className="business-integration-actions">
              <div><strong>Share an implementation brief</strong><small>Includes the requested connector scope and the current “not configured” status. No secrets are included.</small></div>
              <div className="business-action-buttons"><button type="button" className="business-button business-button-primary" onClick={copyIntegrationBrief}>Copy brief</button><button type="button" className="business-button business-button-quiet" onClick={() => downloadSpec(integrationBrief)}>Download brief</button></div>
            </div>
            {message && <p className="business-message" role="status">{message}</p>}
            <p className="business-secret-note">Never paste API keys or account credentials here. When providers are confirmed, secrets belong in an authorized server-side secret manager or platform vault—not client code or Git.</p>
          </section>
        )}

        <footer className="business-footer">DASH Car Wash starter · local prototype · not affiliated with Uber, Mystro, Arena.ai, or any API provider. Demo setup only: no bookings, payments, crypto transactions, or provider account access occur.</footer>
      </div>
    </main>
  )
}
