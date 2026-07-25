/**
 * Contract registry — §8 Tier 2.
 *
 * DERIVED, NOT SEEDED. §8 is explicit about why: "We derive the contract graph"
 * beats "we hardcoded six entries" enormously in Q&A, for the same effort. This
 * is a regex pass over exports and route definitions at hub startup.
 *
 * A contract is anything one file DEFINES and another file CONSUMES. That edge
 * is the failure git cannot see: two agents in two different files, about to
 * break each other, with no merge conflict to warn anyone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Contract, HubState } from './types.js'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.npm-cache'])
const EXTS = /\.(ts|tsx|js|jsx|mjs)$/

/** Walk the tree, bounded so a stray huge directory can't stall startup. */
const walk = (root: string, limit = 2000): string[] => {
  const out: string[] = []
  const stack = [root]
  while (stack.length && out.length < limit) {
    const dir = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) stack.push(full)
      else if (EXTS.test(name)) out.push(full)
    }
  }
  return out
}

const toPosix = (p: string): string => p.split(sep).join('/')

/* ------------------------------- definitions ------------------------------ */

/** `app.post('/api/cart/items', …)` → "POST /api/cart/items" */
const ROUTE_RE = /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g

/** Exported types, interfaces, consts, functions, and components. */
const EXPORT_RE = /\bexport\s+(?:default\s+)?(?:async\s+)?(type|interface|const|function|class)\s+([A-Za-z_$][\w$]*)/g

/** `process.env.SB_HUB` → env_var contract. */
const ENV_RE = /\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g

type Definition = { kind: Contract['kind']; name: string; definedIn: string }

const definitionsIn = (relPath: string, src: string): Definition[] => {
  const defs: Definition[] = []

  for (const m of src.matchAll(ROUTE_RE)) {
    defs.push({
      kind: 'http_route',
      name: `${m[1]!.toUpperCase()} ${m[2]!}`,
      definedIn: relPath,
    })
  }

  for (const m of src.matchAll(EXPORT_RE)) {
    const declKind = m[1]!
    const name = m[2]!
    // A capitalized exported const/function in a .tsx file is a component, and
    // its props are the contract other files bind to.
    const isComponent = /\.tsx$/.test(relPath) && /^[A-Z]/.test(name) && declKind !== 'type' && declKind !== 'interface'
    defs.push({
      kind: isComponent ? 'component_prop' : 'type',
      name,
      definedIn: relPath,
    })
  }

  for (const m of src.matchAll(ENV_RE)) {
    defs.push({ kind: 'env_var', name: m[1]!, definedIn: relPath })
  }

  return defs
}

/* -------------------------------- consumers ------------------------------- */

const consumesRoute = (src: string, routeName: string): boolean => {
  const path = routeName.split(' ')[1]
  return path !== undefined && src.includes(path)
}

const consumesSymbol = (src: string, name: string): boolean => {
  // Word-boundary match so `Cart` doesn't match `CartItem`.
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  return re.test(src)
}

/* --------------------------------- derive --------------------------------- */

/**
 * Two passes: collect definitions, then find who references them. Env vars are
 * excluded from the consumer pass — every file "consumes" process.env somewhere
 * and the resulting edges are noise.
 */
export const deriveContracts = (repoRoot: string): Contract[] => {
  const files = walk(repoRoot)
  const sources = new Map<string, string>()
  for (const abs of files) {
    try {
      sources.set(toPosix(relative(repoRoot, abs)), readFileSync(abs, 'utf8'))
    } catch {
      /* unreadable file is not a reason to fail startup */
    }
  }

  const defs: Definition[] = []
  for (const [rel, src] of sources) defs.push(...definitionsIn(rel, src))

  // Deduplicate: the same name exported from two files is ambiguous, and the
  // first definition wins rather than producing two competing contracts.
  const seen = new Set<string>()
  const contracts: Contract[] = []

  for (const def of defs) {
    const id = `${def.kind}:${def.name}`
    if (seen.has(id)) continue
    seen.add(id)

    const consumedBy: string[] = []
    if (def.kind !== 'env_var') {
      for (const [rel, src] of sources) {
        if (rel === def.definedIn) continue
        const hit = def.kind === 'http_route'
          ? consumesRoute(src, def.name)
          : consumesSymbol(src, def.name)
        if (hit) consumedBy.push(rel)
      }
    }

    contracts.push({
      id,
      kind: def.kind,
      name: def.name,
      definedIn: def.definedIn,
      consumedBy,
      version: 1,
      lastChangedBy: null,
    })
  }

  // A contract nobody consumes cannot produce a drift warning, so it is dead
  // weight on the board. Keep routes regardless — an unconsumed route is
  // usually a route the frontend hasn't wired yet, which is exactly the
  // sequencing case worth showing.
  return contracts.filter((c) => c.consumedBy.length > 0 || c.kind === 'http_route')
}

export const loadContracts = (s: HubState, repoRoot: string): number => {
  const derived = deriveContracts(repoRoot)
  for (const c of derived) s.contracts[c.id] = c
  return derived.length
}

/** Contracts DEFINED in any of these paths — the drift trigger. */
export const contractsDefinedIn = (s: HubState, paths: readonly string[]): Contract[] =>
  Object.values(s.contracts).filter((c) =>
    paths.some((p) => p === c.definedIn || p.endsWith(`/${c.definedIn}`) || c.definedIn.endsWith(p)),
  )

/** Does this path consume the contract? Used to pick notice recipients. */
export const consumesContract = (contract: Contract, path: string): boolean =>
  contract.consumedBy.some((c) => c === path || path.endsWith(`/${c}`) || c.endsWith(path))
