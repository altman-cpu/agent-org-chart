# Business API payloads — read-only starter contract

## Status and scope

These are **proposed app-owned routes and synthetic payload fixtures**, not live server endpoints or vendor-specific payloads. The current app is a static front end with no backend. The exact booking, rideshare, payments, and digital-asset providers still need official documentation and authorization before any live adapter is written.

Every operation here is `GET` and returns the fixed `ReadOnlyResponse<T>` envelope from [`web/src/lib/business-adapters.ts`](../../web/src/lib/business-adapters.ts). There are no create, update, delete, payment-initiation, payout-change, wallet, trade, signing, or transaction operations in this contract.

## Proposed routes and request inputs

GET requests have no request body; the route and query string are the input payload.

| Operation | Proposed route | Query |
| --- | --- | --- |
| List wash services | `/api/v1/business/services` | none |
| List bookings | `/api/v1/business/bookings` | `from`, `to`, optional `limit` (1–100) |
| Read rideshare trip summaries | `/api/v1/rideshare/trip-summaries` | `from`, `to`, optional `limit` (1–100) |
| Read payment settlement summaries | `/api/v1/payments/settlement-summaries` | `from`, `to`, optional `limit` (1–100) |
| List digital assets | `/api/v1/digital-assets/assets` | optional `search` |
| Read current digital-asset quotes | `/api/v1/digital-assets/quotes` | `assetIds` (1–100 IDs) |
| Read connector status | `/api/v1/integrations/status` | none |

Example query construction for the proposed internal endpoint:

```ts
const url = new URL('/api/v1/rideshare/trip-summaries', window.location.origin)
url.searchParams.set('from', '2026-10-01T00:00:00Z')
url.searchParams.set('to', '2026-10-31T23:59:59Z')
url.searchParams.set('limit', '25')

const response = await fetch(url, {
  method: 'GET',
  cache: 'no-store',
  headers: { accept: 'application/json' },
})
```

This is a client example for a **future app-owned route**. It will not work until a backend exists and the caller is authorized for the data.

## Fixed response envelope

```json
{
  "schemaVersion": "1.0",
  "mode": "read_only",
  "source": {
    "provider": "synthetic-fixture",
    "network": "demo",
    "observedAt": "2026-10-24T12:00:00Z",
    "verification": "pending"
  },
  "data": [
    {
      "providerTripId": "trip-demo-1",
      "completedAt": "2026-10-23T18:00:00Z",
      "grossMinor": 2800,
      "currency": "USD",
      "miles": 12.5,
      "onlineHours": 1.2
    }
  ],
  "warnings": ["Example fixture only; no driver account was accessed."]
}
```

The payload shape is checked by [`schemas/business-read-only-api.schema.json`](../../schemas/business-read-only-api.schema.json). Digital-asset quote prices are decimal strings to avoid floating-point rounding; quotes represent current snapshots only. The digital-asset scope stores no past quote analytics, does not personalize from user history, and does not access wallet credentials.

## “100 / 100” local validation

`cd web && npm run validate:api` generates and validates **100 synthetic request/response cases** against the schema, then checks that five unsafe or malformed variants are rejected (including write methods, credentials in query fields, non-string asset prices, quote-history fields, and non-read-only modes). It makes **zero network calls**. Fixtures are synthetic and must not be presented as real provider data.

`npm run simulate:api` repeats the same bounded suite for 10 cycles: 1,000 valid fixture checks and 50 negative safety checks. The simulation is local-only; it does not call providers, create bookings, alter GitHub, visualize release state, or merge pull requests. There is no automatic merge trigger.

The test count is a payload/schema check—not a claim of 100% code coverage or 100 live API integrations. Speech-to-text is a separate external integration and remains unconfigured until a specific provider, model ID, and official documentation are supplied.

## Requirements before live integration

1. Name the provider for each connector and share its official API documentation URL.
2. Confirm allowed scopes, user consent, data retention, and provider rate limits.
3. Keep provider secrets server-side or in a managed vault; never put them in browser code, Git, or chat.
4. Start with read-only methods; mark provider/network verification as pending until verified.
5. For personal trip or settlement data, enforce per-user authorization server-side and avoid logging raw records.
6. For “Genesis Tencen / ABI OMNI 1000,” confirm the exact product, official ABI/version, chain ID, and verified contract address. No such live integration is assumed here.
