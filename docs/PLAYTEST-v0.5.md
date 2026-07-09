# Playtest Report — v0.5

**Date:** 2026-07-08
**Method:** Three Sonnet subagents — (1) headless economy sims driving the real engine (12 runs × 90 in-game days across 1983/1996/2021, plus a 500-day diagnostic), (2) code-level UX/content review of `js/ui/`, `js/data/`, `css/`, (3) live browser playthrough (1983, ~5 in-game days before the Chrome extension dropped — partial coverage). Overseer independently verified the highest-severity data claim by grep. `validate-data.js` and `sim-test.js` both pass clean; no crashes, NaN, or negative prices in ~1,080+ simulated days.

---

## Priority 1 — Fix before next version

### 1.1 Corrupted price text in 8 catalog descriptions (verified) — **High, trivial fix**
A find/replace artifact replaced `$1` with ` },` inside `desc` strings in `js/data/catalog.js`. Confirmed at lines **250** (Zip 100: "a  },0 cartridge"), **289** (6600 GT: "the  },99 sweet spot"), **317** (LaserJet 1012), **330** (P965: " },30 boards"), **456** (Ryzen 7 1700: "Intel's  },089"), **486** (2080 Ti: " },,200+"), **532** (Crucial P3), **539** (RTX 4090: " },,599").
Player-visible in the Wiki and part popovers — it directly undercuts the game's "period-accurate commentary" pitch. The live playtester didn't see it only because all 8 are era-gated past 1983.
**Fix:** restore the literal `$1` in those 8 strings; add a `\},\d` check on desc fields to `tools/validate-data.js` so it can't regress.

### 1.2 Shop upgrades are poorly-telegraphed money-losers, especially late-era — **High (balance)**
Upgrade costs scale with `yearScale` (2021: ×3.39 → tier 1 ≈ $13.6k, tier 2 ≈ $50.9k) but the payback (slots/offer bonus) doesn't recoup it in a normal window. Ablation sims with identical job-picking: 2021 greedy **with** upgrades ended 90 days at **−$16,378 net** (dipped to −$207, triggering the bankruptcy grace timer); the same bot **without** upgrades ended **+$40,024**. Same direction in 1996 (+26.5k vs +41k). The live playtester confirmed the upgrade screen shows **no ROI/payback info** before purchase.
Caveat: sims never hired staff, which may be part of the intended payback — but even so, the player is given nothing to judge the purchase with.
**Fix (pick one or more):** show payback/ROI estimate on the upgrade screen; soften late-era `upgradeCost` scaling relative to `laborRate`; gate purchase behind a cash-reserve warning.

### 1.3 End Day silently fails jobs due today — no warning — **Med-High (UX)**
`UI.endDay()` (`js/ui/ui.js` ~607–631) calls `Engine.endDay()` with no confirm, while every other consequential action (Abandon, Strip, Fire, Upgrade, Import-over-save) goes through `UI.confirm`. Overdue active jobs are failed overnight with a rep hit. The due-today count already exists in `UI.updateBadges` (~546–563).
**Fix:** if `dueToday > 0` and unfinished, one-line confirm: "N jobs due today aren't finished — ending the day will fail them. End anyway?"

### 1.4 "Accept everything" is a trap the game lets you walk into — **Med-High (balance/UX)**
The accept cap is `workstationSlots × 2` (`HARD_CAP_SLOTS_MULT`, `core.js:203`; `jobs.js:1398–1409`), but a solo shop has 8 hours/day. A naive accept-everything bot failed **14–19% of jobs** to deadlines across all three eras (rating dragged to 3.9–4.6); a self-throttling bot failed 0.6–4.8%. This is the obvious first-instinct strategy for a new player.
**Fix:** lower the multiplier toward ~1.25–1.5, or show a feasibility warning when accepting a job whose deadline conflicts with the committed queue.

---

## Priority 2 — Meaningful improvements

### 2.1 Insufficient-cash purchases are a silent no-op — **Medium (UX, live-verified)**
Clicking Buy on equipment you can't afford (e.g., $1,500 Data Recovery Rig with ~$348) does nothing — no toast, shake, or disabled styling. Feels like a broken button.
**Fix:** disable with a reason tooltip, or toast "Need $X more."

### 2.2 Stockpiling arbitrage: parts billed at current market price, not cost — **Medium (balance)**
`Jobs.assignPart` (`jobs.js:1650–1684`) bills stock pulls at today's `Pricing.priceOf` × 1.25 markup regardless of `avgCost`. Verified numerically: a SIMM bought at $37.56 drifted to $103.09 after 500 days (legacy scarcity ramp ×2.8 max), billing $128.86 — ~10× the normal margin. Demand-spike events enable a faster version. Bounded by fault-category weights (laborOnly dominates), so Medium not High.
**Fix (if unintended):** bill stock pulls at `avgCost × markup` (or `min(current, avgCost-based)`); keep buy-ahead-of-shocks legitimate for the shop's own builds.

### 2.3 No profit estimate before accepting upgrade jobs — **Medium (UX)**
`renderOffers` (`tabs.js:586–615`) shows only `job.pay`; the 1.25× parts markup means real payout is understated, and margin is unknowable pre-accept. Defensible for repairs (fault unknown), not for upgrades where the part category is known at offer time.
**Fix:** show a rough parts-cost range on upgrade offers.

### 2.4 "Sell all" inventory has no confirmation — **Low-Med (UX)**
`tabs.js:306–312, 1447–1449`: instant 70%-of-market liquidation on click, inconsistent with every other bulk action. A misclick on rare legacy stock is an uncushioned loss.
**Fix:** confirm on "Sell all" only.

### 2.5 SFX volume slider machine-guns click sounds — **Low (polish)**
`onPanelInput` (`tabs.js` ~481) → `A.setSfxVol` (`audio.js:379–384`) plays a click per `input` tick while dragging.
**Fix:** preview only on `change`. *(Not verified live — session ended before the audio pass.)*

### 2.6 "Burn 1 hour" button may not advance job wait-steps — **Low-Med (needs dev check, live-observed)**
Live playtest: burn-in/format wait-steps only advanced via the job's own "Work All"; the global "Burn 1 hour" consumed the hour without visible progress, despite tooltip wording suggesting it should. Possibly intended; the tooltip and behavior disagree either way.

---

## Priority 3 — Polish / long-horizon

- **Random event variety is thin for long runs:** 9 templates × 3 headlines (`events.js:113–222`) across a 40-year span; repeats will show in 10+ year saves. 3–5 more mid/late-era templates would help (mining-noise complaint, OEM recall, right-to-repair beat).
- **Pentium 60/66 tagged `SKT-7`** (`catalog.js:133–135`): historically Socket 4. SPEC documents the Socket 5/7 merge but not 4 — likely unintentional. Cosmetic-to-minor; a data-design decision.
- **No keyboard shortcuts for the core loop** (accept/work/end-day). Tab+Enter works (real buttons, visible focus styles), but heavy daily repetition earns hotkeys.
- **Wholesale/prestige discount is oversold:** `PRESTIGE_BUY_DISCOUNT` = 2%/tier, max 8% (`core.js:43`) — much smaller than "wholesale discounts" framing implies. Either raise it or soften the copy.
- **Bankruptcy pressure is nearly non-binding:** across all 12 sims (including do-almost-nothing passive play), rent never threatened solvency; the grace mechanic only fired from the oversized 2021 upgrade purchase. Fine if bankruptcy is meant as an active-mistake punishment — confirm that's the intent.
- **Prestige tier 4 (≥250 jobs) lands ~day 150–250+** at observed pacing; tier 3 arrives comfortably within 90 days. Flag only if the top unlock was meant to land within one era's typical playtime.

## What's already working (keep)

- **Refurb-flip balance is on target:** 1.49× $/labor-hour vs jobs, inside the spec's 1.2–1.8× band; flips stayed a side hustle, not a dominant strategy.
- **Engine robustness:** ~1,080+ simulated days, zero exceptions/NaN/negative prices; the 500-day neglect run correctly ended in bankruptcy rather than a crash.
- **UX fundamentals are mostly done right:** confirms on destructive actions (except the two gaps above), disabled-button reasons, consistent money formatting, empty states everywhere, persisted audio prefs, and a genuinely good 13-step auto-navigating tutorial (live-verified).
- **Historical content quality:** outside the `$1` corruption, spot-checks across six decades found no factual date/price errors. Parts-sourcing depth (substitutes, salvage at $0 cost) and the daily briefing screen both felt good live.
- **2021 "Hard" tag is honest:** naive play there shows the highest failure count and lowest ROI of the three eras tested — the difficulty label matches reality.

## Coverage gaps / caveats

- Live browser testing covered only 1983 days 1–5; overtime, month-boundary rent, era comparison (2021), audio, and the End-Day-warning live confirmation were not exercised (Chrome extension dropped and didn't recover).
- Sims were single-seed per configuration — directions and magnitudes (2–10× effects) are trustworthy, exact percentages carry noise.
- No sim strategy hired staff; findings 1.2 and 1.4 may look different with staffing and deserve a staffed re-run after any tuning.
