# Circuit & Solder: PC Shop Tycoon — Architecture Spec (v1)

This document is the **binding contract** between the three workstreams (DATA, ENGINE, UI).
Every agent must read this file completely before writing code, and must conform to the
schemas, namespaces, and API signatures below **exactly**. Deviations break integration.

## 0. Tech & conventions

- **Vanilla JS, no build step, no ES modules.** The game must run by opening `index.html`
  from `file://` or any static server. All code is plain `<script>` files that attach to
  shared global namespaces.
- Every non-UI script (data + engine) must use this exact prologue/epilogue so the file
  also loads under Node via `require()` (used by headless test scripts in `tools/`):

  ```js
  (function (root) {
    'use strict';
    var DATA = root.DATA = root.DATA || {};     // data files
    // var Engine = root.Engine = root.Engine || {};  // engine files
    // ... file contents ...
  })(typeof window !== 'undefined' ? window : globalThis);
  ```

  Data/engine files must NOT reference `document`, `window.*` UI APIs, or `localStorage`
  directly — except `js/engine/api.js` may touch `localStorage` guarded by
  `typeof localStorage !== 'undefined'`.
- UI scripts attach to `window.UI` and may use the DOM freely (browser-only).
- Money: plain Numbers in dollars; round to 2 decimals after arithmetic
  (`Engine.round2(x)`); UI formats with `$` and thousands separators.
- Dates: canonical time is `state.day` (integer day index, 0 = start date). Convert with
  `Engine.dateInfo(dayIndex)` (see §4). Historical events use real ISO dates; the engine
  converts to day indexes at runtime.
- Randomness: **all** engine randomness goes through `Engine.rand()` (seeded mulberry32,
  state stored in `state.rngState`) so saves are deterministic. Never use `Math.random()`
  in data or engine code.
- Script load order in `index.html` (UI agent writes these tags):

  ```
  js/data/catalog.js
  js/data/eras.js
  js/data/events.js
  js/data/flavor.js
  js/engine/core.js
  js/engine/pricing.js
  js/engine/compat.js
  js/engine/jobs.js
  js/engine/simulation.js
  js/engine/api.js
  js/ui/ui.js
  js/ui/tabs.js
  js/ui/screens.js
  ```

## 1. File ownership (hard boundaries)

| Workstream | Owns (nobody else touches) |
|---|---|
| DATA   | `js/data/catalog.js`, `js/data/eras.js`, `js/data/events.js`, `js/data/flavor.js`, `tools/validate-data.js` |
| ENGINE | `js/engine/core.js`, `js/engine/pricing.js`, `js/engine/compat.js`, `js/engine/jobs.js`, `js/engine/simulation.js`, `js/engine/api.js`, `tools/sim-test.js` |
| UI     | `index.html`, `css/styles.css`, `js/ui/ui.js`, `js/ui/tabs.js`, `js/ui/screens.js` |

No agent commits to git; the overseer handles all git operations.

## 2. DATA namespace (`window.DATA`)

### 2.1 `DATA.PARTS` — component catalog (`js/data/catalog.js`)

Array of part objects:

```js
{
  id: "cpu-486dx2-66",          // unique, kebab-case, prefixed by category
  name: "Intel 486DX2-66",
  category: "cpu",              // one of: cpu, motherboard, ram, storage, gpu,
                                //   psu, case, cooling, os, peripheral
  platformTags: ["SKT-486"],    // see §2.2 tag namespaces
  perf: { cpu: 45 },            // category-relevant keys, see below
  reliability: 86,              // 0-100
  basePrice: 350,               // typical launch-era street price, USD (nominal)
  introYear: 1992,
  introMonth: 8,                // optional, default 1
  eolYear: 1997,                // last year sold new
  legacy: true,                 // gains scarcity premium post-EOL (default: true for
                                //   cpu/motherboard/ram/gpu, false otherwise)
  tier: "mainstream",           // "budget" | "mainstream" | "premium"
  powerDraw: 8,                 // watts (all categories except psu; 0 ok for os)
  watts: 300,                   // PSU ONLY: rated output
  style: 6,                     // OPTIONAL, 0-10, case & cooling only (aesthetic builds)
  integratedVideo: true,        // OPTIONAL, motherboards only
  desc: "one-liner flavor"      // optional
}
```

**perf keys by category** (absolute units, consistent across all eras):
- cpu: `{ cpu: <relative int perf score> }` — anchors: 8088-4.77 = 2, 286-12 = 8,
  386DX-33 = 20, 486DX2-66 = 45, Pentium 133 = 90, PII-300 = 220, Athlon 1GHz = 550,
  P4 2.4 = 800, Core 2 E6600 = 1800, i5-2500K = 3800, i7-6700K = 5200,
  Ryzen 7 5800X = 9500, i9-13900K = 16000. Interpolate sensibly for others.
- gpu: `{ gpu: <score> }` — anchors: CGA/MDA cards = 1-2, VGA ISA = 5, ET4000 = 12,
  S3 Trio = 25, Voodoo1 = 80, TNT2 = 160, GeForce2 GTS = 320, Radeon 9700 = 900,
  8800 GT = 2600, GTX 680 = 5200, GTX 1070 = 9000, RTX 3080 = 18000, RTX 4090 = 32000.
- ram: `{ ramMB: <capacity in MB, floats ok (64KB = 0.0625)> }`
- storage: `{ storageGB: <capacity in GB, floats ok>, speed: <1-100 relative speed:
  floppy 1, MFM HDD 3, IDE 10, fast IDE 18, SATA HDD 30, SATA SSD 70, NVMe 95> }`
- motherboard: `{ }` (empty ok) — its value is its platformTags.
- psu/case/cooling/peripheral/os: `{}` or `{ cool: 1-10 }` for cooling quality.

**Catalog coverage requirement:** span 1979–2025. For each of these era buckets —
1979-84, 1985-90, 1991-95, 1996-2000, 2001-05, 2006-10, 2011-15, 2016-20, 2021-25 —
include **at least 4 parts in each of** cpu, motherboard, ram, storage, gpu, psu, case,
and at least 2-3 each of cooling, os, peripheral (peripherals: printers, CRT/LCD
monitors, keyboards, mice, modems). Target total: **300–450 parts**. Use real historical
names and plausible nominal prices (e.g., 1983 IBM PC/XT-class HDD ~$1000+;
2021-shortage-era RTX 3080 basePrice is its MSRP ~$699 — the event system supplies the
shortage multiplier).

### 2.2 Platform tag namespaces

Motherboards carry the **full list** of everything they accept; other parts carry the
tag(s) they need. Compatibility = per-category ANY-overlap with the motherboard's tags
(engine implements, §5). Namespaces (prefix mandatory):

- `SKT-*` — CPU socket/slot, e.g. `SKT-8088`, `SKT-286`, `SKT-386`, `SKT-486`,
  `SKT-5` (Socket 5/7 as `SKT-7`), `SKT-SLOT1`, `SKT-A`, `SKT-478`, `SKT-775`,
  `SKT-AM2`, `SKT-1155`, `SKT-AM4`, `SKT-1700`, `SKT-AM5`, …
- `MEM-*` — memory type: `MEM-DIP`, `MEM-30SIMM`, `MEM-72SIMM`, `MEM-SDR`, `MEM-DDR`,
  `MEM-DDR2`, `MEM-DDR3`, `MEM-DDR4`, `MEM-DDR5`
- `BUS-*` — expansion/video bus: `BUS-ISA8`, `BUS-ISA16`, `BUS-VLB`, `BUS-PCI`,
  `BUS-AGP`, `BUS-PCIE` (one coarse PCIe tag; gen differences ignored)
- `STOR-*` — storage interface: `STOR-FDD`, `STOR-MFM`, `STOR-IDE`, `STOR-SCSI`,
  `STOR-SATA`, `STOR-NVME`
- `FF-*` — form factor (case & PSU & motherboard): `FF-XT`, `FF-AT`, `FF-ATX`,
  `FF-MATX` (micro-ATX boards also list `FF-ATX`-compatible cases via the case listing
  both tags), `FF-ITX`
- `ARCH-*` — OS/CPU architecture for OS compat: `ARCH-8BIT`, `ARCH-16`, `ARCH-386`,
  `ARCH-586`, `ARCH-X64`. Motherboards list the arch of their CPU class; OS parts list
  every arch they run on.

A motherboard example:
`platformTags: ["SKT-AM4","MEM-DDR4","BUS-PCIE","STOR-SATA","STOR-NVME","FF-ATX","ARCH-X64"]`.
Cases list the form factors they accept: `["FF-ATX","FF-MATX"]`. PSUs list their form
factor: `["FF-ATX"]`. Storage lists its interface. GPUs list their bus. OS lists archs.

### 2.3 `DATA.YEAR_BASELINES` (`js/data/catalog.js`)

Object keyed by year (at least every ~3 years from 1983 to 2025; engine interpolates):

```js
DATA.YEAR_BASELINES = {
  1983: { cpu: 2,    gpu: 1,    ramMB: 0.25,  storageGB: 0.01, laborRate: 28,
          buildBudget: 2200 },   // typical mid-range full-system price that year
  1996: { cpu: 110,  gpu: 30,   ramMB: 16,    storageGB: 1.6,  laborRate: 45,
          buildBudget: 2200 },
  2021: { cpu: 9000, gpu: 16000, ramMB: 16384, storageGB: 1000, laborRate: 95,
          buildBudget: 1800 },
  // ... fill in the full range
};
```

`laborRate` = $/hour the shop can charge; drives job pay. `buildBudget` = typical
mid-range custom-build budget that year.

### 2.4 `DATA.ERAS` (`js/data/eras.js`)

Array of six start presets:

```js
{
  id: "era1983", startYear: 1983, startDate: "1983-03-01",
  name: "1983 — The Repair Era",
  blurb: "2-4 sentence rationale shown on the new-game screen (see design brief:
          home-computer boom created the repair mass market; custom building locked).",
  cash: 3000, shopTier: 0,
  customBuildsUnlocked: false,   // true for 1991+
  difficulty: "Standard",        // freeform hint text, e.g. 2021 = "Hard — GPU shortage"
}
```

Presets: 1983 ($3000), 1991 ($6000), 1996 ($9000), 2004 ($14000), 2013 ($20000),
2021 ($30000). Custom-build auto-unlock date for early starts: **1989-09-01**
(`DATA.CUSTOM_BUILD_UNLOCK_DATE = "1989-09-01"`).

### 2.5 `DATA.SHOP_TIERS` (`js/data/eras.js`)

Array of 4:

```js
{
  id: 0, name: "Garage",
  rentBase: 350,          // $/month in 1983 dollars; engine scales by year:
                          //   rent = rentBase * (laborRate(year)/laborRate(1983))
  utilitiesBase: 60,
  workstationSlots: 2,    // max concurrent active jobs being worked same day (soft cap:
                          //   jobs beyond slots take +50% hours)
  offerBonus: 0,          // added to daily offer count
  storageSlots: 20,       // free inventory slots (1 slot = 1 part unit)
  upgradeCost: null,      // cost to upgrade INTO this tier (null for tier 0);
                          //   nominal dollars at 1983 scale, engine year-scales it
  minPrestige: 0,         // prestige tier required to upgrade into it
  desc: "…"
}
```

Tiers: Garage → Strip-mall Unit → Main Street Storefront → Superstore.
Suggested: slots 2/4/6/10, storage 20/50/120/300, offerBonus 0/1/2/4,
upgradeCost (1983-scale) 4000/15000/60000, minPrestige 0/1/2/3.

### 2.6 `DATA.EQUIPMENT` (`js/data/eras.js`)

Array:

```js
{
  id: "diag-station", name: "Diagnostic Station",
  costBase: 800,            // 1983-scale dollars; engine year-scales
  introYear: 1983,          // earliest availability (data-recovery tiers later, etc.)
  desc: "Halves diagnosis time.",
  effects: { diagHoursMult: 0.5 }
}
```

Required equipment ids & effects (engine consumes these exact effect keys):

| id | effects | notes |
|---|---|---|
| `repair-bench` | `{}` | owned from start, cost 0 |
| `diag-station` | `{ diagHoursMult: 0.5 }` | |
| `build-bench` | `{ enablesBuilds: true }` | required for custom builds & contracts(build) |
| `software-station` | `{ softwareHoursMult: 0.75 }` | required for virus removal jobs |
| `dr-rig-1` | `{ drTier: 1 }` | data recovery tier 1 (1983+) |
| `dr-rig-2` | `{ drTier: 2 }` | (1995+) requires dr-rig-1 (`requires: "dr-rig-1"`) |
| `dr-rig-3` | `{ drTier: 3 }` | (2010+) requires dr-rig-2 |
| `crt-kit` | `{ crtSafe: true }` | CRT discharge kit |
| `esd-setup` | `{ mishapMult: 0.2 }` | |
| `test-bench` | `{ callbackMult: 0.6 }` | |

(DATA agent may add 2-3 more flavorful ones with these same effect keys only.)

### 2.7 `DATA.HISTORICAL_EVENTS` (`js/data/events.js`)

Array; **must include at least**: 1988 DRAM shortage, 1993 Sumitomo resin-plant
explosion RAM spike, late-90s dot-com boom demand surge, 2000-01 dot-com bust slump,
2011 Thailand flood HDD spike, 2017-18 crypto GPU shortage, 2020-21 crypto/COVID GPU
shortage. Add more if you like (Y2K upgrade rush, Win95 launch, COVID WFH demand, etc.).

```js
{
  id: "dram-1988",
  startDate: "1988-01-15", durationDays: 420,
  headline: "DRAM shortage bites: memory prices triple",
  body: "1-3 sentences of period-plausible news copy.",
  effects: [ { categories: ["ram"], priceMult: 2.8 } ],  // may list several
  jobVolumeMult: 1.0,          // optional, multiplies daily offer count while active
  demandNote: "upgrades"       // optional freeform
}
```

`priceMult` is the PEAK multiplier; the engine ramps it in over the first 15% of the
duration and out over the last 25%.

### 2.8 `DATA.RANDOM_EVENT_TEMPLATES` (`js/data/events.js`)

Array of repeatable generic events the engine fires randomly (~1-2/month chance each
eligible):

```js
{
  id: "tariff", weight: 2, minYear: 1983, maxYear: 2100,
  headlines: ["New import tariffs announced on …"],   // engine picks one
  body: "…",
  durationDays: [30, 90],       // engine picks uniform int in range
  effects: [ { categories: ["gpu","motherboard"], priceMult: [1.2, 1.5] } ],
  jobVolumeMult: 1.0
}
```

Must include at least: import tariffs, distributor bankruptcy (category spike), local
competitor closes (jobVolumeMult 1.3-1.5), local competitor opens (0.7-0.85), press
coverage (volume up — engine also fires this on prestige-up), warehouse fire sale
(category price DROP, mult 0.6-0.8), flu season (volume down).

### 2.9 `DATA.FLAVOR` (`js/data/flavor.js`)

```js
DATA.FLAVOR = {
  firstNames: [ /* 60+ */ ], lastNames: [ /* 60+ */ ],
  customerTypes: [ { id:"home", label:"Home user" }, { id:"smallbiz", label:"Small business" },
                   { id:"student", label:"Student" }, { id:"office", label:"Office manager" },
                   { id:"gamer", label:"Gamer", minYear: 1993 },
                   { id:"creator", label:"Content creator", minYear: 2008 }, /* etc */ ],
  faults: {   // fault templates for diagnose&repair, keyed by the part category that fixes them
    ram:      [ { desc: "Random crashes and parity errors", laborHours: 1 } , ...],
    storage:  [ ... ], gpu: [ ... ], psu: [ ... ], motherboard: [ ... ], cpu: [ ... ],
    cooling:  [ ... ],
    laborOnly:[ { desc: "Loose seating on expansion cards", laborHours: 1 }, /* 6+ no-part faults */ ]
  },
  machineAdjectives: ["dusty","smoke-stained","barn-find","office-surplus", ...], // refurb flavor
  jobBlurbs: { repair: ["…", ...], upgrade: [...], build: [...], data_recovery: [...],
               software: [...], cleaning: [...], peripheral: [...], enthusiast: [...],
               contract: [...] },     // 4+ each, short customer-voice quotes
  peripheralItems: [ { name:"dot-matrix printer", minYear:1979, maxYear:1996 },
                     { name:"CRT monitor", minYear:1979, maxYear:2006, crt:true },
                     { name:"inkjet printer", minYear:1990 }, /* 10+ */ ],
  shopNameSuggestions: ["Circuit & Solder", ...]
};
```

## 3. Game state shape (single source of truth)

`Engine.getState()` returns this object (JSON-serializable, no functions, no part
object references — only part **ids**):

```js
{
  version: 1,
  seed: 12345, rngState: 987654321,
  shopName: "Circuit & Solder",
  eraId: "era1983",
  startDate: "1983-03-01",       // ISO
  day: 0,                        // day index since startDate
  cash: 3000,
  hoursLeft: 8, hoursPerDay: 8,
  supplyRunDoneToday: false,     // first market/as-is purchase of the day costs 0.5h
  customBuildsUnlocked: false,
  flags: { gameOver: false, gameOverReason: null, graceDeadlineDay: null },
  reputation: { rating: 3.0, history: [ /* last 25 scores 0-5 */ ],
                prestige: 0,     // 0 Unknown,1 Neighborhood Fixture,2 Well-Reviewed,
                                 // 3 Renowned,4 Legendary
                jobsCompleted: 0, jobsFailed: 0, callbacks: 0 },
  shop: { tier: 0, equipment: ["repair-bench"], insurance: false },
  inventory: [ { partId, qty, avgCost } ],
  jobs: {
    offers: [ Job ], active: [ Job ],
    completedRecent: [ { jobId, title, day, callbackRolledDay, callbackChance, fired } ],
    nextId: 1
  },
  asIsMarket: [ Machine ],       // rotating broken-machine listings
  market: {
    noise: { partId: 1.03 },     // per-part random-walk noise factor
    hist:  { partId: [ /* up to 30 recent daily prices, newest last */ ] },
    activeEvents: [ { eventId or template instance: { id, name, headline, endDay,
                       effects, jobVolumeMult } } ]
  },
  news: [ { day, dateStr, headline, body, kind } ],   // newest FIRST, cap 200
  ledger: {
    months: [ { ym: "1983-03", revenue, partsCost, fixedCosts, other, net } ], // newest last
    lifetime: { revenue, partsCost, fixedCosts, other, jobsCompleted, jobsFailed,
                buildsDelivered, refurbsSold, daysPlayed }
  }
}
```

### 3.1 Job object

```js
{
  id: 17,
  type: "repair" | "upgrade" | "build" | "refurb" | "data_recovery" | "software" |
        "cleaning" | "peripheral" | "contract" | "enthusiast" | "callback",
  subtype: null | "virus" | "os_install" | "overclock" | "aesthetic" | "thermal_paste"
         | "contract_build" | "contract_upgrade" | "crt" | "printer",
  rush: false,
  title: "Repair: IBM PC/XT won't boot",
  blurb: "customer-voice quote",
  customer: { name: "Pat Nguyen", type: "smallbiz" },
  pay: 85,                      // 0 for callback; null for refurb (market-priced at sale)
  offeredDay: 4, deadlineDay: 9, // absolute day indexes; refurb deadline null
  difficulty: 2,                 // 1-5 shown as wrench icons/hint
  speed: "standard",             // "quick" | "standard" | "meticulous"
  status: "offer" | "active" | "done" | "sold",   // done→removed after payout except refurb (sold)
  hoursRequired: 2, hoursDone: 0,   // hoursRequired is at STANDARD speed; engine
                                    // converts via speed multiplier when working
  diagnosed: false, needsDiagnosis: true,
  fault: { desc, partCategory | null, laborHours },   // hidden until diagnosed
  needs: [ { category, anyOfTags: [..] | null, minPerf: {..} | null, qty: 1,
             filledPartIds: [], label: "16MB SDRAM" } ],
  build: { budget, useCase: "office"|"gaming"|"workstation"|"server",
           minPerf: { cpu, gpu, ramMB, storageGB }, minStyle: 0,
           parts: [partIds], validated: false },      // build/enthusiast-aesthetic only
  units: 1, unitsDone: 0,        // contracts
  machine: { name, year, partIds: [..], askPrice, boughtFor },  // refurb only
  drTier: 1,                     // data_recovery: required rig tier
  crt: false,                    // peripheral: needs crt-kit for safety
  result: null | { onTime, score, payout, notes }
}
```

### 3.2 Machine (as-is market listing)

```js
{ id, name: "dusty Packard Bell 486", year, askPrice, hint: "no video on boot",
  partIds: [..], faultPartIdx: 2 | null, listedDay }
```

## 4. Engine public API (`window.Engine`) — UI codes against THIS

All mutating calls return `{ ok: true, ...extras }` or `{ ok: false, error: "human-readable reason" }`.
All are synchronous. After any `ok:true` mutation the UI re-renders from `getState()`.

### Lifecycle
- `Engine.newGame({ eraId, shopName, seed? })` → `{ok}`. Initializes state, generates day-0 offers/prices/news.
- `Engine.getState()` → state object (live reference; UI must not mutate).
- `Engine.getConfig()` → balance constants object (readonly).
- `Engine.endDay()` → `{ ok, summary }` — advances ≥1 day (auto-skips Sunday by
  advancing again; both nights process). Autosaves. `summary`:

  ```js
  { dateStr: "Tuesday, March 15, 1983", skippedSunday: bool,
    newOffers: ["title", ...], expired: ["title"...], callbacks: ["title"...],
    priceMovers: [ { name, pct } ],            // top ±5 by 1-day %
    news: [ { headline, body } ],              // fired overnight
    charges: [ { label: "Rent (Garage)", amount: -350 } ],
    payouts: [ { label, amount } ],            // contract milestones etc.
    graceWarning: null | "Cash negative — N days to recover",
    gameOver: false }
  ```
- `Engine.getGameOverStats()` → `{ reason, dateStr, daysPlayed, lifetime: {...}, rating, prestigeLabel }`.
- `Engine.dateInfo(dayIndex)` → `{ iso, y, m, d, weekday /*0=Sun*/, weekdayName, monthName, label: "Tuesday, March 15, 1983", isSunday, isFirstOfMonth }`.
- `Engine.round2(x)`; `Engine.fmtMoney(x)` → `"$1,234.56"` (engine provides; UI may use).

### Saves
- `Engine.exportSave()` → JSON string.
- `Engine.importSave(str)` → `{ok}` (validates version & required keys).
- `Engine.hasAutosave()` → bool; `Engine.loadAutosave()` → `{ok}`; `Engine.clearAutosave()`.

### Jobs
- `Engine.getOffers()` / `Engine.getActiveJobs()` → arrays of Job (live).
- `Engine.acceptOffer(jobId)` → `{ok}` (fails if workbench slots full — active
  non-refurb jobs ≥ slots×2 hard cap).
- `Engine.declineOffer(jobId)` → `{ok}` (no rep cost; >5 declines in one day: tiny rep ding).
- `Engine.setJobSpeed(jobId, "quick"|"standard"|"meticulous")` → `{ok}` (any time before completion).
- `Engine.diagnoseJob(jobId)` → `{ok, hoursSpent, fault: {desc, partCategory}}`.
- `Engine.getJobNeeds(jobId)` → `[ { index, label, category, qty, filled, options: [
    { partId, name, source: "inventory"|"market", price, inStock } ] } ]` — compatible
  candidate parts sorted cheapest first.
- `Engine.installPart(jobId, needIndex, partId)` → `{ok, cost}` — pulls from inventory
  if in stock else buys at market price (supply-run hour rule applies). For contracts,
  fills up to `qty` units at once if affordable, else partial with `{ok:true, filledNow}`.
- `Engine.workJob(jobId, hours?)` → `{ok, hoursSpent, completed, result?}` — hours
  default = as much as useful & available. Completion triggers payout/rating/callback
  roll immediately; refurb completion sets machine "ready to sell".
- `Engine.abandonJob(jobId)` → `{ok}` (rep hit; refurb: machine scrapped for 25% parts value).

### Custom builds (job.type build / enthusiast-aesthetic / contract_build)
- `Engine.getBuildCatalog(jobId)` → `{ categories: { cpu: [ {partId,name,price,perf,
    tags,inStock,compatible: bool, why: "…" } ], ... } }` — compatibility computed
  against currently selected motherboard (all compatible=true if none selected).
- `Engine.setBuildPart(jobId, category, partId|null)` → `{ok}` (null clears; storing selection).
- `Engine.validateBuild(jobId)` → `{ valid, problems: ["CPU socket SKT-486 not on
    motherboard", "PSU 200W < required 260W", ...], perf: {cpu,gpu,ramMB,storageGB,
    composite}, meetsTarget: bool, style, partsCost, budget, underBudget }`.
    Also callable as `Engine.validatePartList([partIds])` for tooling.
- `Engine.commitBuild(jobId)` → `{ok}` — validates, buys missing parts (inventory
  first), sets job ready to `workJob`.

### Market & inventory
- `Engine.getMarket({category?, search?})` → array `{ partId, name, category, tier,
  price, change1: pct, change30: pct, spark: [last 14 prices], inStockQty, tags,
  perfLabel: "45 CPU" , scarce: bool /*post-EOL*/, isNew: bool /*intro <90d*/ }` —
  only parts with introDate ≤ today; sorted category then price.
- `Engine.buyPart(partId, qty)` → `{ok, cost}`; `Engine.sellPart(partId, qty)` →
  `{ok, proceeds}` (70% of market).
- `Engine.getInventoryView()` → `[ { partId, name, category, qty, avgCost, curPrice } ]`
  plus `Engine.getStorageInfo()` → `{ used, free, overage, feePerSlot }`.
- `Engine.getPriceHistory(partId)` → up to 30 numbers.

### Refurb / as-is market
- `Engine.getAsIsMarket()` → live array of Machines.
- `Engine.buyAsIsMachine(machineId)` → `{ok}` — creates active refurb Job.
- `Engine.sellRefurb(jobId)` → `{ok, price}` — only when repaired ("done").
- `Engine.appraiseRefurb(jobId)` → `{ estimate }` — current expected sale price.

### Shop
- `Engine.getShopView()` → `{ tier: {…current}, nextTier: { name, cost, minPrestige,
  canAfford, prestigeOk } | null, equipment: [ { id, name, cost, owned, available,
  requiresOwned, desc } ], insurance: { active, monthlyCost } }` (costs year-scaled).
- `Engine.buyEquipment(id)` → `{ok}`; `Engine.upgradeShop()` → `{ok}`;
  `Engine.setInsurance(bool)` → `{ok}`.

### Misc
- `Engine.getNews(limit=50)` → newest-first slice.
- `Engine.getLedger()` → `{ months (newest last), lifetime, currentMonthPreview }`.
- `Engine.getPrestigeInfo()` → `{ tier, label, nextLabel, progressNote, perks: [str] }`.

## 5. Engine mechanics (authoritative formulas)

### 5.1 Compatibility (compat.js)
Given a part list: exactly one motherboard required. For each other part, find the tag
namespace relevant to its category (cpu→SKT, ram→MEM, gpu→BUS, storage→STOR, psu→FF,
case→FF, os→ARCH); part fits iff **any** of its tags in that namespace appears in the
motherboard's tags — except **case**: the CASE lists accepted form factors, so check the
motherboard's FF tag appears in the case's tags. Cooling/peripheral: always compatible.
Extra checks: PSU `watts ≥ 1.15 × Σ powerDraw`; full build requires cpu, motherboard,
ram, storage, case, psu, os + (gpu OR motherboard.integratedVideo); gpu required anyway
if job minPerf.gpu > (integrated ≈ 2). Every problem produces a human-readable string.
Machine perf = `{cpu, gpu (integrated=2), ramMB, storageGB}`, composite =
`0.35*norm(cpu)+0.30*norm(gpu)+0.20*norm(ramMB)+0.15*norm(storageGB)` normalized
against the interpolated YEAR_BASELINES for the current year (norm = value/baseline,
capped at 3).

### 5.2 Pricing (pricing.js)
`price(part, day) = basePrice × ageCurve × eventMult × noise[partId] × prestigeBuyDiscount`
(discount only when buying: `1 − 0.02×prestigeTier`).
ageCurve: let t = years since intro (float), L = eolYear−introYear (≥1):
- t < 0: unavailable.
- 0 ≤ t < 0.5: 1.15 → 1.0 linear.
- 0.5 ≤ t ≤ L: `f + (1−f)·e^(−2.2·(t−0.5)/max(0.5, L−0.5))`, floor f = 0.40 premium
  tier, 0.35 else.
- t > L (post-EOL): legacy parts climb `f → min(2.8, f + (t−L)/8 × (2.8−f))`;
  non-legacy decay toward 0.12 over 4 years.
noise: nightly `noise *= 1 + U(−0.03, +0.03)`, clamp [0.85, 1.15].
eventMult: product over active events whose effect matches part category (and optional
tag filter); each effect ramps 1→peak over first 15% of duration, holds, ramps back
over last 25%.

### 5.3 Overnight pipeline (simulation.js) — runs once per calendar night, in order:
1. day += 1; hoursLeft = 8; supplyRunDoneToday=false.
2. Start/stop historical events whose window crosses today (news on start & end);
   maybe fire random events (~4% per template per night, era-gated, max 2 active
   random events).
3. Update all released parts' noise & record price history.
4. Deadline sweep: active jobs past deadline → failed (rep hit −, job removed,
   news/summary entry); offers older than 3 days silently expire.
5. Warranty callbacks: for completedRecent entries whose `callbackRolledDay == today`
   and roll fired → spawn callback job (auto-accepted, pay 0, hours ≈ 50% of original,
   rep −0.4 on arrival), news entry.
6. Refresh as-is market: each listing 25%/night chance to churn; keep 2-5 listings
   (era-appropriate machines built from era-valid catalog parts).
7. Generate offers: count = clamp(2 + tier.offerBonus + prestige + round(rating−3)
   + eventVolume adjustment, 2, 6+tier.offerBonus) with type mix era-gated (§5.4).
8. If 1st of month: charge rent+utilities (year-scaled), insurance, storage overage
   (`overageSlots × 0.5% of avg part value`, simple flat `feePerSlot = laborRate/10`);
   close out ledger month.
9. Custom-build unlock check (news event once when date ≥ unlock date).
10. Grace/bankruptcy check: cash<0 → set/keep graceDeadlineDay (day+14, warn daily);
    cash≥0 → clear; day > graceDeadlineDay → gameOver.
11. Prestige recompute: tier1 ≥15 jobs & rating≥3.0; tier2 ≥40 & ≥3.5; tier3 ≥100 &
    ≥4.0; tier4 ≥250 & ≥4.5 (never demotes). On promotion: news + press-coverage
    volume boost event.

### 5.4 Job generation & era gating (jobs.js)
Base weights (0 = unavailable): repair (always, heavy weight), upgrade (always),
software os_install (always) / virus (year ≥ 1988, weight ramps ×3 in 1995-2010),
cleaning (always; thermal_paste subtype ≥1997), peripheral printer (always) / crt
(≤2005, sets crt:true), data_recovery (always; required drTier: 1 pre-1995, 2
1995-2009, 3 2010+ — offer only shown if player owns ANY dr rig; required tier
noted; success roll §5.5), build (only if customBuildsUnlocked AND player owns
build-bench), enthusiast overclock (≥1997, prestige≥1), enthusiast aesthetic (≥2010,
prestige≥1), contract (prestige≥2, ≤1/week, units 5-15), rush (any repair/software/
upgrade with 8% chance: deadline = today, pay ×1.8).
Pay: `laborRate(year) × hoursRequired × difficultyMult(0.9..1.6) × typeMult`
(+ estimated part cost markup for repairs/upgrades where customer pays parts:
repairs/upgrades customer covers parts at 1.25× market — engine adds this to payout
at completion based on actual parts used). Build pay = budget (player profit = budget −
parts spent). Deadlines: 2-7 days by size; contracts 12-25.
Refurb sale price = `Σ current part prices × 0.85 × condition(0.9-1.1) + working-machine
premium (laborRate×4)`; ask price when buying ≈ 30-45% of part value.

### 5.5 Completion, ratings, callbacks
Speed multipliers — hours: quick ×0.7, standard ×1, meticulous ×1.5.
Callback base chance: quick 12%, standard 5%, meticulous 1.5%; × avg part reliability
factor (`(100/avgReliability)²` capped 2.5, only parts installed); × test-bench 0.6;
clamped [0.5%, 35%]. Roll once at completion; if fired, schedule uniform 3-30 days out.
Job score (0-5): start 5.0; late → job fails instead (score 0.5 recorded); quick −0.6;
meticulous +0.4; build: perf ≥ 115% of target +0.3, under 85% of budget +0.3;
data-recovery failure → score 1 (roll: 55% + 15×(ownedDrTier − requiredTier ≥0 ? tier
bonus) …simplify: 50% + 18%×drTierOwned − 10% if quick + 10% if meticulous, clamp
[15%, 97%]; failure = no pay, hours spent).
Rating = mean of last 25 scores (seed with three 3.0 entries at new game).
CRT jobs worked without crt-kit: 8% mishap per work session → injury: lose next 2 days
(auto-advance with news), $ medical cost = laborRate×20, insurance covers 70%.
Part-damage mishap: 3% per install (×0.2 with ESD): part lost from inventory, must
re-source; insurance covers 70% of its price.

### 5.6 Hours
diagnose: 1h (× diag-station 0.5). repairs 1-3h; upgrades 1h; builds 3h (+1 premium
tier); software 1-2h (virus 2h, ×0.75 with software-station); cleaning 0.5-1h; data
recovery 2-3h; peripheral 1-2h; refurb repair 2-4h; contracts: per-unit hours × units.
Working past workstation soft cap: hours×1.5 (see §2.5). Market purchases: first of
the day costs 0.5h (supply run) unless part is delivered with a job (installPart during
job counts as the same supply run rule). `workJob` spends whole/half hours; partial
progress persists across days.

## 6. UI requirements (ui.js / tabs.js / screens.js)

- **Screens:** (1) New Game — era cards (all six, blurbs, starting cash/rent, 1983
  shows "custom builds locked until 1989" note), shop-name input, Start button; shows
  "Continue (autosave)" if `Engine.hasAutosave()`. (2) Main game. (3) Game Over —
  stats from `getGameOverStats()`, "New Game" button.
- **Header (persistent):** shop name, full date label, cash (red when negative +
  grace countdown), hours left today (pip bar of 8), star rating (★ with halves),
  prestige label, shop tier, **End Day** button.
- **Tabs:** Offers, Workbench, Inventory, Parts Market, Shop, Ledger, News, Save/Load.
  Badge counts on Offers (new) & Workbench (jobs due today).
  - Offers: card list — customer, type chip, pay, deadline in days, difficulty
    (wrench icons), Accept / Decline.
  - Workbench: active jobs with progress bars, speed selector (Quick/Standard/
    Meticulous with tooltip), context buttons: Diagnose / part-picker for needs
    (from `getJobNeeds`) / build configurator (category selects from
    `getBuildCatalog`, live `validateBuild` panel listing problems in red, perf vs
    target, budget bar) / Work 1h / Work All / Sell (refurb) / Abandon. Also an
    "As-Is Market" section here (or in Market tab) for refurb purchases.
  - Inventory: table w/ qty, avg cost, current price, sell buttons, storage meter.
  - Parts Market: category filter + search, price, 1-day arrow, 30-day %, sparkline
    (inline SVG from `spark`), scarce/new badges, Buy 1 / Buy 5.
  - Shop: current tier, upgrade card, equipment grid w/ costs & owned state, insurance toggle.
  - Ledger: month table + lifetime stats + current-month preview.
  - News: dated feed, kind-colored.
  - Save/Load: export (textarea + download), import (paste + file), clear autosave,
    "Simulate 10 days" **hidden debug button** (`data-debug`, calls endDay×10) for testing.
- **Morning summary modal** after End Day (sections omitted when empty; Sunday note
  when skipped). Dismiss → Offers tab.
- **Era skin:** body class from year — `era-early` (≤1989: amber-on-dark mono accents),
  `era-90s` (1990-99: beige/teal), `era-00s` (2000-09: silver/blue), `era-modern`
  (2010+: flat light). Keep text high-contrast & readable in all skins; the skin is
  accent-level (header/buttons), not a full restyle.
- All interactions = buttons/selects. No drag & drop. Confirm dialogs for Abandon,
  Upgrade Shop, and importing over a running game.
- UI never computes game rules — it renders state + calls API. Central
  `UI.refresh()` re-renders header + active tab. Errors from API (`ok:false`) show as
  toast notifications.

## 7. Balance constants (engine `Engine.CONFIG`, tune here)

1983: cash $3000, garage rent $350/mo (rentBase), typical repair $40-90, diagnosis 1h,
repairs 1-3h. Break-even month 1, comfortable month 6. Builds 15-30% margin at budget;
refurb flips up to 50-80% but risky. Year scaling via laborRate ratio (§2.5) applied to
rent, equipment, upgrade costs. Keep all magic numbers in `Engine.CONFIG` (core.js).

## 8. Testing

- `tools/validate-data.js` (DATA agent): node script — loads data files, checks id
  uniqueness, schema fields, tag namespace prefixes, coverage table per era bucket,
  YEAR_BASELINES monotonicity; exits non-zero with readable errors. Prints coverage table.
- `tools/sim-test.js` (ENGINE agent): node script — loads data+engine, for EACH era:
  newGame, simulate 40 days with a greedy bot (accept affordable offers, diagnose,
  buy needed parts, work, end day; attempt one custom build when unlocked; one refurb
  flip; one equipment purchase), asserting: no exceptions, cash is finite, prices > 0,
  offers generated, at least one job completes, monthly billing fired, save
  export→import→export round-trips identically. Exits non-zero on failure with details.
- Both scripts must pass before integration sign-off. `node tools/validate-data.js &&
  node tools/sim-test.js`.
