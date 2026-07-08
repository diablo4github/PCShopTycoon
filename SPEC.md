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

---

# v2 Feature Addendum (playtest round 1)

Binding contract changes for the v2 workstreams. Where this section conflicts with
§1-§8, this section wins. Save `version` bumps to **2**; `importSave` must migrate v1
saves by filling new fields with defaults (never reject a valid v1 save).

## 9.1 Part schema additions (DATA)

Every part gains:
- `brand: "Seagate"` — REQUIRED on all categories (os brands: Microsoft/IBM/Digital
  Research/etc; generic parts use brands like "ValuTech", "Shenzhen OEM").
- `desc` — now REQUIRED, 1-2 sentences of period-accurate historical color written for
  the in-game Wiki ("The drive that made 40 MB affordable…"). ≥40 chars.

Catalog expansion: grow to **600-700 parts** by (a) adding brand variants of existing
silicon — same chip, different brand/price/reliability/style (e.g., Voodoo1 as Diamond
Monster 3D vs Orchid Righteous 3D; RAM/HDD/PSU across 3-4 brands per era) and (b)
filling thin spots. New minimum per era bucket: ≥5 parts AND ≥2 distinct brands per
major category (cpu/mobo/ram/storage/gpu/psu/case); ≥3 cooling/os/peripheral.
Validator enforces brand+desc presence and the ≥2-brands rule.

## 9.2 Customer alignment & tastes (DATA + ENGINE)

- `DATA.FLAVOR.jobBlurbs` entries become `{ text, customers: ["gamer","student"] | null }`
  (null = anyone). Provide enough per job type that every allowed customer type has ≥2
  fitting blurbs. Engine picks customer type FIRST (era-gated), then a blurb whose
  `customers` includes it (or null).
- Engine constant `CUSTOMER_JOB_AFFINITY`: which customer types can receive which job
  type/subtype (gaming builds/overclock/aesthetic → gamer/student/creator; contracts →
  smallbiz/office; CAD-workstation builds → smallbiz/office/creator; printer/crt →
  office/smallbiz/home; everything else broad). Job titles/blurbs must no longer
  mismatch the customer type.
- **Tastes**: ~35% of generated jobs get
  `taste: { brand, category|null, bonusPct (10-20), label: "Swears by Seagate drives" }`,
  brand drawn from catalog brands actually available that year in a category relevant
  to the job (repair: fault category; upgrade: upgraded category; build: cpu/gpu/case;
  refurb/callbacks/cleaning: none). If any part used/installed matches brand (+category
  when set): payout × (1+bonusPct/100) and job score +0.2. Never a penalty when unmet.
  UI shows the taste chip on offers & workbench cards, and marks matching options in
  pickers/build catalog (`options[].tasteMatch: true`).

## 9.3 Upgrade minimum specs (ENGINE + UI)

Upgrade jobs must populate `needs[].minPerf` (e.g., `{ramMB: 8}`, `{gpu: 300}`,
`{storageGB: 0.5}`) chosen sensibly vs the year baseline, and the need `label` states
it ("RAM upgrade — at least 8 MB"). `installPart` rejects parts below minPerf with a
readable error; `getJobNeeds` options gain `meets: bool` (UI greys non-qualifying).

## 9.4 Overtime (ENGINE + UI)

`Engine.CONFIG.overtimeCap = 3`. Any hour-consuming action may proceed while
`hoursLeft > -cap` even if its cost exceeds what remains (diagnose with 0.2h left is
fine); hoursLeft may go negative, floored at -cap — an action whose cost would break
the floor is refused ("Too exhausted — call it a day"). Next morning
`hoursLeft = 8 + carried negative` (min 5). Morning summary notes overtime worked. UI
pip bar renders negative hours as red overtime pips and the header shows "OT" state.

## 9.5 Refurb & as-is changes (ENGINE + UI)

- Slower market: churn ≈8%/night per listing; ≤1 new arrival/night (~1 per 3 nights),
  2-week typical shelf life, cap 4 listings; each listing shows age. Machine gains
  `specSummary: "486DX2-66 · 8 MB RAM · 340 MB HDD"` (engine-computed).
- `Engine.getMachineParts(jobId)` → `[ { partId, name, category, status:
  "ok"|"faulty"|"unknown", value } ]` — status "unknown" for the fault slot until
  diagnosed. Workbench refurb cards list their components.
- **Strip for parts**: `Engine.stripRefurb(jobId)` — costs 1.5h (overtime rules apply),
  rolls each non-faulty part into inventory at 90% survival (ESD setup → 97%); faulty
  part is lost; job removed, no rep effect. UI: refurb cards replace the "Abandon"
  button with "Strip for Parts" (+ confirm listing expected parts). Non-refurb jobs
  keep Abandon.

## 9.6 Balance: era-1 jobs vs flips (ENGINE)

Playtest: flipping dominates era 1 because job pay is too low. Retune so honest labor
is the era-1 backbone: repairs bill a diagnostic/bench fee (≈0.5 × laborRate) on top of
labor+parts markup, raise repair/software TYPE_MULT so a typical 1983 repair lands
$60-110; as-is ask prices rise to 40-55% of parts value and flip sale premium drops
(≈laborRate×3). Add a sim-test metric: average net $/labor-hour for jobs vs flips in
the 1983 run; flips should land 1.2-1.8× jobs' rate (riskier + slower market), not 3×+.
Keep the 40-day 1983 bot inside a sane band (final cash $2k-$10k).

## 9.7 Part Wiki (ENGINE + UI + DATA descs)

- `Engine.getPartInfo(partId)` → `{ partId, name, brand, category, tier, tags,
  tagLabels: ["Socket 7","DDR4"...], perf, reliability, powerDraw|watts, introYear,
  eolYear, desc, status: "new"|"current"|"fading"|"legacy"|"scarce", price, change30,
  spark, inStockQty }` — only for parts already released (era-appropriate knowledge).
- `Engine.getWiki({category?, search?})` → array of the above for all released parts,
  sorted category → introYear.
- New **Wiki** tab (tab id `wiki`, between Market and Shop): category chips + search,
  dense table (name, brand, year span, key stats, reliability, status chip, current
  price) with expandable detail rows showing full stats, readable platform tags,
  sparkline, and the historical `desc`. This doubles as the education layer — a 1985
  player browses period hardware with period commentary.
- Market/build/needs pickers reuse `getPartInfo` for an info popover (ⓘ button) per part.

## 9.8 Audio (UI only — new file `js/ui/audio.js`, loads after ui.js)

All WebAudio-synthesized, zero external assets (CSP/file:// safe). `UI.audio`:
- SFX: click, accept, decline, complete (cash register), error, endDay chime, callback
  sting, mishap, purchase. Short (<400ms), subtle, default volume 0.5.
- Era music: generative background loops per era skin (era-early: slow square-wave
  arpeggio; 90s: FM-ish pad; 00s: soft saw; modern: airy sine pad + sparse hats),
  default volume 0.15, default ON but only starts after first user gesture (browser
  autoplay policy — init AudioContext on first pointerdown).
- Header gets music 🎵 and SFX 🔊 mute toggles; System tab gets volume sliders.
  Settings persist in `localStorage["cst-audio"]` (NOT in the save).

## 9.9 UI scaling & action feedback (UI only)

- Auto scale: `--ui-zoom` = clamp(viewportWidth/1440, 0.8, 1.4) applied via body zoom
  (Chromium/FF126+) with transform-scale fallback; recompute on resize. User override
  Auto/80/100/115/130% persisted in `localStorage["cst-zoom"]`, control in System tab.
- Action feedback: UI.api captures cash & hoursLeft before/after every mutation and
  spawns floating deltas ("-1.5h" amber near the hours pips, "+$85"/-"$120" green/red
  near cash), pip bar pulse on spend, progress bars animate via CSS transition, End Day
  button brief disabled shimmer while the summary opens. Keep them fast (<700ms) and
  non-blocking.

## 9.10 Tabs & System

Tab order becomes: Offers, Workbench, Inventory, Parts Market, **Wiki**, Shop, Ledger,
News, **System** (formerly Save/Load; keeps tab id `save`). System tab = save/export/
import cards + Settings card (UI scale, music/SFX volumes) + debug sim button.

## 9.11 Testing additions

- validate-data: brand/desc required, ≥2 brands per major category per bucket, blurb
  `customers` ids all exist.
- sim-test: overtime borrow works & floors at cap; stripRefurb yields inventory parts;
  a taste-matched job pays the bonus; upgrade installPart rejects below-minPerf part
  with readable error; jobs-vs-flips $/hour metric printed for 1983 and within 1.2-1.8×;
  v1 save fixture migrates through importSave.
- E2E (overseer): wiki tab renders; strip button on refurb; overtime pips; zoom applies;
  no console errors.

---

# v0.3 Addendum (playtest round 2)

Binding for the v0.3 workstreams; wins over §1-§9 on conflict. Save `version` → **3**
with migration from v1/v2 (lazy-synthesis allowed: steps/machines may be generated on
first access for migrated jobs; a migrated save must simply be fully playable).
`Engine.VERSION = "0.3"`; System tab shows it.

## 10.1 Step-based tasks (ALL job types) — DATA + ENGINE + UI

Every job gets a **step checklist** replacing the opaque hours blob (education +
transparency). Job gains:
```js
steps: [ { id, label: "Remove CPU cooler", hours: 0.25, done: false, progress: 0-1 } ],
stepIndex: 0        // current step
```
`hoursRequired` = Σ step hours (standard speed). `workJob` consumes steps in order,
carrying partial progress; the overall progress bar stays (UI keeps it at the top of
the card, derived from hours done / required).

**`DATA.TASK_STEPS`** (new, in `js/data/flavor.js` or its own section of eras.js —
DATA agent's choice, exported as `DATA.TASK_STEPS`): array of templates:
```js
{ type: "repair", partCategory: "cpu",        // most-specific match wins; nulls = wildcard
  subtype: null, minYear: null, maxYear: null,
  steps: [
    { label: "Open case & ground yourself",  hours: 0.25 },
    { label: "Remove CPU cooler",            hours: 0.25, cond: "cooler", minYear: 1990 },
    { label: "Swap processor",               hours: 0.5 },
    { label: "Set clock/jumper settings",    hours: 0.25, maxYear: 1997 },
    { label: "Reassemble & POST test",       hours: 0.5 },
    { label: "Update BIOS & drivers",        hours: 0.5,  minYear: 1995 },
  ] }
```
Step `cond` values the engine resolves: `"cooler"` (machine/build has cooling or year
≥1995), `"crt-kit"` (safety discharge — only if player owns kit; without it the step
runs anyway with the §5.5 injury risk). Engine filters steps by year/cond, then applies
part-tier nudges (premium part +0.25h on its install step) and speed/equipment/staff
multipliers. Coverage required: every (type × relevant partCategory/subtype) across all
eras resolves to a template with ≥3 steps — era-flavored where history demands it (IRQ
jumpers pre-1998, low-level MFM format pre-1992, driver updates post-1995, SSD cloning
post-2010, benchmarking step on enthusiast/build jobs post-1997). Validator: template
table resolves for every combination the engine can generate (export the combination
list as a fixture: `DATA.TASK_STEP_KEYS` not needed — validator re-implements the
matcher over known types/categories/subtypes × sample years 1984/1993/1999/2007/2015/2023,
asserting ≥3 steps and 0.5-6.5h totals).

## 10.2 Deterministic time & difficulty (ENGINE)

Job time = step template sums; **no random hour rolls**. Small deterministic modifiers
only (part tier, era condition). `difficulty` (1-5) is now DERIVED: base by type +
part-category weight (mobo/cpu heavier), +1 if premium parts involved, +1 if legacy-era
machine (>8y old parts), clamp 1-5. Callback risk matrix (replaces §5.5 speeds):
- quick:      4%  + 3.5% × difficulty
- standard:   2%  + 1.0% × difficulty
- meticulous: 0.5% + 0.3% × difficulty
× reliability factor (as before) × test-bench 0.6; ESD setup multiplies the
difficulty *term* by 0.6 (quick work on easy jobs with good equipment ≈ safe). Clamp
[0.5%, 40%]. Offer PAY rounds to whole dollars (no more $17.64 offers).

## 10.3 Assign ≠ install (ENGINE + UI)

`installPart` semantics split:
- `Engine.assignPart(jobId, needIndex, partId)` — from inventory ("stock") or buys at
  market ("ordered", cash out now, supply-run rule). Assignment reserves the part
  (removed from sellable inventory); nothing is "installed" yet.
- `Engine.unassignPart(jobId, needIndex, partId?)` — returns part to inventory (ordered
  parts too — you own them), allowed until the step that installs it is completed.
- The install happens when the corresponding step completes (engine blocks working an
  install step whose need is unassigned: `{ok:false, error:"Assign a replacement part
  first"}`). Keep `Engine.installPart` as a deprecated alias for assignPart (one release).
- `getJobNeeds` options: `source` stays, UI labels become **"Assign from Stock"** /
  **"Order & Assign"**; assigned entries show an **Unassign** button.
- Build jobs: `commitBuild` = assignment (already effectively is); parts install across
  the build steps.

## 10.4 Customer machines & overspend (ENGINE + UI)

- Repair, upgrade, and peripheral jobs now carry `machine` (customer's PC: era-plausible
  part list generated like refurb machines; peripheral jobs carry the peripheral item
  instead — see 10.5). `getMachineParts(jobId)` works for them.
- **Diagnosis knowledge model (fixes v0.2 bug):** before diagnosis ALL component
  statuses are `"unknown"` ("?"), including refurbs at purchase. After diagnosis: fault
  part `"faulty"`, rest `"ok"`. (Jobs with no diagnosis needed — upgrades — show all ok.)
- **Overspend:** on completion, for each replaced/installed part: if its price >
  max(1.75 × original part's current value, original + laborRate) → score −0.5 and a
  grumble in `result.notes` ("Did it really need a $900 card?"). WAIVED when the job has
  a taste and the part matches it (fanboys), or job type is enthusiast. Customer still
  pays the 1.25× markup. UI: options in the needs picker show the original part's value
  ("replaces: Tandon TM-100 · ~$180") and a ⚠ chip on options that would trigger it.

## 10.5 Fault-first generation (DATA + ENGINE) — fixes mismatched copy

Generation order becomes: pick customer type → pick concrete SUBJECT — for repairs:
fault (category + template) on the generated machine; for peripherals: the peripheral
item `{name, kind}`, kind ∈ printer|crt|lcd|modem|input|scanner|other, then its fault —
→ then derive title, chip label, and complaint blurb from THAT subject. Title, chip,
and blurb must always agree.

DATA restructure:
- `DATA.FLAVOR.faults[cat][i]` gains `complaints: ["My machine crashes whenever…", …]`
  (≥2 each, customer-voice, symptom-accurate, no part name spoilers — symptoms, not
  diagnoses).
- `DATA.FLAVOR.peripheralItems[i]` gains `kind` and `complaints: [≥2]` +
  `faultDescs: [≥2]` (what's actually wrong, revealed on diagnosis).
- Generic `jobBlurbs.peripheral`/`jobBlurbs.repair` remain as last-resort fallbacks only.
- Engine: peripheral job `subtype` = item kind (crt only for kind "crt"); chip renders
  the kind; pay/difficulty follow the item (a CRT rebuild > a mouse fix).

## 10.6 Sunday (ENGINE)

- No offers generated for Sunday (the closed-day overnight pass skips offer generation;
  Monday morning arrives with ONE normal batch, not two).
- Deadlines never land on Sunday: any computed `deadlineDay` falling on a Sunday shifts
  to Monday. Prices/events still tick both nights. Morning summary keeps the rest note.

## 10.7 Employees (ENGINE + UI + DATA flavor)

- `DATA.STAFF_ROLES` (DATA, in eras.js): 
  Technician (repair/upgrade/refurb/peripheral/cleaning), Software Specialist
  (software/data_recovery), Builder (build/contract/enthusiast), Apprentice (all
  types at half effect). Each: { id, name, desc, jobTypes, wageFactor (Apprentice
  cheap), minYear? }.
- State: `staff: [{id, name, role, skill (0.15-0.35), hiredDay, wageMonthly}]`,
  `staffMarket: [candidates]` (2-4, refreshes weekly, skill & wage rolled from role +
  year laborRate; wageMonthly ≈ laborRate × 110 × skill × wageFactor, year-rescaled on
  the 1st).
- Slots by shop tier: 0 / 1 / 3 / 6 (garage = solo, per playtest).
- Effect: for an action on job type T, time multiplier = 1 / (1 + S) where S = Σ over
  applicable staff (sorted by contribution desc) of skill × 0.75^(k-1); Apprentice
  contributes skill×0.5 to everything. Applied inside the hour-spending path so ALL
  workflows benefit; diagnosis counts as the job's type.
- Wages charged with rent on the 1st (ledger `fixedCosts`), listed in morning summary.
  Firing: `fireStaff(id)` with 2 weeks severance (wageMonthly/2), small rep ding.
- API: `getStaffView()` → { staff:[…+ effectNote], candidates:[…], slots, slotsUsed,
  totalMonthlyWages, nextRefreshDay }; `hireStaff(candidateId)`, `fireStaff(staffId)`.
- UI: Shop tab gains a **Staff** section (roster w/ role chips + wages + fire w/
  confirm; candidates w/ hire buttons; slots meter; "no staff in a garage" note at tier
  0). Sim-test: bot hires a tech when cash>threshold in a 1996 run; asserts wages billed,
  time multiplier < 1 applied, severance on fire.

## 10.8 Testing additions (both suites + E2E)

validate-data: TASK_STEPS coverage matrix (10.1), fault complaints ≥2 per fault,
peripheralItems kind+complaints+faultDescs, STAFF_ROLES sanity.
sim-test: steps drive completion (a job finishes exactly when its steps sum is worked);
assign→unassign→reassign round-trip preserves inventory; overspend penalty fires &
waives correctly; no offer generated on Sundays and no deadline on a Sunday across 60
days; staff scenario (10.7); integer offer pay; v2 fixture migrates to v3 and plays.
E2E (overseer): step checklist renders and advances; Assign from Stock / Order & Assign
/ Unassign buttons; machine list all-"?" before diagnosis (the v0.2 bug); staff hire in
a non-garage tier; Sunday skip note without double offers.

---

# v0.4a Addendum (playtest round 3, part A — research-independent items)

Binding; wins on conflict. Save `version` → **4** (migrate v1-v3; staff gain level/xp,
steps gain kind). `Engine.VERSION = "0.4"`. (Part B — motherboard slot counts,
multi-GPU/multi-RAM builds, Apple/mobile devices, graphical build UI — follows after
the parts-research doc lands; do NOT start schema changes for it yet.)

## 11.1 Build-offer feasibility (ENGINE) — every build request must be buildable
At generation, assemble a hidden witness build (greedy: cheapest purchasable-today
parts satisfying compat + minPerf + minStyle + PSU rule). If witness cost >
budget×0.92, raise budget to witness×1.25 (rounded to $10) — or if no witness exists
at all, skip the offer. Same guarantee for enthusiast-aesthetic and contract_build.
Sim: assert ≥60 generated builds across eras are all witness-satisfiable within budget.

## 11.2 Offer ramp-down (ENGINE)
Slower scaling: offers/night = clamp(2 + tierBonus + floor(prestige/2) +
clamp(round((rating−3)/1.5), −1, 1) + eventAdj, 1, cap) with cap by tier = 4/6/8/11.
Additionally, if pending offers ≥ 10, halve new arrivals (walk-ins see a busy shop).
Sim: 1983 40-day run mean ≤ 3.6 offers/day; a 4.8★ prestige-2 garage still ≤ 4.

## 11.3 Diagnosis merged into the step checklist (ENGINE + UI) — no separate list
Jobs with `needsDiagnosis` start their checklist with a diagnose phase: "Intake &
symptom interview" (0.25h) + "Bench diagnosis" (the current diagnosis cost incl.
diag-station). Completing the bench-diagnosis step performs the old diagnoseJob
effects (fault reveal, needs added) and APPENDS the repair steps — dropping the
appended template's leading open/ground/intake step if the label matches
/open|ground|intake/i (no duplicate case-opening). `Engine.diagnoseJob` becomes an
alias for "work the diagnose step(s)". UI: remove the separate Diagnose button; the
checklist is the single task list (pre-diagnosis it shows the diagnose phase +
"…further steps after diagnosis" placeholder row).

## 11.4 OS requests on software jobs (ENGINE + UI)
os_install/reinstall jobs specify: 60% an OS FAMILY ("any Windows 9x"), 30% an exact
OS product, 10% "your recommendation" (free pick). Families derived engine-side from
OS part names/brands: DOS, WIN3X, WIN9X, WINNT (NT/2000/XP), WINVISTA7 (Vista/7),
WINMOD (8/10/11), OS2, MACOS, LINUX, OTHER. The need's options are restricted
accordingly (exact → that part; family → members; recommendation → any), label states
the request ("Install Windows 98 — any 9x acceptable"). Generator verifies ≥1
purchasable member exists. Enforcement mirrors minPerf (readable rejection).

## 11.5 Employee XP & levels (ENGINE + UI)
Staff earn XP = hours of actions they boosted (applicable job types; apprentices
everything). Fixed level thresholds (hours): L2 40, L3 120, L4 280, L5 520.
FIXED per-role skill & wage tables replace rolled values (smooth balancing —
e.g. Technician skill .16/.20/.25/.30/.36 by level; wageMonthly = laborRate-scaled
fixed table; Apprentice half skill, cheapest). Existing staff migrate to the nearest
level. Level-up → news + morning summary line + title ("Senior Technician").
Candidates only ever spawn L1-L2 (elite talent must be grown — retention incentive);
firing L4+ staff doubles the rep ding. getStaffView adds level, xp, nextLevelAt,
title. UI: level pips + XP progress bar on roster cards.

## 11.6 Waiting (time-gated) steps (ENGINE + UI)
Steps get `kind: "labor" | "wait"`. Engine classifies at assembly: label matching
/burn.?in|scan|low.?level format|imag(e|ing)|copy|clone|download|updates|rebuild/i →
wait (TASK_STEPS may also set `wait: true` explicitly later). Wait steps: 0.1h labor
to start ("set it running"), then RUN IN PARALLEL — they progress 1:1 with any hours
the player spends on ANYTHING else, complete free overnight at End Day, and block
only their own job. New `Engine.waitHour()` burns 1h (overtime rules apply) purely to
advance running wait steps — for when there's nothing else to do. UI: ⏲ badge +
"runs while you work on other jobs" on wait steps; a "Wait 1h ⏲" button next to End
Day whenever a wait step is running; job cards show "waiting on burn-in (2h left)".

## 11.7 Tests
sim: witness feasibility; offer-ramp caps; diagnose-step merge (alias works, no
duplicate open-case, fault revealed exactly at step completion); OS request
satisfiability + readable rejection; staff XP thresholds/fixed wages/candidate level
cap; wait-step parallelism + overnight completion + waitHour; v3 fixture → v4
migration. E2E (overseer): no Diagnose button + diagnose steps in checklist; ⏲ wait
UI; staff level pips; OS-request label on a software job.

---

# v0.4b Addendum (playtest round 3, part B — research-driven hardware depth)

Binding; wins on conflict. Implements docs/PARTS-RESEARCH-v04.md (the "research doc")
— transcribe its tables faithfully; where this addendum and the research doc disagree,
this addendum wins. Save `version` → **5** (migrate v1-v4: wrap single build parts
into slot arrays; new fields default). `Engine.VERSION = "0.4b"` (keep it
parseFloat-compatible with the UI's ≥0.4 gate).

## 12.1 Motherboard slots (DATA + ENGINE)

- Every motherboard gains `slots: { ram, gpu, storage }` per research §1.2 (all 64
  boards — transcribe the table) and §7.1 conventions (gpu = ISA/VLB/PCI count
  pre-AGP, 1 on AGP boards, physical x16 count on PCIe; storage = ports, IDE
  channel = 2 devices). Add the ~15 new boards of research §1.3 (SLI/CrossFire,
  HEDT, server) with their suggested tags/prices.
- Engine: missing `slots` defaults to `{ram:99, gpu:99, storage:99}` (old saves never
  regress). `compat.validatePartList` enforces capacity: count of ram/gpu/storage
  parts ≤ slots.* with readable problems ("Board has 2 DIMM slots — build uses 4").

## 12.2 Multi-part builds & multi-GPU (ENGINE + DATA + UI)

- Build selections become **slot-indexed**: `build.parts` = `{ cpu: [id], ram:
  [id,id,null,null], gpu: [id], storage: [id,null], psu:[id], case:[id], cooling:[id],
  os:[id] }`. API: `setBuildPart(jobId, category, partId|null, slotIndex=0)`;
  `getBuildCatalog` adds per-category `slotCount` (1 for cpu/psu/case/cooling/os;
  from the selected motherboard's `slots` otherwise; 0 slots rendered until a board
  is chosen) and `selected: [partId|null × slotCount]`. Old callers (slotIndex
  omitted) keep working.
- Perf aggregation: ramMB sums across sticks; storage sums capacity / takes max
  speed; **multi-GPU**: 2+ gpus sharing a `sliTag` = first card + 65% of the second
  (Voodoo2 pairs: +90%); mismatched second gpu contributes nothing and yields a
  validation problem. PSU check already sums draw.
- `sliTag` on eligible GPUs (DATA, research §2/§7.2 — Voodoo2, SLI-era GeForces,
  CrossFire-era Radeons; symmetric-CrossFire simplification, documented).
  **Voodoo2 rule**: Voodoo2 cards get `addonOnly: true` — a build containing one
  also needs a 2D-capable gpu or integrated video ("A Voodoo2 is a 3D add-on — it
  needs a 2D card beside it").
- Job generation: gamer **SLI/CrossFire build requests** (Voodoo2 window 1998-2000,
  SLI/CF 2005-2016): require 2 matched GPUs (minPerf implies the pair); office/server
  **RAM-heavy contract builds** (2003+): require total ramMB achievable only with
  3+ sticks on a ≥4-slot board. `witnessBuild` must satisfy both (multi-part aware)
  — feasibility guarantee §11.1 still holds.

## 12.3 Catalog depth (DATA)

New category **`expansion`** (sound cards, NICs, internal modems, SCSI/RAID/USB/
FireWire cards — research §5.1): platformTags = BUS-* (compat = bus tag overlap, no
slot-count cap; document). Wiki/market/inventory treat it like any category; builds
may optionally include expansion parts (no requirement; small style/perf niceties may
be ignored this round). Transcribe research §5.2 iconic gaps (Voodoo2 ×2 brands!,
Zip/Jaz/LS-120, CD/DVD/Blu-ray as storage with STOR tags), §5.3 2016-25 fills, and
§6's OS gap fills (early Linux, OS/2 Warp 4; Mac OS versions only as APPLE device
flavor, not OS parts). Update coverage minimums: expansion ≥2 per bucket 1985+.

## 12.4 Apple & mobile devices (DATA + ENGINE + UI)

- DATA per research §7.3: `DATA.APPLE_MACHINES` (22 machines, §3.2 table: family
  APPLE-68K/PPC/INTEL/SILICON, intro/eol, ramUpgradable/hddUpgradable flags,
  basePriceRange = repair-pay range, faultCategories) and `DATA.MOBILE_DEVICES`
  (smartphones 2007+, tablets 2010+, tiered) + `DATA.MOBILE_FAULTS` (screen, battery,
  charge-port, water-damage, camera, speaker-mic, button — each with desc, complaints
  ≥2, faultDescs, laborHours, partsCostFactor).
- ENGINE: new job type **`device_repair`** — jobs pick a device from these tables
  (Apple era-gated 1985+; mobile 2009+ ramping through the 2010s to become a major
  late-game volume source; Apple post-2012 machines get +1 difficulty and higher
  parts cost per research §3.1). The branch **skips compat entirely**: no catalog
  parts consumed; parts expense is charged at completion as a cost line
  (partsCostFactor × device-tier value), pay from basePriceRange/fault labor ×
  laborRate scaling. Faults/complaints/titles follow the §10.5 subject-first rule.
  Steps come from new TASK_STEPS templates (DATA): type `device_repair`, subtype
  `apple`|`smartphone`|`tablet`, era-flavored (SIMM upgrades on a Mac Plus; pentalobe
  screws, heat-gun adhesive, battery calibration, water-damage ultrasonic bath).
  Upgrades limited by the device's flags (no CPU upgrades ever; RAM/HDD only where
  flagged — pre-2012 mostly yes, after mostly no).
- Technician staff role covers device_repair; software specialist covers none of it
  (data recovery on phones already exists separately).
- Wiki: `getWiki` gains a `devices` section (or `Engine.getDeviceWiki()`) — read-only
  render of Apple machines + mobile devices with era availability and the research
  doc's repairability story as desc text (DATA writes descs). UI renders it as a
  "Devices" group in the Wiki tab.

## 12.5 Graphical build UI (UI)

Replace the per-category select list for build/contract_build/aesthetic jobs with a
**motherboard schematic**: choose the board first (dropdown as today), then render a
stylized board (pure CSS/inline-SVG, era-tinted): CPU socket, `slots.ram` DIMM slots,
`slots.gpu` expansion slots, `slots.storage` drive-bay strip, plus surrounding bays
for PSU/case/cooling/OS. Each slot is a button: click → filtered part-picker popover
(reuse getBuildCatalog options for that category; show price/perf/taste ♥/ⓘ). Filled
slots show a compact part chip. States: **red** outline + tooltip = incompatible
(from validateBuild problems mapped to the slot), **yellow** = compatible but below
the job's minPerf contribution (options[].meets analog), green/neutral = fine. The
live problems panel, perf-vs-target, and budget bar stay. Keyboard accessible
(buttons, not hover-only). Old select-list remains the fallback when `slotCount`
data is absent (feature-detect).

## 12.6 Tests

validate-data: slots present on ALL motherboards with sane ranges (ram 1-16, gpu 1-4,
storage 1-12); sliTag GPUs exist in the correct year windows incl. ≥2 same-tag
Voodoo2s; expansion parts have BUS-* tags; APPLE_MACHINES/MOBILE_DEVICES/
MOBILE_FAULTS schema + complaints; device_repair TASK_STEPS coverage (subtypes ×
sample years 1986/1996/2010/2015/2023 where era-valid); per-year buildability still
green WITH capacity constraints.
sim-test: SLI build generated & completed in a 2005-08 window (witness multi-GPU);
RAM-heavy contract completed with 3+ sticks; capacity/sliTag/Voodoo2 problem strings
assert; device_repair jobs complete for apple (1990s) and smartphone (2013+ era run);
v4 fixture → v5 migration (single-part builds wrapped, playable).
E2E (overseer): schematic renders slot counts from the chosen board; a red state
appears for a wrong-socket CPU; SLI pair selectable on a dual-x16 board; device
repair card renders; Wiki shows a Devices group.

---

# v0.5 Addendum — The Education Update (first externally-tested build)

Binding; wins on conflict. Save `version` → **6** (migrate v1-v5: new fields default;
never reject an older valid save). `Engine.VERSION = "0.5"` (parseFloat → 0.5, keeps
the UI's ≥0.4 gates satisfied). **Quality bar is higher this round** — this is the
first build shipped to outside testers. Every workstream owns hardening in its layer:
no console errors, no dead-ends, graceful empty/error states everywhere, and readable
first-run onboarding. The overseer runs a dedicated QA pass on top.

Fresh agents: read §0 (conventions/prologue/load order), §3 (state), §4 (API style),
and the sections named below. Do NOT reorder existing script tags except to ADD the
two new files named in §13.7. Keep all money/round/RNG/determinism rules from §0/§5.

## 13.1 Tech Chronicle (DATA + ENGINE + UI)
A dated almanac of real computing history surfaced as **non-market news** (distinct
from §2.7 market events, which move prices — Chronicle entries never touch the economy).

- **DATA `DATA.CHRONICLE`** (js/data/events.js): 70-110 entries, chronological,
  `{ id, date: "1984-01-24", headline, body (2-3 sentences on why it mattered — factual,
  period-accurate), tag: "hardware"|"software"|"gaming"|"internet"|"business"|"culture" }`.
  Span 1983→2025, ≥2 per year on average, hitting the canon: Mac 1984, Windows 1.0/3.0,
  386, Linux 1991, Doom 1993, Win95, Pentium, Quake, iMac, Google, Napster, Win XP,
  iPod, Wikipedia, Half-Life 2/WoW/Steam, YouTube, Core 2, iPhone 2007, Bitcoin,
  Minecraft, SSD tipping point, Oculus, Ryzen, RTX/ray-tracing, Apple M1, ChatGPT, etc.
  Dates must be real (month precision; use day 1 if unsure). Validator checks schema,
  chronological sanity, ≥2/yr average, tags in enum.
- **ENGINE**: overnight, fire Chronicle entries whose date == today as news
  `kind:"chronicle"` (headline+body). They accrue in the normal news log AND are
  queryable historically: `Engine.getChronicle()` → all entries with date ≤ today,
  newest first, `{id,date,dateLabel,headline,body,tag}`. Zero price/market effect.
  Sim: assert chronicle entries fire across a multi-year run and never appear before
  their date.
- **UI**: Chronicle news items get a distinct non-alarming style (📅). A **Chronicle**
  group in the Wiki tab (chip alongside parts/devices): a vertical timeline of all
  entries up to the current date, tag-filterable, searchable.

## 13.2 Milestone Wiki articles (DATA + ENGINE + UI)
Long-form educational articles that unlock as the calendar crosses each transition —
the retrospective a player earns by living through it.

- **DATA `DATA.ARTICLES`** (js/data/flavor.js or events.js): 16-24 articles
  `{ id, title, category: "buses"|"storage"|"cpu"|"gpu"|"memory"|"os"|"form-factor"|
  "culture"|"business", unlockYear (or unlockDate), summary (1 sentence), body (Markdown-
  lite: paragraphs separated by \n\n, **bold**, and "- " bullet lines ONLY — UI renders a
  safe subset), related: [tag or partId ...] (optional) }`. Topics: the expansion-bus
  wars (ISA→VLB→PCI→AGP→PCIe), FAT→NTFS→exFAT, the megahertz myth & the Pentium→Core
  shift, 3D acceleration Voodoo→RTX, RAM generations DIP→DDR5, sockets & slots, the rise
  & fall of multi-GPU, Windows visual history, the beige→RGB aesthetic turn, the SSD
  revolution, the mobile/post-PC squeeze, the shortage era & crypto. `unlockYear` = when
  the story is tellable (≈ end of the transition). Validator: schema, unlockYear in
  1983-2025, body ≥ 400 chars, categories in enum.
- **ENGINE**: `Engine.getArticles()` → unlocked (unlockYear ≤ current year), `{id,title,
  category,summary,unlockLabel}`; `Engine.getArticle(id)` → full incl. `body`, or
  `{ok:false}` if still locked. On first crossing of an article's unlock, fire a news
  note ("New Wiki article: …", kind "chronicle"). Sim: articles unlock over time,
  locked ones are withheld.
- **UI**: an **Articles** group in the Wiki tab — list by category with summaries;
  click → readable long-form panel/modal rendering the safe Markdown subset (escape all
  content first, then apply bold/bullets/paragraphs). Newly-unlocked badge.

## 13.3 Period software in job copy (DATA + ENGINE)
Customers name real era software, deepening flavor and education at zero UI cost.

- **DATA `DATA.PERIOD_SOFTWARE`** (js/data/flavor.js): `[{ name, minYear, maxYear,
  kind: "game"|"office"|"creative"|"web"|"os"|"utility", customers: [types] | null }]`,
  40+ titles across eras (Lotus 1-2-3, WordPerfect, dBASE, Doom, Myst, Win 3.1,
  Photoshop, Netscape, Quake, Office 97, Napster, WoW, Crysis, Premiere, Chrome, Fortnite,
  OBS, Zoom, Blender, Stable Diffusion…). Also add tokened complaint/blurb variants using
  `{SW}` / `{GAME}` / `{OFFICE}` / `{CREATIVE}` placeholders in `faults[].complaints`
  and `jobBlurbs` (keep untokened variants too).
- **ENGINE**: a `fillCopyTokens(str, {year, customerType})` pass runs on every generated
  title/blurb/complaint: replace each token with an era-valid, customer-appropriate
  title (seeded RNG; `{SW}` = any kind, others filter by kind). No match → drop the token
  cleanly (never leave a literal `{...}` or double space). Deterministic. Sim: no
  unresolved `{` survives in any generated copy across a 60-day run in every era.

## 13.4 Certifications (DATA + ENGINE + UI)
An era-authentic owner-progression track: study to unlock/boost work.

- **DATA `DATA.CERTIFICATIONS`** (js/data/eras.js): `[{ id, name, abbr, minYear,
  costBase (1983-scale, engine year-scales), studyHours, desc (what it taught & why it
  mattered), prereq?: certId, effects }]`. ≥8 real certs gated by era: CompTIA A+ (1993),
  Network+ (1999), Novell CNE (1990), Microsoft MCSE (1994), MCSA, Cisco CCNA (1998),
  Apple Certified Mac Tech (2005), Security+ (2002), a data-recovery cert, a modern
  cloud/CE cert. `effects` vocabulary (engine consumes exactly these):
  `{ jobTimeMult: {type|"all": 0.85}, payMult: {type|category: 1.1}, callbackMult: 0.9,
  prestigeBonus: 1, reliabilityBonus: 3, unlocks: ["jobtype"...] }`.
- **ENGINE state**: `training: { certsEarned: [ids], studying: { certId, hoursDone } |
  null }`. API: `getCertifications()` → `{ earned:[{id,name,abbr,effectsNote}],
  available:[{id,name,abbr,cost,studyHours,desc,canStart,reason}], studying:{id,name,
  hoursDone,hoursTotal,pct}|null }`. `startCertification(id)` → `{ok}` (validates era/
  prereq/affordability; charges cost; sets studying). `studyCert(hours?)` → `{ok,
  hoursSpent, completed}` — spends work hours (overtime rules apply, staff do NOT speed
  studying — it's the owner's time), advances the current cert; on completion apply
  effects, add to certsEarned, clear studying, fire news + summary line. Effects fold
  into the existing multiplier paths (job time, pay, callbacks, prestige, unlock gates)
  additively/multiplicatively alongside equipment & staff, sensibly capped. Save v6
  migrates `training` in. Sim: study a cert to completion, assert its effect applies
  (e.g. measured job time drops or an unlocked type appears), cost charged once.
- **UI**: a **Training & Certifications** section in the Shop tab: earned certs (chips +
  effect notes), the current study progress bar with a **Study (spend hours)** button
  wired through UI.act (hour delta floats; disabled at overtime floor), and available
  certs as cards (cost, study hours, what it unlocks, Start button with gating reasons).

## 13.5 Guided first-run tutorial (UI, engine-read-only)
The critical new-player on-ramp. Pure UI reading existing state; NO engine writes.

- New Game screen: a **tutorial toggle** (default ON when `localStorage["cst-tutorial"]`
  is unset — i.e. first-ever play; OFF once completed/skipped). A short one-line "New to
  the shop? Keep the guided tour on." note.
- On starting a game with the tour ON: a coach-mark/overlay sequence (own overlay layer,
  not the modal root; dimmed spotlight on the referenced element via computed rect +
  a callout bubble with title, 1-2 sentences, Back/Next/Skip). ~10-14 steps that teach
  BOTH mechanics AND 1983 context, e.g.: welcome + why home PCs created a repair market →
  the header (date, cash, hours, End Day) → Offers tab, accept a repair → Workbench, the
  step checklist & how diagnosis works → sourcing/assigning a part → finishing a job →
  the Parts Market & why prices drift → End Day → reputation/prestige → the Wiki as your
  history reference → "you're on your own now." Steps that reference a tab switch to it;
  steps tied to an action (accept a job, end a day) advance when the player does it OR via
  Next. Fully skippable at any point; completion/skip persists to localStorage so it
  never reappears unless replayed.
- A persistent **Help ( ? )** button in the header opening a reference modal any time
  (not just first run): a concise mechanics guide (tabs overview, the day loop, work
  speeds & callbacks, staff, certifications, saving) + a **Replay tutorial** button.
  Keyboard accessible; Escape closes.

## 13.6 Polish & hardening (ALL) — external-test quality gate
- Every workstream: audit your layer for console errors, unhandled `{ok:false}`, NaN/
  Infinity in displayed numbers, empty-state text on every list/section, and confirm
  dialogs on all destructive/irreversible actions. Fix what you find.
- ENGINE: guard every new API against missing/old-save state; `getConfig()` exposes any
  new tunables; re-verify the 1983 band + flips ratio + offer-ramp after content lands.
- UI: verify all four era skins remain readable with the new sections; the two new
  header buttons (Help, and any tour affordance) fit the layout at all zoom levels;
  tutorial overlay repositions on resize and never traps focus.
- DATA: validator must stay green with all new tables; keep per-year buildability green.

## 13.7 New files & load order (UI owns index.html)
Add after the existing data files: `js/data/` new content stays in existing owned files
(no new data file needed). UI adds ONE new script `js/ui/tutorial.js` loaded AFTER
`js/ui/tabs.js` and before `js/ui/screens.js`. (Chronicle/articles/certs UI live in the
existing ui/tabs.js/screens.js.) Engine adds no new files (new APIs go in existing
engine modules). If a new engine module is unavoidable, name it `js/engine/education.js`
loaded after simulation.js and before api.js, and tell the overseer.

## 13.8 Testing
- validate-data: CHRONICLE, ARTICLES, PERIOD_SOFTWARE, CERTIFICATIONS schemas + the
  checks named above; all prior checks green.
- sim-test: chronicle firing & date-gating; article unlock gating; no unresolved copy
  tokens; certification study→completion→effect; save v5→v6 migration; the market-
  liveness + band + ramp guards from prior rounds still pass.
- Overseer E2E: chronicle news + Wiki Chronicle timeline; an Articles entry opens and
  renders; a certification can be started & studied with the hour delta; the tutorial
  runs, advances, and is skippable; the Help modal opens; no console errors across a
  multi-era playthrough.
