# Person D — Demo Script Rehearsal Checklist

**Primary live demo repo:** `chalk/chalk`  
**Cached fallback repo:** `sindresorhus/is` (`data/cached-profiles/sindresorhus__is.json`)

**Decision (post-rehearsal):** Use **live** `chalk/chalk`. Fetch + Claude analysis were stable and specific in testing (WezTerm/Ghostty true-color commits cited). Switch to the `sindresorhus/is` card only if GitHub or Anthropic blips on stage.

**App URL:** http://localhost:3456  
**Memory-callback live type** (echoes seeded `evt-seed-sales-onepager`):
> Can we refresh the sales one-pager for the enterprise demo?

---

## Pre-stage

```bash
npm install
npm run seed
env -u ANTHROPIC_BASE_URL -u ANTHROPIC_AUTH_TOKEN npm run dev
# open http://localhost:3456
```

Confirm `/terminal` shows the two seeded historical rows before judges arrive.

---

## Sequence (presenting pace)

- [ ] **1. Onboarding**
  - Open `/`
  - Click **chalk/chalk** (or paste URL)
  - Say: this is a genuine live scan of the team's actual code, not a preset persona
  - Wait through the real loading state

- [ ] **2. Calibration reveal**
  - On confirmation, point at a **trait** (e.g. WezTerm/Ghostty commit), not just the archetype
  - Click **Enter company terminal**
  - Read HQ's first calibration `terminal_line` naming `chalk/chalk` + that detail

- [ ] **3. Ordinary routing**
  - Team: Ops
  - Type: `Share the checklist to onboard the new logistics vendor`
  - Watch Ops Agent routing appear in the live feed

- [ ] **4. Memory callback** *(never cut)*
  - Team: Sales
  - Type: `Can we refresh the sales one-pager for the enterprise demo?`
  - Confirm reasoning references the prior enterprise one-pager event

- [ ] **5. Live spawn** *(never cut)*
  - Team: HQ
  - Type: `We need a compliance review of the enterprise MSA before Friday`
  - Confirm `spawn_new` → Compliance Agent

- [ ] **6. Close**
  - "Most AI platforms ask you to configure them. Roster reads how your team actually builds and assembles a company around you."
