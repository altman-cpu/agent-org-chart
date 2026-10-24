// Validate synthetic read-only API request/response payloads. No network requests are made.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(webRoot, '..')
const schema = JSON.parse(readFileSync(resolve(repoRoot, 'schemas/business-read-only-api.schema.json'), 'utf8'))
const examples = JSON.parse(readFileSync(resolve(webRoot, 'scripts/fixtures/business-read-only-payloads.json'), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

function makeFixture(example, index) {
  const fixture = structuredClone(example)
  const suffix = String(index + 1).padStart(3, '0')
  const observedAt = new Date(Date.UTC(2026, 9, 24, 12, 0, index)).toISOString()
  fixture.caseId = `${fixture.operation}-${suffix}`
  fixture.response.source.observedAt = observedAt
  if (fixture.response.source.provider !== 'app-registry') {
    fixture.response.source.provider = 'synthetic-fixture-pending'
  }

  if (Array.isArray(fixture.response.data)) {
    fixture.response.data = fixture.response.data.map(item => {
      const copy = { ...item }
      const idKeys = fixture.operation === 'integrations.status'
        ? []
        : ['id', 'serviceId', 'providerTripId', 'settlementId', 'assetId']
      for (const key of idKeys) {
        if (typeof copy[key] === 'string') copy[key] = `${copy[key]}-${suffix}`
      }
      for (const key of ['grossMinor', 'amountMinor', 'priceMinor']) {
        if (typeof copy[key] === 'number') copy[key] += index
      }
      if (typeof copy.price === 'string') copy.price = `${index + 1}.12345000`
      if (typeof copy.observedAt === 'string') copy.observedAt = observedAt
      return copy
    })
  }

  if (Array.isArray(fixture.query.assetIds)) {
    fixture.query.assetIds = fixture.query.assetIds.map(id => `${id}-${suffix}`)
    for (const item of fixture.response.data) item.assetId = fixture.query.assetIds[0]
  }
  return fixture
}

const fixtures = Array.from({ length: 100 }, (_, index) => makeFixture(examples[index % examples.length], index))
if (!validate(fixtures)) {
  console.error('✗ Valid fixtures failed schema validation')
  for (const error of validate.errors ?? []) console.error(`  ${error.instancePath || '/'} ${error.message}`)
  process.exit(1)
}

const invalidCases = [
  (() => { const item = structuredClone(fixtures[0]); item.method = 'POST'; return item })(),
  (() => { const item = structuredClone(fixtures[0]); item.query.apiKey = 'not-allowed'; return item })(),
  (() => { const item = structuredClone(fixtures[5]); item.response.data[0].price = 1.2345; return item })(),
  (() => { const item = structuredClone(fixtures[5]); item.response.data[0].history = []; return item })(),
  (() => { const item = structuredClone(fixtures[5]); item.response.mode = 'write'; return item })(),
]

for (const [index, fixture] of invalidCases.entries()) {
  if (validate([fixture])) {
    console.error(`✗ Safety case ${index + 1} was unexpectedly accepted`)
    process.exit(1)
  }
}

console.log(`✓ ${fixtures.length}/${fixtures.length} synthetic read-only payloads valid`)
console.log(`✓ ${invalidCases.length}/${invalidCases.length} unsafe or malformed payloads rejected`)
console.log('No external API calls were made.')
