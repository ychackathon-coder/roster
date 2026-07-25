/**
 * Derive the contract registry from a local repo and push it to a hub.
 *
 *   npm run derive-contracts -- /path/to/demo-repo [hub-url]
 *
 * A laptop hub scans the demo repo itself at boot. A DEPLOYED hub cannot — it has
 * no access to anyone's filesystem — so the derivation runs here and the result is
 * POSTed. Re-run it whenever the demo repo's exports or routes change.
 *
 * Without this step, a deployed hub has an empty contract registry and §8 Tier 2
 * contract drift never fires.
 */
import { deriveContracts } from './contracts.js'

const [repoRoot, hubArg] = process.argv.slice(2)

if (!repoRoot) {
  console.error('usage: npm run derive-contracts -- /path/to/demo-repo [hub-url]')
  process.exit(1)
}

const hub =
  hubArg ??
  process.env.SB_HUB_URL ??
  `http://${process.env.SB_HUB ?? '127.0.0.1'}:${process.env.SB_PORT ?? 8787}`

const contracts = deriveContracts(repoRoot)

const byKind = contracts.reduce<Record<string, number>>((acc, c) => {
  acc[c.kind] = (acc[c.kind] ?? 0) + 1
  return acc
}, {})

console.log(`Derived ${contracts.length} contracts from ${repoRoot}`)
for (const [kind, n] of Object.entries(byKind)) console.log(`  ${kind}: ${n}`)

const withConsumers = contracts.filter((c) => c.consumedBy.length > 0)
console.log(`  ${withConsumers.length} have consumers and can produce drift notices`)
if (withConsumers.length === 0) {
  console.warn('')
  console.warn('  WARNING: no contract has a consumer, so contract drift can never')
  console.warn('  fire. Check that the repo path is right and that files import')
  console.warn('  each other — a drift notice needs a definer AND a consumer.')
}

const res = await fetch(`${hub.replace(/\/$/, '')}/contracts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contracts }),
})

if (!res.ok) {
  console.error(`\nPOST ${hub}/contracts failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const body = (await res.json()) as { accepted?: number }
console.log(`\nPushed to ${hub} — accepted ${body.accepted ?? 0}`)
