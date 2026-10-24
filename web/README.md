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
- This repository cannot change Arena.ai’s platform defaults or private services. It also does not automate repository merges.
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
- `src/lib/business-adapters.ts` — provider-neutral read-only API contracts and connector status definitions.
- `src/lib/route.ts` — hash routes for catalog, business starter, and driver toolkit.
- `src/components/` — catalog canvas, picker, and team panel.
- `../charts/` — validated org-chart packages.
- `../docs/integrations/readonly-digital-assets.md` — digital-asset API/ABI notes and requirements before live integration.
