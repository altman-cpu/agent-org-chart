#!/usr/bin/env node
// Validate the custom agent manifest against repository files and existing local commands.
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../..')
const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'agent.json'), 'utf8'))
const webPackage = JSON.parse(readFileSync(resolve(repoRoot, 'web/package.json'), 'utf8'))
const adapterPath = resolve(repoRoot, manifest.integrations.businessReadOnly.contractPath)
const adapterSource = readFileSync(adapterPath, 'utf8')
const errors = []

function requirePath(relativePath, label = relativePath) {
  if (!existsSync(resolve(repoRoot, relativePath))) errors.push(`Missing ${label}: ${relativePath}`)
}

if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1.')
if (manifest.id !== 'satoshi-public-record-integration') errors.push('Manifest id does not match its folder.')
if (manifest.identityPolicy?.claimsToBeSatoshi !== false) errors.push('The identity policy must forbid claiming to be Satoshi Nakamoto.')
if (manifest.identityPolicy?.claimsPrivateKnowledge !== false) errors.push('The identity policy must forbid claims of private knowledge.')
if (manifest.identityPolicy?.imitatesPersonalVoice !== false) errors.push('The identity policy must forbid personal-voice imitation.')
if (manifest.integrations?.businessReadOnly?.supportsLiveCalls !== false) errors.push('Business contract must remain marked as not live.')
if (manifest.integrations?.businessReadOnly?.providerDocumentationRequired !== true) errors.push('Provider documentation must be required before live integration.')
if (manifest.integrations?.businessReadOnly?.methods?.some(method => method !== 'GET')) errors.push('Business integration must remain GET-only.')
if (manifest.ioPolicy?.protocol !== 'JSON Lines') errors.push('I/O policy must declare JSON Lines.')
if (manifest.ioPolicy?.networkCalls !== false) errors.push('Local bridge must be marked as no-network.')

for (const relativePath of manifest.references ?? []) requirePath(relativePath)
for (const integration of Object.values(manifest.integrations ?? {})) {
  if (integration.contractPath) requirePath(integration.contractPath)
  if (integration.schemaPath) requirePath(integration.schemaPath)
  if (integration.fixturePath) requirePath(integration.fixturePath)
  if (integration.documentPath) requirePath(integration.documentPath)
}

for (const route of manifest.integrations.businessReadOnly.routes ?? []) {
  if (!adapterSource.includes(route)) errors.push(`Proposed route is missing from the adapter contract: ${route}`)
}

for (const tool of manifest.tools ?? []) {
  if (tool.path) requirePath(tool.path, `tool reference ${tool.id}`)
  if (tool.command?.startsWith('npm run ')) {
    const scriptName = tool.command.slice('npm run '.length)
    if (!webPackage.scripts?.[scriptName]) errors.push(`Tool ${tool.id} references a missing web npm script: ${scriptName}`)
  } else if (tool.command?.startsWith('node ')) {
    const scriptPath = resolve(repoRoot, tool.workingDirectory ?? '.', tool.command.slice('node '.length))
    if (!existsSync(scriptPath)) errors.push(`Tool ${tool.id} references a missing script: ${tool.command}`)
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    agent: manifest.id,
    specialists: manifest.specialists.length,
    tools: manifest.tools.length,
    businessRoutes: manifest.integrations.businessReadOnly.routes.length,
    liveProviderCalls: false,
  })}\n`)
}
