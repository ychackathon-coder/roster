# ORCHESTRA landing experience: design

Date: 2026-07-24
Status: approved for implementation
Phase: 1 of 3

## Problem

When a company runs many people against many Claude Code sessions and terminals, nobody knows who is working on what. Sessions collide, work is duplicated, context is lost when a terminal closes. ORCHESTRA manages the agent workforce: it gives every session an owner, a mandate, and a persistent brain.

This spec covers only the landing experience. Its job is to make that idea felt in under sixty seconds of scrolling, and to convert with a single input: paste your company site, get a recommended agent roster.

## Goal

A one-page, animation-led landing site that:

1. Establishes the aesthetic instantly (black canvas, glyph fields, tight grotesk, one red).
2. Takes a company website URL or a plain description in a hero input pill.
3. Scans it, understands the business, and reveals a recommended roster of AI agents as an org graph.
4. Tells the before/after story through two pinned horizontal scroll acts.
5. Ends on a handoff CTA that Phase 2 (onboarding and company registry) plugs into.

## Non-goals

Explicitly out of scope for this phase. Do not build them.

- No dashboard, no console, no session-tracking UI.
- No authentication. No NextAuth, no sign-in, no gated routes.
- No database, no persistence layer, no company registry, no join codes.
- No multi-page site. Nav links target in-page anchors only.
- No billing, no pricing page, no blog.

Phase 2 adds the onboarding wizard, company records, and unique join codes on Vercel Blob. Phase 3 adds auth and the real console. Phase 1 must not pre-build for them beyond leaving the Act 5 CTA as a clean seam.

## Brand system

### Typography

| Role | Family | Notes |
|---|---|---|
| Display and headlines | Geist | Tracking tightened to -0.03em at display sizes, -0.045em above 8rem. Weight 600 to 700. Closest free match to the Helvetica Now Display in the MIQA and Cregg Paris references. |
| Body | Geist | Weight 400, tracking normal. |
| Mono: labels, nav chips, terminal, glyph field, numerals | Geist Mono | Uppercase, tracking +0.12em, sizes 10px to 13px for labels. |

Both ship from the `geist` npm package via `next/font`, so there are no external font requests and no layout shift. No other families.

### Color

Defined once as CSS custom properties in `globals.css`, consumed through Tailwind theme tokens. Never hardcode hex in components.

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#0A0A0A` | Page background. Near-black, never pure black, matching the references. |
| `--fg` | `#EDEDED` | Primary text. |
| `--fg-dim` | `#8A8A8A` | Secondary text, mono labels. |
| `--grid-lo` | `#2A2A2A` | Faintest glyphs in the field. |
| `--grid-hi` | `#8A8A8A` | Brightest grey glyphs. |
| `--accent` | `#FF3B21` | The single red. Used sparingly: caret, active nodes, scattered field particles, one word per headline at most. |
| `--accent-deep` | `#7A1206` | Depth layer for glows and gradients only. |
| `--panel` | `rgba(20,20,20,0.72)` | Glass panels and the input pill, always with backdrop blur. |

Rule: red is an event, not a decoration. If more than roughly five percent of the pixels in a viewport are red, it is wrong.

### Motion principles

- Slow, smooth, and prominent. Long durations over snappy ones. Default ease `power3.out`, scrub eases linear.
- Every scroll-driven animation is scrubbed to progress, not fired as a one-shot, except for entrance reveals.
- Nothing bounces. No spring overshoot anywhere.
- Text reveals are per-word or per-glyph, never per-letter fades on whole paragraphs.

## Architecture

Next.js 16 App Router, TypeScript strict, Tailwind v4. Single route. One server route for scanning.

### Dependencies

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | Framework. |
| `geist` | Both fonts. |
| `tailwindcss` v4 | Styling. |
| `gsap` (with ScrollTrigger) | Pinning, horizontal scrub, all scroll choreography. |
| `lenis` | Smooth scroll, wired into ScrollTrigger's scrollerProxy. |
| `three`, `@react-three/fiber`, `@react-three/drei` | Act 4 brain sphere only. Lazy loaded. |
| `groq-sdk` | Site scan inference. |
| `zod` | Validating the model's JSON before it reaches the UI. |
| `vitest` | Unit tests for pure logic. |
| `@playwright/test` | One smoke test. |

No animation component libraries, no UI kits, no icon packs beyond inline SVG.

### File layout

Each file has one job. Canvas and WebGL code stays out of layout components.

```
orchestra/
  app/
    layout.tsx                  fonts, metadata, Lenis provider mount
    page.tsx                    composes the five acts in order, nothing else
    globals.css                 tokens, base type scale, reduced-motion rules
    api/scan/route.ts           POST handler, thin: validate, call lib/scan, return
  components/
    nav/PillNav.tsx             pill chips, collapse-on-scroll behavior
    ui/Loader.tsx               Act 0 glyph assembly of the wordmark
    ui/Terminal.tsx             mono streaming-text panel, reusable
    ui/AgentCard.tsx            one agent: role, mandate, tools
    ui/OrgGraph.tsx             SVG wires connecting AgentCards by reportsTo
    hero/Hero.tsx               Act 1 layout and headline
    hero/ScanPill.tsx           the input, submit state machine, error surface
    hero/PlaceholderCycler.tsx  typed placeholder rotation
    acts/ActScan.tsx            Act 2 reveal sequence
    acts/ActMess.tsx            Act 3 pinned horizontal
    acts/ActBrain.tsx           Act 4 pinned horizontal, lazy-loads the sphere
    acts/ActHandoff.tsx         Act 5 CTA
    canvas/GlyphField.tsx       2D canvas flow field, imperative, no React per frame
    canvas/BrainSphere.tsx      R3F node-and-wire sphere
  lib/
    types.ts                    ScanResult, Agent, CompanyProfile
    scan/classifyInput.ts       url vs description, pure
    scan/extractText.ts         html to plain text, pure
    scan/prompt.ts              system prompt and JSON schema
    scan/runScan.ts             orchestrates fetch, extract, infer, validate
    scan/fallback.ts            canned roster when inference fails
    motion/lenis.ts             singleton Lenis instance and ScrollTrigger wiring
    motion/useHorizontalPin.ts  the one hook both pinned acts share
    motion/useReducedMotion.ts  reads the media query, drives all opt-outs
  data/
    fallback-roster.json
    placeholder-examples.json
```

### State

No global state library. The scan result lives in `page.tsx` as a single `useState<ScanState>` and is passed down. `ScanState` is a discriminated union: `idle | scanning | ready | error`. Acts 3 through 5 are static content and read nothing from it.

## The five acts

### Act 0: loader

The wordmark `ORCHESTRA` renders in Geist Mono at display size. Each character starts as a random glyph from a fixed charset and cycles at roughly 20 characters per second, resolving left to right into the real letters. Total duration 1.2 seconds, then the loader lifts to reveal Act 1.

Runs once per session, tracked in `sessionStorage`. Never blocks interaction longer than 1.2 seconds. Under reduced motion it does not render at all.

### Act 1: hero

**Background.** `GlyphField.tsx` draws a full-viewport 2D canvas. Several thousand mono glyphs advect along a curl-noise flow field, leaving the dotted-stream look of the Cotool reference. Most glyphs sit between `--grid-lo` and `--grid-hi`; roughly two percent are `--accent`. The field drifts continuously at low speed and parallaxes slightly toward the pointer.

Implementation constraints, these matter for performance:
- Imperative render loop in a `ref`, never React state per frame.
- Particle count scales with viewport area, hard capped.
- `devicePixelRatio` clamped to 2.
- The loop pauses via `IntersectionObserver` when the canvas leaves the viewport, and on `visibilitychange`.

**Nav.** `PillNav.tsx`. At rest: `ORCHESTRA` as a small pill chip top-left, page anchors as a chip group top-right, both `--panel` with blur, exactly like the Cregg Paris reference. Past 80px of scroll the two collapse toward each other into a single centered transparent pill with blur, springless, 400ms. Anchors only, since there are no other routes.

**Foreground.** A tight Geist headline (up to `clamp(3rem, 9vw, 9rem)`), one supporting mono line, then the input pill: large, `--panel`, blurred, red block caret. `PlaceholderCycler` types and deletes through examples from `placeholder-examples.json`, pausing on focus.

### Act 2: scan reveal

Submitting does **not** navigate. Everything happens in place. This is the centerpiece.

1. On submit, the glyph field's flow target collapses inward: particles converge and tighten toward a spherical shell at center, over about 900ms.
2. `Terminal.tsx` fades in over it and streams findings line by line as the request resolves: what the company appears to do, its surface area, where agent leverage exists. Lines stream at a readable cadence, not instantly.
3. The recommended agents then deal out as `AgentCard`s, staggered 120ms apart.
4. `OrgGraph.tsx` draws SVG wires between them along `reportsTo`, each path animating via `stroke-dashoffset`.

The terminal must have content to stream before the API resolves, so it opens with deterministic local lines derived from the input (host, classification) and only then streams model-derived lines. The user never watches a dead panel.

### Act 3: pinned horizontal, "the mess"

Pins the viewport and translates a wide track sideways as the user scrolls down, via `useHorizontalPin`.

Left of the track: six overlapping terminal windows, all mid-task, all conflicting. Duplicated work, stale context, no owner. Copy makes the pain explicit.

Travelling right: the windows de-overlap, sort, and snap into a single clean roster with one owner per lane. Wires draw between them as they settle. The turn from chaos to order is the payload of this act.

Release back to vertical at the end of the track.

### Act 4: pinned horizontal, "the brain"

Second pin. `BrainSphere.tsx` renders a sphere of nodes joined by wiring, Jarvis-style. Mono labels attach to nodes and update as agents claim tasks, driven by a local timer over a fixed script, not random per frame. The camera rotates and pushes in as the track scrolls sideways, then pulls back and releases.

Lazy loaded with `next/dynamic` and `ssr: false`, mounted only when the act is within roughly one viewport of entering. Three.js must never land in the initial bundle.

### Act 5: handoff

Vertical again. The CTA that Phase 2 attaches to. In this phase it is static: a headline, copy stating what onboarding will do (register the company, issue a unique join code), and a single button whose click handler scrolls back to the hero pill. No form, no fields, no network call. Phase 2 replaces that handler with the wizard.

## Scan pipeline

`POST /api/scan` with `{ input: string }`.

1. **Classify.** `classifyInput` decides URL or description. Bare domains normalize to `https://`.
2. **Fetch, URL path only.** 8 second timeout, `AbortController`, a normal browser user agent, follow up to three redirects, cap the response body at 2MB. Reject non-HTML content types.
3. **Extract.** `extractText` strips `script`, `style`, `noscript`, `svg`, collapses whitespace, keeps `title` and `meta[name=description]`, truncates to 6000 characters.
4. **Infer.** Groq chat completion, `llama-3.3-70b-versatile`, `response_format: json_object`, temperature 0.4. Returns a company profile plus five to seven agents, each with `role`, `mandate`, `tools`, `reportsTo`.
5. **Validate.** Zod parse. On failure, one retry with a repair instruction, then fall back.

### Failure handling

The animation must never dead-end. Three layers:

| Failure | Response |
|---|---|
| Fetch fails, times out, or is blocked | Infer from the hostname and any description text alone. Terminal says so plainly. |
| Groq errors, rate-limits, or returns unparseable JSON after retry | Serve `fallback-roster.json`, a generic but credible seven-agent org. Terminal notes it is a sample. |
| Empty or junk input | Client-side guard before submit, inline mono error under the pill. No request sent. |

Env: `GROQ_API_KEY`, server-side only, never exposed to the client. The route is the only thing that touches it.

## Responsive and accessibility

**Mobile, below 768px.** Both pinned acts degrade to normal vertical reveals; no pinning, no horizontal translation. `BrainSphere` is replaced by a lighter 2D canvas node graph. `GlyphField` particle count drops substantially. The hero pill goes full width.

**Reduced motion.** With `prefers-reduced-motion: reduce`: the loader does not render, pins are disabled and both acts become plain vertical sections, the glyph field renders one static frame, the terminal prints complete rather than streaming, and cards appear without stagger. Every act must be readable and complete in its final composed state.

**Baseline.** Semantic landmarks and heading order. The input pill has a real label. Focus is visible on every interactive element, in red. Canvas and WebGL layers are `aria-hidden`. Contrast of `--fg` and `--fg-dim` on `--canvas` both clear AA.

## Performance budget

- Initial JS under 200KB gzipped, excluding the lazy Three.js chunk.
- Sustained 60fps on the hero field on an M-series laptop; no worse than 30fps on a mid-tier phone.
- LCP under 2.5s on a throttled fast-3G profile. The headline is the LCP element and must not wait on canvas or fonts.
- Three.js loads only when Act 4 approaches.

## Testing

**Unit, Vitest.** The pure logic, which is where real bugs hide: `classifyInput` across bare domains, full URLs, prose, and junk; `extractText` against saved HTML fixtures including script-heavy and empty pages; the Zod schema against valid, malformed, and partial model payloads; `fallback.ts` selection logic.

**Integration.** `/api/scan` with a mocked fetch and a mocked Groq client, covering each of the three failure rows above and asserting the route always returns a valid `ScanResult` with a 200.

**Smoke, Playwright.** One test: page loads, submit a URL against a mocked scan route, assert the terminal streams and agent cards render.

**Visual.** Headless screenshot at each act boundary, reviewed against the reference images. Motion is verified by eye, not asserted in tests.

## Success criteria

1. Every act renders and animates as specified on desktop Chrome and Safari.
2. Submitting a real company URL yields a plausible, specific agent roster within 6 seconds.
3. All three failure paths still produce a complete Act 2 reveal.
4. Both pinned acts release cleanly to vertical, and the page cannot trap the user.
5. Reduced motion and mobile paths are fully readable.
6. Performance budget met.
7. Nothing from the non-goals list has been built.
