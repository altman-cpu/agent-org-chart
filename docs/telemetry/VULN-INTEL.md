# Vulnerability Threat Intelligence Console — design & limits

Lives inside `#/telemetry`, between the beacon map/live log and the document
registry. Engine: [`web/src/lib/vuln-intel.ts`](../../web/src/lib/vuln-intel.ts).
CI gate: `cd web && npm run validate:vuln`.

## What it does

- **Mainframe sequence decoding.** `loadSnippet()` deterministically cycles a
  10-block simulated corpus (`SEQ-01…SEQ-10`) into the typing matrix buffer.
  Each block carries an **analyst note** that is injected beside the buffer at
  load time so the operator knows which trust boundary to watch.
- **Realtime CWE diagnostics.** The scanner re-analyses the *revealed* buffer
  on every decode tick, so a finding appears the moment its pattern completes
  (verified: partial buffer before a composed-SQL line → 0 findings; line
  complete → `CWE-89`). Discoveries are written to the main terminal as
  `⚠` recon-stamped lines and committed to the **recon matrix** when the
  decode completes. Export: `genesis-recon-matrix.json`.
- **Security deconstruction modal.** Every finding opens a modal: what the flaw
  class is, the exact evidence line, severity + confidence, the defensive fix,
  console context at discovery (cadence, pressure, generation), and the MITRE
  CWE reference. Esc / click-outside closes.
- **Preserved classic flow** (unchanged by this console): 2200 ms signal
  cadence with its automated-thinking buffer; mechanical decode **pressure**
  (chars/tick slider, classic default 3); the **hidden execution buffer**
  (undecoded remainder stays hidden, count shown); **oscillator feedback**
  (tempo/amplitude track live risk score; the haptic waveform is untouched);
  FREEZE halts decoding along with the signal stream; `prefers-reduced-motion`
  stills the oscillators.
- **Automation bridge.** `TelemetryAPI.scan(code)` returns findings for any
  string; `TelemetryAPI.loadSnippet(i)` drives the matrix from the script
  port. `getCache().vulnIntel` exposes live recon state.

## Rules (GEN-VULN-001…014)

CWE-95 eval · CWE-79 XSS sink · CWE-89 SQL composition · CWE-78 shell
composition · CWE-798 hard-coded credentials · CWE-327 weak crypto ·
CWE-338 weak PRNG for security ids · CWE-22 path traversal · CWE-918 SSRF ·
CWE-601 open redirect · CWE-209 error leakage · CWE-1321 prototype pollution ·
CWE-400 unbounded loops · CWE-862 missing authorization (low-confidence
heuristic). Several rules carry **guards**: if a mitigation pattern is present
anywhere in the block (parameterised query, sanitizer, allow-list, containment
check…), the finding is suppressed — which is how the two clean reference
blocks (`SEQ-09`, `SEQ-10`) stay silent and prove the scanner discriminates.

## Limits — read before trusting a result

- Heuristic regex over text. No parsing, data-flow, or reachability analysis;
  expect false positives/negatives outside the corpus shapes.
- Analysed code is **never executed** by this console. (The separate script
  port runs only the operator's own code in their own tab, by explicit press.)
- Corpus blocks are simulated training samples; descriptions give flaw classes
  and defensive fixes only — no exploit steps are published.
- Not a substitute for SAST/DAST, dependency audit (`npm audit` runs in CI),
  threat modelling, or human review.

## Self-test oracle

Each corpus block declares `expectedCwes`; the validator asserts the scanner
produces *exactly* that set (clean blocks: the empty set), plus realtime
partial-buffer behaviour and scan determinism.
