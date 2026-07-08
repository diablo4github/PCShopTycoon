# Circuit & Solder — Design Direction (written at v0.3 → v0.4)

Overseer's evaluation of what the game still needs **beyond polish**, oriented around
the stated vision: *a genuinely playable tycoon game that doubles as an educational
window into four decades of PC-building history.*

## 1. The education layer should become a first-class system (v0.5 candidate)

The Wiki (part descs) and era-authentic step lists are a good foundation, but they are
*reference* education — passive. What's missing is *narrative* education:

- **The Tech Chronicle (yearly almanac).** Real computing milestones surfaced as dated,
  non-market news: Macintosh launch '84, Windows 3.0 '90, Doom '93 driving 486 sales,
  Win95 midnight lines, iMac '98, Napster '99, XP '01, iPhone '07, SSD inflection '12,
  M1 '20. Some exist as *market events*; the Chronicle makes the rest visible with a
  2-3 sentence "why it mattered." Cheap to build (data + news kind + Wiki archive tab).
- **Milestone Wiki articles** beyond parts: the ISA→VLB→PCI→AGP→PCIe story, FAT→NTFS,
  spinning rust→SSD, beige→RGB. Unlock as the calendar crosses each transition —
  players who *lived* the transition in-game get the retrospective.
- **Period software in job copy.** Customers should name real workloads era-by-era:
  Lotus 1-2-3, WordPerfect, Doom LAN parties, Quake 3, WoW, Crysis, Zoom calls.
  The complaint system (v0.3) makes this a data-only change.
- **Owner certifications** (educational progression): A+ (1993+), Novell CNE (early
  90s), MCSE (late 90s), Apple Authorized (if Apple lands). Study hours as a spend,
  unlock job types/speed bonuses — teaches what credentialing actually looked like.
- **A guided first week** (tutorial) that teaches mechanics *and* 1983 context
  ("Why are all these machines suddenly in homes?").

## 2. The long arc needs stakes (v0.5/0.6)

Money and prestige currently rise monotonically; after the first shop upgrade the
decision pressure flattens.

- **Era transitions as survival tests.** Platform shifts should threaten the shop the
  way they threatened real shops: AT→ATX, ISA death, the 2000s big-box squeeze, the
  2010s "nobody repairs laptops" cliff. Mechanics: inventory obsolescence you must
  anticipate (already partially real via pricing), demand mix shifts per era,
  a retraining cost for staff on new platforms.
- **Scenario starts.** Y2K rush (1998, contract flood, deadline wall), dot-com bust
  survivor (2000, demand collapse), Thailand flood arbitrage (2011), shortage-era
  scalper resistance (2020). Each is a curated 1-2 year challenge with a scored end.
- **Achievements + lifetime stats screen; difficulty settings** (cash/rep multipliers,
  event harshness).
- **A credit line.** Bankruptcy is currently the only financial lever; a small
  business loan (era-appropriate interest!) adds real decisions at expansion moments
  and softens the grace-period cliff without removing it.

## 3. Economy & relationship depth (v0.6 candidates)

- **Distributor relationships:** bulk orders with lead times and quantity discounts;
  a gray-market channel (cheap, no warranty, reliability risk) — period-authentic.
- **Repeat customers & business accounts:** named customers who return if delighted;
  business accounts as recurring monthly service contracts (the real revenue backbone
  of surviving shops).
- **Regional competition:** the random competitor events could become a persistent
  rival shop whose price/quality posture shifts the job mix.

## 4. Already queued (v0.4b, blocked on parts research)

Motherboard slot counts with multi-GPU (Voodoo2 SLI! CrossFire/SLI era) and
multi-DIMM builds; Apple/Mac as a repair-only platform family; smartphones/tablets
as late-game repair volume; the graphical motherboard build UI (slot map with
red = incompatible, yellow = below spec).

## Recommended order

1. **v0.4a** (in flight): feasibility, ramp, merged diagnosis, OS requests, staff XP,
   waiting steps.
2. **v0.4b**: slots/multi-GPU/multi-RAM + graphical builder + Apple + mobile (research-driven).
3. **v0.5 — Education Update**: Tech Chronicle, milestone articles, period software
   copy, certifications, tutorial week.
4. **v0.6 — Long Arc Update**: era-transition pressure, scenarios, credit line,
   repeat/business customers, achievements & stats.
