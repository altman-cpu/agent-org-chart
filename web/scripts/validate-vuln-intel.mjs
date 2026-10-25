// Vulnerability Threat Intelligence validator — local-only, executes nothing.
// Imports the TypeScript engine via Node type-stripping and asserts:
//  1. corpus self-test: each simulated block yields exactly its expected CWE
//     set, and the two clean reference blocks stay silent;
//  2. realtime behaviour: a partial typing buffer reports nothing before the
//     flawed line completes, then reports it;
//  3. determinism: repeated scans are byte-identical.
// Run: node --experimental-strip-types scripts/validate-vuln-intel.mjs
import { analyzeSnippet, loadSnippet, runScannerSelfTest, SNIPPET_CORPUS, riskScore } from '../src/lib/vuln-intel.ts'

const r = runScannerSelfTest()
if (r.failures.length) {
  console.error(`✗ scanner self-test ${r.passed}/${r.total}`)
  for (const f of r.failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`✓ scanner self-test ${r.passed}/${r.total}: vulnerable blocks yield exact CWE sets, clean references silent`)

const seq03 = loadSnippet(2).code
const cut = seq03.indexOf('SELECT')
if (analyzeSnippet(seq03.slice(0, cut)).length !== 0) { console.error('✗ partial buffer reported before flawed line'); process.exit(1) }
const after = analyzeSnippet(seq03.slice(0, cut + 80)).map(f => f.cwe)
if (!after.includes('CWE-89')) { console.error('✗ CWE-89 not exposed when SQL line completed'); process.exit(1) }
console.log('✓ realtime decode: 0 findings pre-line → CWE-89 exposed on line completion')

for (const s of SNIPPET_CORPUS) {
  const a = JSON.stringify(analyzeSnippet(s.code))
  if (a !== JSON.stringify(analyzeSnippet(s.code))) { console.error(`✗ nondeterministic scan for ${s.id}`); process.exit(1) }
  if (s.expectedCwes.length === 0 && riskScore(analyzeSnippet(s.code)) !== 0) { console.error(`✗ clean block ${s.id} scored risk`); process.exit(1) }
}
console.log(`✓ deterministic scans across ${SNIPPET_CORPUS.length} sequences; clean blocks risk 0`)
console.log('Local-only heuristic diagnostics. Analysed code was never executed.')
