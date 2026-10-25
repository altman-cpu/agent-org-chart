# Agent Army web application

The repository’s static web app now has three workspaces: the original agent org-chart catalog, a local-first driver toolkit, and a DASH Car Wash business starter. The business and driver workspaces are prototypes; they do not connect to financial, rideshare, payment, crypto, or Arena.ai accounts.

## Workspaces

### Org-chart catalog — `#/`

Browse the charts under `../charts/`, search by team or role, inspect reporting lines on the canvas, and copy chart import prompts, JSON, bot instructions, or routines. Chart JSON remains the source of truth for roles and team structure.

### DASH Car Wash business starter — `#/business`

A configurable business skeleton with:

- a local business profile and editable draft service menu;
- car-wash workflows for individual rideshare drivers and fleet partners;
- a connector registry for booking/POS, rideshare, payments, and digital-asset data;
- provider-neutral, **read-only** adapter contracts in `src/lib/business-adapters.ts`.

Profile and service-menu edits are saved in this browser’s local storage. The service list is a starter template, not a published price list or live booking system. There are currently **zero live provider connections**.

### Genesis telemetry console — `#/telemetry`

The original green cyber-telemetry console, restored and completed: interactive beacon map (Shane anchor, Coast 360 600-mile ring, 4 network signature profiles, 2 randomness telemetry monitors, 3 neural engines) with legend filters and payload preview; a non-stop typing terminal at a deliberate 2200 ms cadence with `[AUTOMATED THINKING]` buffer lines, per-line buffered timestamp-purpose notes, and a live compass; and the full automation suite — document matrix registry (SHA-256 → `0xKEY_` hashes, persisted only on **SAVE WORK REGISTRY**), `TelemetryAPI` script-injection port (`getCache`, `updateHashRegistry`, …), Octokit compartment map (local model, no GitHub calls), deterministic `CryptoAutomationHarness`, threshold-signing simulator, smart-contract template builder, API schema decoder, haptic thumb JSX nucleus, and SIM-labelled tickers / cache→gold ×10000 / provisional-credit ledger.

It also hosts a **Vulnerability Threat Intelligence Console**: mainframe sequence blocks decode into a typing matrix buffer while a live recon matrix column exposes CWE-classified weakness patterns (GEN-VULN-001…014) the moment each pattern completes, with a security-deconstruction modal per finding (flaw class, evidence line, defensive fix, MITRE link), pressure/oscillator/freeze flow controls, `TelemetryAPI.scan()` / `loadSnippet()` bridges, and a CI-enforced scanner self-test (`npm run validate:vuln`; analysed code is never executed — see [`../docs/telemetry/VULN-INTEL.md`](../docs/telemetry/VULN-INTEL.md)).

**Simulation only:** no bank (Marcus/Goldman Sachs), Apple Card, blockchain, gold, or marketplace connection exists; no account is created and no money moves. Eager-loaded, zero analytics, nothing leaves the tab. Every registered hash/name/seed from the working session is saved in [`../docs/telemetry/HASH-REGISTRY.md`](../docs/telemetry/HASH-REGISTRY.md); the genesis clone schema is [`../schemas/genesis-telemetry.schema.json`](../schemas/genesis-telemetry.schema.json) and the deterministic 100-fixture / 100-request batch is `scripts/fixtures/genesis-telemetry-100.json` (`npm run validate:genesis`, also in CI).

### Driver toolkit — `#/driver-tools`

- Earnings estimator with editable assumptions and client-side CSV import (`gross,miles,online_hours`). The CSV is parsed in the browser, not uploaded.
- Appeal-preparation workspace that creates a text draft for the user to review and submit through official support. Appeal details are not persisted or submitted.
- Device-native read-aloud for forecasts and drafts, using one available English browser/system voice. It does not use Qwen or send audio to a speech provider. Speech-to-text is not connected; an external provider needs to be specified and documented.
- Integration-readiness checklist and brief. Checklist progress is saved locally; the page makes no provider calls.

Planner assumptions are saved locally. These features do not access driver accounts, alter platform pay/settings, bypass paid features, or submit appeals.

## Integrations and privacy boundaries

- This is a **static client-side app**. It has no backend, OAuth flow, bank connector, payment processor, provider proxy, or live API integration. The catalog fetches its bundled chart JSON from the same origin; business/driver workspaces use local data.
- The adapter contracts in `src/lib/business-adapters.ts` describe read-only operations only. The digital-asset interface is specified for current asset metadata/quotes, uses a fixed response envelope, and excludes stored quote history, user-history personalization, wallet credentials, and transaction methods. No provider implementation is connected.
- “Genesis Tencen / ABI OMNI 1000” is an unverified provider/spec label. No endpoint, ABI, chain, contract address, or live connector is assumed. The routes in [`../docs/integrations/readonly-digital-assets.md`](../docs/integrations/readonly-digital-assets.md) are **proposed app-owned routes, not working endpoints**.
- Proposed business read-only routes and synthetic request/response examples are documented in [`../docs/integrations/business-api-payloads.md`](../docs/integrations/business-api-payloads.md). `npm run validate:api` validates 100 synthetic cases; `npm run simulate:api` repeats them for 10 bounded local cycles. Neither makes network calls, creates bookings, or merges PRs.
- This repository cannot change Arena.ai’s platform defaults or private services. GitHub Actions (`../.github/workflows/validate.yml`) runs the validation suite on pull requests and pushes to `main`; passing checks do not merge PRs or make bookings.
- Never place API keys, private keys, seed phrases, bank credentials, or other secrets in client code, Git, or chat. A live connector requires current official docs, explicit authorization, and an appropriate server-side secret design.

## Development

```bash
cd web
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173` by default. For a workspace link, use `#/business` or `#/driver-tools` after the origin.

## Validation and build

```bash
npm run build
npm run lint
npm run validate
npm run validate:api
npm run simulate:api
npm run validate:genesis
npm audit
```

- `build` runs TypeScript project checks and creates the static site in `dist/`.
- `lint` runs Oxlint.
- `validate` checks all chart JSON files against the repository schema.
- `validate:api` checks 100 synthetic read-only business API payload cases and verifies rejection of unsafe variants; it makes no network calls.
- `simulate:api` repeats those 100 cases for 10 bounded cycles (1,000 valid checks) without provider, booking, GitHub, or merge actions.
- `npm audit` checks the locked dependency tree.

The current site can be deployed to any static host. During build, Vite copies the chart JSON files from `../charts/` into `dist/charts/`.

## Source layout

- `src/App.tsx` — route selection and org-chart catalog shell.
- `src/BusinessWorkspace.tsx`, `src/business-workspace.css` — DASH Car Wash starter.
- `src/DriverWorkspace.tsx`, `src/driver-tools.css` — driver planning and appeal-prep tools.
- `src/TelemetryConsole.tsx`, `src/telemetry.css`, `src/lib/telemetry.ts` — Genesis telemetry console, deterministic mock harness, hash registry, schema validators/decoders (simulation only).
- `src/lib/business-adapters.ts` — provider-neutral read-only API contracts and connector status definitions.
- `src/lib/route.ts` — hash routes for catalog, business starter, and driver toolkit.
- `src/components/` — catalog canvas, picker, and team panel.
- `../charts/` — validated org-chart packages.
- `../docs/integrations/readonly-digital-assets.md` — digital-asset API/ABI notes and requirements before live integration.
