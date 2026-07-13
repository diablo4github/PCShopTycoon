# AGENTS.md — Circuit & Solder: PC Shop Tycoon

Instructions for AI agents working in this repository. Read this first, then read
`SPEC.md` (the binding contract) before writing any code.

## What this is

A turn-based PC-repair-shop tycoon game spanning 1983–2025, doubling as an educational
window into PC-building history. **Vanilla JS, zero build step, zero dependencies** —
the game must always run by opening `index.html` from `file://` or any static server.

## How this repo is developed

- An **overseer** session plans each version, appends a numbered addendum to `SPEC.md`,
  dispatches parallel subagents (below), reviews/integrates their work, runs the QA
  gate, and performs **all git operations**. Subagents never run git and never edit
  `SPEC.md` or `AGENTS.md`.
- Work is split into three workstreams with **hard file ownership** (never touch
  another workstream's files):

| Workstream | Owns |
|---|---|
| DATA   | `js/data/*.js`, `tools/validate-data.js` |
| ENGINE | `js/engine/*.js`, `tools/sim-test.js`, `tools/mock-data.js` |
| UI     | `index.html`, `css/styles.css`, `js/ui/*.js`, `js/ui/tabs/*.js` |

- `SPEC.md` grows by **appended, numbered addenda** (§9, §10, …), one per version.
  Later sections win on conflict. Do not rewrite earlier sections.
- Workstreams run **concurrently**: code defensively against sibling work in flight —
  feature-detect new Engine APIs in the UI, tolerate missing/old data tables in the
  engine, keep dual-format support during data migrations.

## Non-negotiable conventions

- **Dual-environment scripts:** every data/engine file uses the IIFE prologue from
  SPEC §0 so it loads in the browser **and** under Node `require()` (used by the test
  tools). No `window`/`document`/`localStorage` outside `js/ui/` — except `localStorage`
  in `js/engine/api.js` behind `typeof` guards.
- **Determinism:** ALL engine/data randomness goes through the seeded RNG
  (`Engine.rand()`, state in `state.rngState`). `Math.random` is forbidden outside
  `js/ui/` cosmetics. Saves are JSON and must round-trip byte-identically.
- **Money:** dollars as Numbers, `Engine.round2()` after arithmetic. **Time:** 0.1-hour
  grid, `Engine.round1()`. Offer pay is whole dollars.
- **API style:** every mutator returns `{ok:true, …}` or `{ok:false, error:"readable
  reason"}` and never throws on bad input. The UI computes **no game rules** — it
  renders state/view functions and calls API mutators; on `ok:false` it toasts the
  error. New rules always live engine-side.
- **Saves:** `state.version` gates migrations. Chain-migrate every older version;
  **never reject a valid old save**. Bump the version only when the state shape
  changes; pure-logic patches keep it.
- **UI patterns:** delegated listeners + `innerHTML` re-render; all mutations through
  `UI.act` (floats hour/cash deltas); `esc()` every engine/data string before
  interpolating into HTML; feature-detect (`typeof Engine.x === 'function'`) anything
  newer than SPEC §4; every list needs an empty state; destructive actions need
  confirms; keep all four era skins readable; anything that can overflow scrolls in its
  own container (`min-height:0` on flex scroll bodies; account for `--ui-zoom` when
  using `vh/vw`).
- **History accuracy matters.** Part specs, dates, prices, sockets, events, and step
  lists are the educational product. Use real names and period-plausible numbers;
  follow the perf-anchor tables in SPEC §2.1.

## Quality gate (run before reporting done)

```sh
node --check <every file you touched>
node tools/validate-data.js     # data schemas, coverage, per-year buildability
node tools/sim-test.js          # per-era bot runs, feature scenarios, balance guards
```

Both suites must PASS on real data. If a sibling workstream's in-flight edits break a
suite, say so explicitly in your report — distinguish their failure from yours.
UI work additionally smoke-tests live in the pre-installed Chromium
(Playwright `executablePath: '/opt/pw-browsers/chromium'` — never `playwright install`;
serve via `python3 -m http.server`). The overseer runs the cumulative Playwright E2E
(`tools/e2e.js` — needs playwright resolvable by Node, but is not a game dependency)
that must stay green with **zero console errors**. Agents don't edit it; report
suspected harness-vs-contract drift to the overseer instead.

Balance guards to respect (tuned values live in `Engine.CONFIG`): the 1983 40-day bot
lands in the $2k–$10k band; offer ramp mean ≤ 3.6/day; flips-vs-jobs $/hour ratio in
[1.2, 1.8] at the gate seed; as-is market liveness ≥ 50% of days. If your change
shifts these, retune CONFIG (never data prices) and report the numbers.

## Reporting

End every task with: what you built/changed (by file), suite results, any deviations
from the spec (with rationale), and any cross-workstream contract fields you need from
a sibling (named precisely — the overseer relays them as binding).
