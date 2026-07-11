# Systems Review — Good / Bad / Ugly (at v0.6.1)

Overseer's assessment across v0.1–v0.6.1, drawing on the subagent playtest report
(docs/PLAYTEST-v0.5.md), two live external test sessions, per-round sim data, and the
implementation agents' accumulated deviation notes. Solutions land as SPEC §17 (v0.7).

## GOOD — working as designed; protect these

| System | Why it's good |
|---|---|
| **Compatibility & slots** (tags → capacity → multi-GPU) | Historically honest, teaches real constraints, validated buildable for every year 1983–2025. The Voodoo2 needs-a-2D-card rule is the game in miniature. |
| **Step-based tasks + 0.1h grid + graduated work controls** | The v0.3 rewrite that made time legible. Era-authentic steps are the education layer working *during* play, not beside it. |
| **Pricing engine** (age curves, events, legacy scarcity, transition bleed) | Deep, deterministic, and the stockpile play it enables is genuinely fun (Flood Trader is built on it). |
| **Education layer** (Wiki, Chronicle, Articles, period software, certs) | The differentiator. Unlock-over-time retrospectives are elegant; content quality survived spot-checks across six decades. |
| **Tutorial + Help** | Live-verified as good by both testers. |
| **Save discipline** | 7 versions, chained migrations, byte-identical round-trips; no tester save ever broke. |
| **Sub-tab pattern** (v0.6.1) | Solved screen bloat with one reusable component; apply-don't-reinvent going forward. |
| **Test infrastructure** (validator + sim + 171-check E2E) | Caught real bugs every single round. The per-year buildability check and the ablation methodology are worth their weight. |

## BAD — functioning, but design-weak; fix with features

1. **Jobs lack decisions once accepted.** Twelve task types, one play pattern:
   accept → work steps → collect. Fault/complaint text varies; *choices* don't. The
   speed selector (Quick/Standard/Meticulous) is the only in-job decision, set once.
   This is the biggest gameplay-depth gap in the game.
   → **Solution (§17.1, v0.7 headline): job decision moments** — diagnosis can reveal
   forks (cheap patch vs proper fix), mid-job discoveries trigger customer approval
   calls, overclock jobs get a real tuning choice. Small branching, big texture.
2. **Reputation is opaque.** A hidden rolling mean over 25 outcomes; players see stars
   drift but never why. Prestige reads as a job counter.
   → **Solution (§17.2): rating transparency** — rating delta floats on job completion
   like cash/hours already do; an outcome log with reasons in the Ledger.
3. **Baseline economy can't kill you.** Playtest: rent never threatened a functioning
   shop; bankruptcy only fires on big-purchase mistakes. Fine for Standard (friendly
   is a feature), wrong for Survival, which currently just tweaks multipliers.
   → **Solution (§17.4): make Survival genuinely survival** — rent creep, harsher
   grace, leaner offers — tuned and sim-guarded at Survival, Standard untouched.
4. **Repair pay is a surprise.** Offer shows labor; the real payout adds parts +25%
   and a bench fee at completion. Upgrades got estimates in v0.6.1; repairs didn't.
   → **Solution (folded into §17.1):** post-diagnosis estimate update, and the
   approval-call mechanic makes billing explicit where it grows mid-job.
5. **Staff is a passive multiplier** (hire → forget → level). Tolerable — retraining
   (v0.6) added one real decision — but a light "focus" assignment is a good v0.8
   candidate. *Deferred, not scheduled.*
6. **Prestige perks are thin** (the "wholesale" 2% incident). Real perk depth
   (distributor terms / bulk orders with lead times) is a v0.8 candidate alongside
   staff focus. *Deferred.*

## UGLY — working, but structurally risky; fix with engineering

1. **Two 3,000-line monoliths.** `js/ui/tabs.js` (3,146) and `js/engine/jobs.js`
   (3,276). Every round they grow; every agent edit risks collateral damage and burns
   context. → **Solution (§17.3): split tabs.js** into per-tab modules now (pure
   mechanical move, no behavior change); jobs.js split deferred one round (engine risk
   is higher and v0.7 already touches it for §17.1 — don't move and rewire in the
   same round).
2. **Single-seed balance guards churn every round.** The harness documents it: gate
   seed 3000→3200→3300, because any new feature's RNG draws reshuffle the one global
   stream, and every round pays a retune tax. → **Solution (§17.5): split the RNG into
   independent named streams** (prices / offers / faults / misc) so new draws in one
   domain stop reshuffling the others, and move guards to median-of-5-seeds bands.
   Save v8 with migration. This is the single best investment in future dev velocity.
3. **News feed is becoming a landfill.** Chronicle + market + transitions +
   achievements + level-ups in one capped stream. → **Solution (§17.6): kind filters**
   on the News tab (reuse the sub-tab pattern). Small.
4. **Generative music repetition** over multi-hour sessions. Noted, low priority; a
   second pattern per era or slow variation is a v0.8 nicety. *Deferred.*

## Priority order for v0.7 ("The Craft Update")

§17.1 decision moments → §17.5 RNG streams + multi-seed guards → §17.2 rating
transparency → §17.3 tabs.js split → §17.4 Survival bite → §17.6 news filters.
