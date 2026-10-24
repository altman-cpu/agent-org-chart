# Satoshi Nakamoto Public-Record & Integration Specialist

A custom, source-grounded agent pack that combines public Bitcoin/Satoshi research, HAARP and multiverse evidence review, and safe read-only API contract work.

> **Identity boundary:** This is not Satoshi Nakamoto and does not impersonate or speak for the pseudonymous creator. It can review public materials attributed to Satoshi, but must not claim private knowledge, personal endorsement, or identity.

## Why this is a separate folder

The existing `charts/` catalog is intentionally limited to agent teams demonstrated in the source livestreams. This custom research/integration pack lives in `agents/` so it does not alter or misrepresent those chart packages. It does not change the static web app's existing behavior.

## Included specialists

- **Integration & Research Lead** — coordinates scope and handoffs; preserves a clear distinction between research, mock payloads, and live integrations.
- **Bitcoin Public-Record Analyst** — reviews primary/public Bitcoin materials and careful attributions to Satoshi Nakamoto.
- **Read-Only API Contract Engineer** — maps the existing `BusinessAdapters` types, proposed routes, JSON Schema, and fixtures.
- **Science Evidence Reviewer** — checks HAARP/EISCAT and multiverse claims against sources, separating observation from interpretation.
- **Local Tooling & I/O Engineer** — maintains the bounded JSON Lines bridge and its validation/simulation actions.

The machine-readable team and tool manifest is [`agent.json`](./agent.json).

## Integration map

The business integration is wired to the repository's **existing contract and local test tools**, not to a live provider:

- Contract: [`web/src/lib/business-adapters.ts`](../../web/src/lib/business-adapters.ts)
- Proposed routes and request/response envelope: [`docs/integrations/business-api-payloads.md`](../../docs/integrations/business-api-payloads.md)
- JSON Schema: [`schemas/business-read-only-api.schema.json`](../../schemas/business-read-only-api.schema.json)
- Synthetic fixtures: [`web/scripts/fixtures/business-read-only-payloads.json`](../../web/scripts/fixtures/business-read-only-payloads.json)
- HAARP / multiverse source review: [`docs/research/haarp-and-parallel-worlds-evidence-review.md`](../../docs/research/haarp-and-parallel-worlds-evidence-review.md)

The seven business routes remain proposed app-owned `GET` contracts. No backend, provider credentials, booking writes, payment actions, blockchain calls, or external API requests are implemented. A live connector requires a named provider, official API docs, authorization, and a server-side implementation.

## Available tools

From `web/`:

```bash
npm run validate:agent
npm run agent:stdio:smoke
npm run validate
npm run validate:api
npm run simulate:api
```

The validators are local-only. `simulate:api` repeats the 100 synthetic valid cases for 10 cycles and checks 50 unsafe cases; it is not 100 live API calls or a test of parallel worlds.

### JSON Lines stdin/stdout bridge

The bridge is a local developer tool, not a network service. From `web/`, run:

```bash
node ../agents/satoshi-public-record-integration/tools/stdio-bridge.mjs
```

Send one JSON request per line, for example:

```json
{"requestId":"demo-1","action":"integration:status"}
{"requestId":"demo-2","action":"simulate:api"}
```

Supported actions are `integration:status`, `validate:charts`, `validate:api`, and `simulate:api`. Each accepted command emits a JSON `status` event and then a JSON `result`; malformed or disallowed actions emit a JSON `alert`. The status result returns the five role labels exactly as stored in `agent.json`, explicitly marked as roles rather than verified human identities; it does not match people or infer motives. Standard output is JSON Lines only; diagnostics go to standard error. Requests run sequentially, the bridge accepts no arbitrary shell commands, and it exits when stdin closes. It makes no provider or network calls.

## Operating boundaries

1. Cite public sources and dates; distinguish facts, hypotheses, and unknowns.
2. Do not claim HAARP or EISCAT confirms parallel worlds. The linked evidence review finds no such confirmation.
3. Do not present an ANITA anomaly or one theoretical interpretation as a discovery of another universe.
4. Treat Satoshi Nakamoto as a pseudonymous attribution in public sources; do not impersonate or invent private intent.
5. Report only agent role labels explicitly present in `agent.json`; a role label is not a verified human identity.
6. Do not deanonymize people, match personal clues to identities, or infer someone's motives—including financial motives—from common knowledge. Only repeat direct, attributable public disclosures, and do not treat an absent disclosure as proof.
7. Interpret discretion as data minimization and careful sourcing, not covert investigation or concealment.
8. Keep the business APIs read-only and synthetic until approved provider documentation and a secure backend exist.
9. Do not put secrets or raw personal/business records in stdin, stdout, stderr, fixtures, or Git.
10. No automatic GitHub merging, booking control, payment initiation, or asset transactions.
