/**
 * Path overlap — the one piece of logic the entire fast path rests on.
 *
 * Pure functions, no state, no I/O. §13 Phase 1 requires three tests:
 * identical, nested, disjoint. See overlap.test.ts.
 *
 * The hard part is not set intersection, it's path shape. Hooks hand us an
 * ABSOLUTE tool_input.file_path ("/Users/maya/demo/api/routes/cart.ts") while
 * leases and the §14 task seed carry REPO-RELATIVE paths ("api/routes/cart.ts").
 * Compare those naively and every lease check silently returns "no overlap" —
 * the hub grants every lease, denies nothing, and the demo looks like a
 * dashboard with no product behind it.
 *
 * Suffix matching across the absolute/relative boundary is also what makes
 * §16's claim true — that every mechanism works identically when the four
 * checkouts live at four different paths on four different machines.
 */

/** Lowercase-safe on macOS? No — deliberately case-sensitive, like git. */
export const normalize = (p: string): string => {
  let out = p.trim().replace(/\\/g, '/')
  out = out.replace(/\/{2,}/g, '/')
  out = out.replace(/^\.\//, '')
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

const isAbsolute = (p: string): boolean => p.startsWith('/')

const segments = (p: string): string[] => normalize(p).split('/').filter(Boolean)

/**
 * True when `child` is the same path as `parent` or sits underneath it.
 * Segment-aware, so "api/routes" does not contain "api/routes-v2/x.ts".
 */
const containsOrEquals = (parent: string, child: string): boolean => {
  const a = segments(parent)
  const b = segments(child)
  if (a.length > b.length) return false
  return a.every((seg, i) => b[i] === seg)
}

/**
 * True when a relative path is the tail of an absolute one on segment
 * boundaries: "/Users/maya/demo/api/routes/cart.ts" vs "api/routes/cart.ts".
 *
 * Requires two or more segments in the relative path. A bare "types.ts" would
 * otherwise match api/types.ts AND web/types.ts — and §14 ships both, so a
 * single-segment match would produce phantom collisions between two agents
 * working in genuinely different files.
 */
const isRelativeSuffixOf = (rel: string, abs: string): boolean => {
  const r = segments(rel)
  const a = segments(abs)
  if (r.length < 2 || r.length > a.length) return false
  const offset = a.length - r.length
  return r.every((seg, i) => a[offset + i] === seg)
}

/**
 * Do two paths refer to overlapping work?
 *
 * Symmetric. Handles identical, directory containment in either direction, and
 * the absolute/relative mismatch described above.
 */
export const pathsOverlap = (x: string, y: string): boolean => {
  const a = normalize(x)
  const b = normalize(y)
  if (a === '' || b === '') return false
  if (a === b) return true

  const aAbs = isAbsolute(a)
  const bAbs = isAbsolute(b)

  // Same coordinate system: containment only. No suffix guessing, because two
  // absolute paths that disagree are genuinely different files.
  if (aAbs === bAbs) return containsOrEquals(a, b) || containsOrEquals(b, a)

  // Mixed: one absolute (from a hook), one relative (from a lease or the seed).
  const rel = aAbs ? b : a
  const abs = aAbs ? a : b
  if (isRelativeSuffixOf(rel, abs)) return true

  // Relative path naming a directory that the absolute path sits inside:
  // lease on "web/src/components", edit at "/…/web/src/components/Cart/CartItem.tsx".
  const relSegs = segments(rel)
  const absSegs = segments(abs)
  if (relSegs.length >= 2) {
    for (let start = 0; start + relSegs.length <= absSegs.length; start += 1) {
      if (relSegs.every((seg, i) => absSegs[start + i] === seg)) return true
    }
  }
  return false
}

/** Does any path in this set overlap the candidate? */
export const anyPathOverlaps = (paths: readonly string[], candidate: string): boolean =>
  paths.some((p) => pathsOverlap(p, candidate))

/** Do two path sets intersect at all? Used by the slow path across leases. */
export const pathSetsOverlap = (a: readonly string[], b: readonly string[]): boolean =>
  a.some((x) => b.some((y) => pathsOverlap(x, y)))
