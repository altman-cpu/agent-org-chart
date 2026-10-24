# Read-only digital-asset integration contract

## Status

This is a **provider-neutral proposal**, not a live integration. The repository does not currently verify a vendor called “Genesis Tencen,” an “ABI OMNI 1000” contract, a chain, contract address, ABI, or endpoint. Do not invent an endpoint or call an unverified contract. The app displays that provider/spec label as **pending verification**.

The TypeScript contracts are in [`web/src/lib/business-adapters.ts`](../../web/src/lib/business-adapters.ts). The current app has no backend/API routes; the routes below are a proposed app-owned contract for a future authorized backend.

## API vs ABI

An **API** is the service interface an application calls. A contract **ABI** is a JSON description of one deployed contract's methods, inputs, outputs, and encoding; it does not identify a vendor's HTTP endpoints by itself. Confirm the exact chain, verified contract address, and ABI from the provider before use. See [Ethereum's contract interaction guide](https://ethereum.org/developers/docs/smart-contracts/interacting/).

For EVM chains, `eth_call` executes a call without creating an on-chain transaction. It is commonly used for `view`/`pure` reads. JSON-RPC commonly transports this request with HTTP `POST`; that transport verb does **not** make it a state-changing transaction. Do not confuse it with `eth_sendTransaction` or `eth_sendRawTransaction`. See [Ethereum JSON-RPC `eth_call`](https://ethereum.org/developers/docs/apis/json-rpc/#eth-call) and the [JSON-RPC overview](https://ethereum.org/developers/docs/apis/json-rpc/).

## Fixed application response envelope

All future read adapters should return the same envelope:

```json
{
  "schemaVersion": "1.0",
  "mode": "read_only",
  "source": {
    "provider": "pending-verification",
    "network": "pending-verification",
    "observedAt": "2026-10-24T12:00:00Z",
    "verification": "pending"
  },
  "data": {
    "assetId": "provider-defined-id",
    "symbol": "EXAMPLE",
    "price": "123.45000000",
    "currency": "USD"
  },
  "warnings": ["Provider and ABI have not been verified."]
}
```

Rules:

- Keep decimal asset values as **strings**; do not round them through JavaScript floating-point math.
- `observedAt` identifies the current snapshot only. It is not a request to retain a time series.
- Do not add wallet addresses, account balances, user history, inferred preferences, or past analytics to this schema.
- Use an explicit `verification: "pending"` and a warning until the provider, network, ABI, and source are verified.

## Proposed app-owned read routes

These are names for the app's future backend, **not claimed Genesis Tencen endpoints**:

| Method | Proposed route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/digital-assets/assets` | Read currently supported asset metadata. |
| `GET` | `/api/v1/digital-assets/assets/{assetId}` | Read one asset's current metadata. |
| `GET` | `/api/v1/digital-assets/quotes?assetIds=…` | Read current quotes for an explicit list of assets. |
| `GET` | `/api/v1/integrations/status` | Return connection/configuration status without secrets. |

Do not add history, analytics, portfolio, wallet, buy/sell, transfer, approval, signing, or order endpoints to this read-only phase. Use `Cache-Control: no-store` on app responses and avoid persistent payload, query, and asset-history logs. If rate limits require caching, make it short-lived, in-memory, and non-user-specific, subject to provider terms.

## Example low-level EVM read

Only after a specific network, **verified contract address**, and matching official ABI are supplied, an EVM read can use `eth_call` with ABI-encoded calldata for a function whose ABI says `stateMutability` is `view` or `pure`:

```bash
curl -X POST "$READ_ONLY_RPC_URL" \
  -H 'Content-Type: application/json' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_call",
    "params": [
      {
        "to": "<verified-contract-address>",
        "data": "<ABI-encoded call to an approved view/pure method>"
      },
      "latest"
    ]
  }'
```

`<verified-contract-address>` and `<ABI-encoded call…>` are deliberately placeholders. The “ABI OMNI 1000” label is not enough to safely construct calldata. A generic token ABI may expose metadata such as `symbol()` or `decimals()`, but a token contract does not automatically provide a trustworthy USD price; quote data needs a documented market-data endpoint or a verified oracle contract. Do not query wallet balances unless the scope is explicitly changed and privacy-reviewed.

## Automation that respects the requested privacy boundary

1. **Stateless input:** accept the asset identifiers for this run only; do not infer interests from past usage.
2. **Current read:** call only the approved `GET` route or allow-listed `eth_call` for the latest state. No historical block ranges, logs, or time-series collection.
3. **Validate before reporting:** check the provider/network/contract allow-list, response envelope, decimals, currency, and `observedAt`. Mark missing or stale data as unavailable; use a freshness limit only after confirming the provider's documented update cadence.
4. **Neutral automation:** emit a data-freshness/status alert or a user-requested threshold alert. Thresholds should be supplied explicitly for that run and not learned or retained. Do not make “best interest” profit claims or turn an alert into a buy/sell recommendation.
5. **Fail closed:** if identity, docs, ABI, network, or data validation is unresolved, return `verification: "pending"` and make no provider call.
6. **No write capability:** do not load a wallet, private key, signer, approval flow, or transaction method in this adapter. Keep automation read-only.

A GET request to the proposed app API could look like this once a backend exists:

```ts
const url = new URL('/api/v1/digital-assets/quotes', window.location.origin)
url.searchParams.set('assetIds', assetIds.join(','))

const response = await fetch(url, {
  method: 'GET',
  cache: 'no-store',
  headers: { accept: 'application/json' },
})

if (!response.ok) throw new Error(`Quote read failed: ${response.status}`)
const result = await response.json() as ReadOnlyResponse<DigitalAssetQuote[]>
if (result.mode !== 'read_only' || result.source.verification !== 'verified') {
  throw new Error('Provider data is not verified for automation.')
}
```

This is an **example client for a future app-owned endpoint**, not a live API call in the current static site. Keep provider credentials server-side or in a managed vault; never place them in browser code, Git, or chat.

## Required before a live connector can be written

Provide public documentation (not credentials) for:

- the exact legal provider/product name and API/SDK documentation URL;
- what “ABI OMNI 1000” means and its version/source;
- supported network/chain ID, verified contract address, and full ABI if this is on-chain;
- official read-only endpoints/methods, response schema, rate limits, and data-use terms;
- confirmation that the target scope is current public market data only, with no wallet access, personalization, or historical analytics.
