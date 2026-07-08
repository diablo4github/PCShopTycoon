# Parts & Hardware-History Research — v0.4b prep

Research document only. No code, no schema changes applied here — this feeds the v0.4b
DATA/ENGINE work per the v0.4a addendum note ("Part B... follows after the parts-research
doc lands"). Baseline reviewed: `SPEC.md` §2 (data schemas), §9.1 (brand/desc), §11.4 (OS
families), and the current `js/data/catalog.js` — **603 parts** total (cpu 87, gpu 79,
motherboard 64, ram 55, storage 67, psu 51, case 55, cooling 33, os 43, peripheral 69),
spanning 1979–2025, perf-anchored per §2.1.

---

## 1. Motherboard slot counts

### 1.1 Compact per-era reference table

| Era | RAM slots (typical) | Full-length GPU-capable slots | Storage connectors |
|---|---|---|---|
| 1979–84 (XT, `FF-XT`) | 4 on-board DIP banks (expansion via ISA memory cards) | 5–8× `BUS-ISA8` | 1 FDD ch. + 1 MFM ch. (2 devices each) |
| 1985–90 (286/386 AT, `FF-AT`) | 4 DIP banks → 4–8× 30-pin SIMM sockets (2 banks) | 6–8× `BUS-ISA16`/`ISA8` mix | 1 FDD ch. + 1 MFM/IDE ch. |
| 1991–95 (486, early Socket 5/7) | 4× 72-pin SIMM (1–2 banks) or 8× 30-pin on ISA-only 486s | VLB era: 2× VLB + 3–4 ISA; PCI era: 3–4× `BUS-PCI` | 2 IDE channels (4 devices) + 1 FDD |
| 1996–2000 (Socket 7/Slot 1/Socket A, AGP arrives 1997) | 3–4× DIMM (168-pin SDR) | **AGP always 1** (+3–4 PCI unused for GPU by convention); pre-AGP boards: 3–4× PCI | 2 IDE channels; budget i810-class boards: onboard only |
| 2001–05 (P4/Athlon XP/Athlon 64, DDR) | 2–4× DIMM (184-pin DDR) | 1× AGP (dual-channel platforms don't change this) | 2 IDE ch. + 2–4 SATA ports emerging (2003+) |
| 2006–10 (Core 2/early i-series/AM2-3, DDR2/DDR3, PCIe) | 4× DIMM mainstream (2 mATX budget; 6 triple-channel X58) | 1× PCIe x16 mainstream; **2×** on SLI/CrossFire-certified chipsets (nForce 570/590, P35/X38/X48, X58); **3×** physical on flagship X58 | 4–6 SATA ports; legacy IDE ch. lingers to ~2010 |
| 2011–15 (Sandy/Ivy/Haswell, AM3+, DDR3) | 4× DIMM mainstream (2 budget mATX; 8 quad-channel X79) | 1× x16 mainstream; 2× (x16/x8) SLI/CF boards; 3–4× physical on X79 HEDT | 6 SATA ports; first M.2 slot appears 2014 (Z97) |
| 2016–20 (Skylake–Comet Lake, AM4, DDR4) | 4× DIMM mainstream (2 budget mATX; 8 quad-channel X299/TRX40) | 1× x16 mainstream; 2× (x16/x8) on enthusiast SKUs through ~2020 (SLI dies Jan 2021, CrossFire faded ~2019) | 6 SATA + 1–2 M.2 |
| 2021–25 (Alder Lake–Arrow Lake, AM5, DDR5) | 4× DIMM mainstream (2 budget mATX) | 1× x16 (2nd physical slot present but x4, rarely used for a 2nd GPU — multi-GPU gaming is dead) | 4–6 SATA + 2–4 M.2 (PCIe 4.0/5.0) |

**Convention used below** (matches the task's framing exactly): `slots.gpu` counts *ISA slots*
on ISA-only boards, *VLB* slots on VLB boards, *PCI* slots on PCI-only boards with no AGP,
**1** on any AGP board regardless of PCI count, and the number of *physical x16-length*
PCIe slots on PCIe boards (1 for single-GPU boards, 2–4 for SLI/CrossFire/HEDT boards).
`slots.storage` counts channels/ports (IDE channel = 2 devices; SATA/M.2 = 1 device per port).
Real boards varied ±1 slot within a chipset generation by SKU/price point — treat the table
below as the DATA agent's default, nudge ±1 to match a board's stated `tier`.

### 1.2 Recommended `slots` for all 64 existing catalog motherboards

| id | year | ram | gpu | storage | note |
|---|---|---|---|---|---|
| motherboard-ibm-5150 | 1981 | 4 | 5 | 2 | 5× ISA8 total |
| motherboard-ibm-5160 | 1983 | 4 | 8 | 2 | 8× ISA8 |
| motherboard-turbo-xt | 1983 | 4 | 8 | 2 | 8× ISA8 |
| motherboard-8086-deskpro | 1984 | 4 | 8 | 2 | 8× ISA8 |
| motherboard-erso-xt | 1984 | 4 | 8 | 2 | 8× ISA8 clone |
| motherboard-ibm-5170 | 1984 | 4 | 8 | 2 | 6× ISA16 + 2× ISA8 |
| motherboard-baby-at-286 | 1986 | 8 | 6 | 2 | 30-pin SIMM, 2 banks×4 |
| motherboard-386dx-cache | 1987 | 8 | 6 | 2 | 30-pin SIMM, 2 banks×4 (32-bit bus) |
| motherboard-neat-286 | 1988 | 8 | 6 | 2 | 30-pin SIMM |
| motherboard-386sx-baby | 1988 | 4 | 6 | 2 | 30-pin SIMM, 1 bank×4 (16-bit SX bus) |
| motherboard-486-isa | 1989 | 8 | 6 | 2 | 30-pin SIMM, 2 banks×4 |
| motherboard-pcchips-386sx | 1990 | 4 | 6 | 2 | 30-pin SIMM |
| motherboard-486-opti | 1991 | 4 | 6 | 2 | 72-pin SIMM (1 bank); some SKUs also 2× 30-pin |
| motherboard-486-vlb | 1992 | 4 | 2 | 2 | 72-pin SIMM; 2× VLB (+3–4 ISA16 not GPU-relevant) |
| motherboard-486-pci | 1994 | 4 | 3 | 2 | 72-pin SIMM; 3× PCI |
| motherboard-p54-pci | 1994 | 4 | 4 | 2 | 72-pin SIMM pairs (64-bit bus); 4× PCI |
| motherboard-shuttle-486 | 1994 | 4 | 3 | 2 | 72-pin SIMM; 3× PCI |
| motherboard-triton-fx | 1995 | 4 | 4 | 2 | 72-pin SIMM, EDO; 4× PCI |
| motherboard-430hx-atx | 1996 | 4 | 4 | 2 | 168-pin DIMM; 4× PCI, no AGP |
| motherboard-430tx-at | 1997 | 4 | 4 | 2 | DIMM/SIMM combo; 4× PCI, no AGP |
| motherboard-va503 | 1998 | 3 | 1 | 2 | DIMM; AGP=1 (+3–4 PCI free for a Voodoo2 pair) |
| motherboard-440bx | 1998 | 4 | 1 | 2 | DIMM; AGP=1 |
| motherboard-abit-bh6 | 1998 | 4 | 1 | 2 | DIMM; AGP=1 |
| motherboard-810-matx | 1999 | 2 | 0 | 2 | integrated-only i810 mATX — **no AGP slot at all** |
| motherboard-bx-370 | 1999 | 4 | 1 | 2 | DIMM; AGP=1 |
| motherboard-kt133 | 2000 | 3 | 1 | 2 | DIMM; AGP=1 |
| motherboard-kt266a | 2001 | 3 | 1 | 2 | DDR DIMM; AGP=1 |
| motherboard-i845d | 2002 | 3 | 1 | 2 | DDR DIMM; AGP=1 |
| motherboard-nforce2 | 2002 | 3 | 1 | 2 | DDR DIMM, dual-channel; AGP=1 |
| motherboard-asrock-k7s41 | 2003 | 2 | 1 | 2 | DDR DIMM, mATX budget; AGP=1 |
| motherboard-i865pe | 2003 | 4 | 1 | 2 | DDR DIMM, dual-channel; AGP=1 |
| motherboard-865g-matx | 2003 | 2 | 1 | 2 | DDR DIMM, mATX; AGP=1 (integrated primary) |
| motherboard-k8t800 | 2004 | 4 | 1 | 2 | DDR DIMM, dual-channel Socket 939; AGP=1 |
| motherboard-i915p | 2004 | 4 | 1 | 4 | first PCIe gen — 1× x16; SATA arrives alongside 1 IDE |
| motherboard-p965 | 2006 | 4 | 1 | 6 | DDR2; P965 chipset has no CrossFire — single x16 only |
| motherboard-am2-nf570 | 2006 | 4 | 2 | 6 | DDR2; nForce 570 SLI is a genuine dual-x16 chipset |
| motherboard-4coredual | 2006 | 4 | 1 | 4 | transitional Core2-on-AGP oddball; AGP=1 |
| motherboard-g31-matx | 2007 | 2 | 1 | 4 | DDR2, mATX budget; 1× PCIe x16 |
| motherboard-780g | 2008 | 4 | 1 | 4 | DDR2, mATX; integrated primary + 1× PCIe x16 |
| motherboard-p45 | 2008 | 4 | 2 | 6 | DDR2; P45 supports CrossFire x8/x8 |
| motherboard-x58 | 2008 | 6 | 3 | 6 | DDR3 triple-channel (2 banks×3); tri-SLI/CF-capable |
| motherboard-am3-770 | 2009 | 4 | 1 | 5 | DDR3; 1× PCIe x16 |
| motherboard-p55 | 2009 | 4 | 2 | 6 | DDR3 dual-channel; x16/x8 SLI/CF |
| motherboard-p67 | 2011 | 4 | 2 | 6 | DDR3; x16/x8 SLI/CF |
| motherboard-970-am3 | 2011 | 4 | 2 | 6 | DDR3; 970 chipset supports CF x8/x8 (budget SKUs: drop to 1) |
| motherboard-z77 | 2012 | 4 | 2 | 6 | DDR3; Z77 officially 2-way SLI/CF x8/x8 |
| motherboard-mvgene | 2012 | 4 | 2 | 6 | DDR3, mATX flagship (ROG Gene); x8/x8 SLI/CF |
| motherboard-h81-matx | 2013 | 2 | 1 | 4 | DDR3, budget mATX |
| motherboard-b85 | 2013 | 4 | 1 | 6 | DDR3, business chipset — no multi-GPU |
| motherboard-z97 | 2014 | 4 | 2 | 6+1M.2 | DDR3; first mainstream M.2 slot |
| motherboard-z170 | 2015 | 4 | 2 | 6+2M.2 | DDR4; x16/x8 SLI/CF |
| motherboard-b350 | 2017 | 4 | 1 | 4+1M.2 | DDR4; no multi-GPU (B-series) |
| motherboard-x470 | 2018 | 4 | 2 | 6+2M.2 | DDR4; X470 supports CF x8/x8 |
| motherboard-b450m | 2018 | 4 | 1 | 4+1M.2 | DDR4 mATX |
| motherboard-z390 | 2018 | 4 | 2 | 6+2M.2 | DDR4; 2-way SLI/CF x8/x8 |
| motherboard-h310m | 2018 | 2 | 1 | 4+1M.2 | DDR4, budget mATX |
| motherboard-b550 | 2020 | 4 | 1 | 6+2M.2 | DDR4; B-series, no certified multi-GPU |
| motherboard-z490 | 2020 | 4 | 2 | 6+2M.2 | DDR4; last big Intel 2-way SLI/CF generation |
| motherboard-z690 | 2021 | 4 | 1 | 6+3M.2 | DDR5; 2nd slot exists but x4 — SLI is dead by now |
| motherboard-b660 | 2022 | 4 | 1 | 4+2M.2 | DDR4 budget variant |
| motherboard-b650 | 2022 | 4 | 1 | 4+2M.2 | DDR5 |
| motherboard-b760m | 2023 | 2 | 1 | 4+2M.2 | DDR5, mATX budget |
| motherboard-z790 | 2022 | 4 | 1 | 6+3M.2 | DDR5; 2nd slot x4 |
| motherboard-x870 | 2024 | 4 | 1 | 4+3M.2 | DDR5 |

### 1.3 ~15 recommended new boards (interesting slot configs)

| # | proposed id/name | year | socket (new `SKT-*` tags) | ram | gpu | storage | showcase |
|---|---|---|---|---|---|---|---|
| 1 | Socket 7 Tri-PCI Board (pre-AGP) | 1997 | `SKT-7` | 4 (72-pin) | 4 (PCI, no AGP) | 2 | Voodoo2-era: 1 primary 2D card (PCI) + 2× Voodoo2 SLI pair + 1 spare PCI |
| 2 | Slot 1 440LX AGP+4PCI Board | 1997 | `SKT-SLOT1` | 4 DIMM | 1 (AGP) | 2 | Primary AGP 2D/3D (Voodoo Banshee/Riva128) + 4 PCI free for Voodoo2 SLI pair |
| 3 | nForce4 SLI Reference Board | 2004 | `SKT-939` | 4 DDR | 2 (x16 physical/x8 electrical) | 4 SATA+2 IDE | First SLI-branded dual-slot board |
| 4 | nForce4 SLI X16 Board | 2005 | `SKT-939` | 4 DDR | 2 (true x16/x16) | 4 SATA | First full-bandwidth dual-x16 board (confirmed via nForce4 SLI X16 chipset docs) |
| 5 | Intel 975X Express CrossFire Board | 2005 | `SKT-775` | 4 DDR2 | 2 (x16/x4) | 6 SATA | First Intel chipset with official CrossFire |
| 6 | X38/X48 Dual-x16 Board | 2007–08 | `SKT-775` | 4 DDR2/DDR3 | 2 (full x16/x16) | 6 SATA | Full-bandwidth CF+SLI-certified board |
| 7 | Dual Socket 8 Pentium Pro Server Board | 1996 | `SKT-8` (new) | 8 (72-pin EDO, 2 sockets) | 1 (PCI) | 2 (IDE+SCSI ch.) | Earliest 8-slot workstation/server example |
| 8 | X79 HEDT 8-DIMM Board | 2011 | `SKT-2011` (new) | 8 DDR3 (quad-channel) | 3 (physical x16) | 6 SATA | First consumer quad-channel HEDT |
| 9 | Z270 2-Way SLI Gaming Board | 2017 | `SKT-1151` | 4 DDR4 | 2 (x16/x8) | 6 SATA+2 M.2 | Mainstream SLI near its twilight |
| 10 | X99 HEDT 8-DIMM Board | 2014 | `SKT-2011V3` (new) | 8 DDR4 (quad-channel) | 4 (physical x16) | 10 SATA+1 M.2 | Quad-SLI/CF HEDT flagship |
| 11 | Z390 Tail-End 2-Way SLI Board | 2018 | `SKT-1151V2` | 4 DDR4 | 2 (x16/x8) | 6 SATA+2 M.2 | Last big mainstream SLI generation before Jan-2021 death |
| 12 | X299 HEDT Board | 2017 | `SKT-2066` (new) | 8 DDR4 (quad-channel) | 4 (physical x16) | 8 SATA+3 M.2 | HEDT continuation into DDR4 |
| 13 | Dual Xeon Scalable Server Board | 2019 | `SKT-3647` (new, dual-socket) | 16 DDR4-ECC-REG (8/socket, 6-ch) | 1 (PCIe x16, rarely populated w/ GPU) | 8 SATA+4 NVMe U.2 | Extreme server RAM-heavy example |
| 14 | TRX40 Threadripper Workstation Board | 2019 | `SKT-STRX4` (new) | 8 DDR4 (quad-channel) | 4 (PCIe 4.0 x16 physical) | 8 SATA+4 M.2 | Modern quad-channel + quad-x16 workstation |
| 15 | Dual Xeon 5000-series Server Board | 2008 | `SKT-771D` (new, dual-socket) | 8 FB-DIMM (4/socket) | 1 (PCIe x16) | 6 SATA | Mid-2000s dual-socket server, FB-DIMM flavor |

Socket tags above are new values within the existing `SKT-*` namespace (no schema change
needed — the namespace already allows arbitrary suffixes). ECC/registered RAM for the
server boards can stay tagged `MEM-DDR3`/`MEM-DDR4` for compat purposes; an optional
`ecc: true` flag is a nice-to-have flavor field, not required (see §7).

---

## 2. Multi-GPU history

### 2.1 Accurate windows

| Technology | Window | Requirement | Scaling reality | Death |
|---|---|---|---|---|
| 3dfx Voodoo2 SLI ("Scan-Line Interleave") | Feb 1998 – ~2000 | 2 **identical** Voodoo2 cards (8MB or 12MB, must match) + a separate primary 2D/3D card feeding a pass-through VGA cable into the pair | Near-ideal — each card renders alternating scanlines, ~90%+ scaling, plus unlocks 1024×768 (vs 800×600 single-card cap) | 3dfx acquired STB, bought a board factory instead of fixing its roadmap, and filed for bankruptcy Dec 2000; Voodoo2 EOL ~1999–2000 |
| NVIDIA SLI ("Scalable Link Interface", relaunched name) | 2004 (GeForce 6800, nForce4 SLI chipset) – ~2020 | 2 (or 3–4 on HEDT) **matching** NVIDIA GPUs + SLI bridge + SLI-certified motherboard/chipset + per-game driver profile | +40–80% typical, wildly game-dependent; many titles 0% or negative scaling; microstutter endemic; needed day-1 driver profiles that often lagged new releases | NVIDIA stopped issuing new SLI driver profiles for RTX 20-series-and-older Jan 1 2021; RTX 3090 was the last card with an SLI/NVLink finger, and only via native game-side implementation from Ampere on — functionally dead for gaming by 2021 |
| ATI/AMD CrossFire | Sep 2005 (Radeon X850 XT/X800 CrossFire Edition) – ~2017–19 | Gen 1 (2005–06): 1 special "CrossFire Edition" master card + 1 compatible standard card (asymmetric!). Gen 2+ (HD 2000 series, 2007+): 2 identical cards + bridge, like SLI | Same +40–80% band, same poor/inconsistent per-game support | AMD de-emphasized after RX 500 series (2017); RX 5700/Navi (2019) dropped the physical bridge connector entirely, leaving only software "CrossFire" via DX12 explicit multi-adapter, which almost no game implemented |
| Multi-GPU for gaming, broadly | — | — | — | Effectively dead 2020–21 for both vendors. Multi-GPU/NVLink survives only in professional/compute contexts (workstation rendering, ML, datacenter) — never gaming after this point |

### 2.2 Multi-RAM norms

| Config | Window | Notes |
|---|---|---|
| Single-channel (no matching needed) | through ~2002 | Any capacity/speed mix technically worked; no perf penalty for mismatch |
| Dual-channel, matched pairs recommended | 2003+ (Pentium 4 875P/i865/i875; Athlon 64 Socket 939, 2004) | Became the universal consumer default; boards ship in pairs of 2 or 4 DIMM slots ever since |
| Triple-channel, matched triples | 2008–2011 (X58/Nehalem) | 6-DIMM boards, populate in sets of 3 |
| Quad-channel, matched quads | 2011–2019 (X79/X99/X299) and 2019+ Threadripper (TR4/TRX40/sTRX4) | 8-DIMM boards, populate in sets of 4 |
| Servers, 8+ sticks | 2008+ (dual-socket Xeon/EPYC, 4–8 channels **per socket**) | 8–16+ DIMM slots common; populate per-channel in matched sets |

### 2.3 Recommendation for job requirements

- Gate a **gamer** "wants SLI/CrossFire" build request to two accurate windows:
  **1998–2000** (Voodoo2 SLI — niche/enthusiast flavor, requires exactly 2 identical
  Voodoo2s + a primary 2D card) and **2004–2015** (NVIDIA SLI / AMD CrossFire at their
  cultural peak — mainstream enthusiast/gamer request). Allow a fading tail through
  ~2019 (rare/vanity requests only), essentially **none from 2021 on** except perhaps a
  creator/workstation NVLink flavor line (non-gaming).
- Gate **smallbiz/office/creator/server** RAM-heavy build requests (`useCase: "server"`
  or `"workstation"`) to the multi-RAM norms table: simple matched-pair dual-channel asks
  are fine any time from 2003+; "maxed-out RAM" contract/enthusiast requests should favor
  the triple-/quad-channel HEDT windows (2008+/2011+) and dual-socket server boards
  (2008+) for the biggest, most flavorful RAM-stick counts.

---

## 3. Apple/Mac line

### 3.1 Era timeline & repairability reality

| Era | Years | Repairability reality for a 3rd-party shop |
|---|---|---|
| 68k Macintosh | 1984–1995 | RAM: no (128K/512K, soldered) → yes via SIMM slots from the Mac Plus (1986) on. Storage: external SCSI upgrade trivial; internal swap moderate (case tools/CRT discharge on compact Macs). CPU: soldered, **no upgrade** — but 3rd-party accelerator cards via the PDS slot were a real, common shop service on SE/Plus/Classic. NuBus-slot models (Mac II family) were genuinely expandable. |
| PowerPC | 1994–2006 | RAM: yes (SIMM/DIMM slots standard). Storage: yes (internal IDE/SCSI, easy on towers, moderate on all-in-ones like iMac G3/G4). CPU: **partially yes** — a real window where 3rd-party CPU daughtercard upgrades existed (Power Mac 6100–9600, and aftermarket G3/G4 upgrade cards for Beige G3/blue-and-white towers). The Power Mac G3/G4 tower era (1997–2004) is the most tech-friendly Mac design ever shipped — tool-less side panels, PCI slots, easy bays. |
| Intel | 2006–2020 | Early towers (Mac Pro 2006–2012 "cheese grater") were the most repairable Mac ever: 8 RAM slots, swappable drive bays, PCIe slots, even CPU-tray swaps. Laptops pre-2012 (MacBook, MacBook Pro unibody 2008–2011) had 2-screw RAM/HDD access — a technician favorite. **2012 is the hinge year**: Retina MacBook Pro solders RAM to the board and glues in the battery; MacBook Air already had soldered RAM. Mac Pro 2013 "trash can" nearly zero internal upgrade (RAM slots only). Repair narrows to screen/battery/logic-board/storage swap depending on model and year. |
| Apple Silicon | 2020+ | RAM and SSD storage are fused into the SoC package (unified memory) on every consumer model — **zero upgrade path**, full stop. Even the 2023 Apple Silicon Mac Pro, despite keeping PCIe slots, has fixed unified memory (no RAM upgrade at all — first Mac Pro ever with this limitation). 3rd-party shop work reduces to: battery replacement (glued, special tools), screen/display assembly swap (increasingly "parts-paired"/serialized, complicating non-Apple-authorized repair), and logic-board-level micro-soldering by specialist shops. Storage is not replaceable in most models. |

### 3.2 Representative machines (period-nominal retail + suggested in-game repair-job pay)

| Machine | Year | Retail (nominal) | Suggested in-game repair pay | Notes |
|---|---|---|---|---|
| **68k era** | | | | |
| Macintosh 128K | 1984 | $2,495 | $70–110 | Soldered RAM, no upgrade |
| Macintosh Plus | 1986 | $2,599 | $70–110 | First SIMM slots + SCSI |
| Macintosh SE | 1987 | $2,900 | $80–120 | PDS slot, accelerator-card upgrade market |
| Macintosh II | 1987 | $3,898–5,498 | $100–160 | NuBus slots, color, genuinely expandable |
| Macintosh Classic | 1990 | $999 | $60–90 | Budget compact Mac |
| Macintosh Quadra 700 | 1991 | $5,699 | $110–170 | 68040, workstation-tier |
| **PowerPC era** | | | | |
| Power Macintosh 6100/60 | 1994 | $1,729 | $80–120 | |
| Power Macintosh 7500 | 1995 | $3,900 | $100–150 | CPU daughtercard upgradeable |
| Power Macintosh G3 (Beige) | 1997 | $1,999–2,999 | $90–140 | Tool-less tower, tech-beloved |
| iMac G3 | 1998 | $1,299 | $80–130 | USB-only, all-in-one but bottom-panel RAM/HDD access |
| Power Mac G4 | 1999–2004 | $1,599+ | $100–160 | PCI + AGP, easy side-door case |
| Power Mac G5 | 2003–2006 | $1,999+ | $120–190 | Last PowerPC tower |
| **Intel era** | | | | |
| iMac (Core Duo) | 2006 | $1,299 | $90–140 | |
| MacBook (White) | 2006–09 | $1,099 | $80–130 | Easy RAM/HDD access |
| MacBook Pro (Unibody) | 2008–11 | $1,999 | $100–160 | 2-screw RAM/HDD bay |
| Mac Pro ("Cheese Grater") | 2009–12 | $2,499+ | $130–200 | Most repairable Mac ever |
| MacBook Pro Retina | 2012–15 | $1,799 | $110–180 | Soldered RAM, glued battery begins |
| Mac Pro ("Trash Can") | 2013 | $2,999 | $140–210 | Sealed thermal core, RAM-only upgrade |
| Mac Mini | 2018 | $799 | $90–140 | Restored user RAM access (briefly) |
| **Apple Silicon era** | | | | |
| MacBook Air M1 | 2020 | $999 | $100–160 | Unified memory, zero upgrade |
| MacBook Pro 14"/16" M1 Pro/Max | 2021 | $1,999+ | $150–230 | Screen/battery/board swap only |
| Mac Studio | 2022 | $1,999+ | $150–230 | |
| Mac Pro (Apple Silicon) | 2023 | $6,999 | $180–280 | PCIe slots, but fixed RAM — first-ever non-upgradeable Mac Pro RAM |

### 3.3 Recommended game modeling

Apple machines should be **repair/upgrade-only customer machines, never custom builds**.
Concretely: a new `DATA.APPLE_MACHINES` table of pre-baked device templates tagged with an
**`APPLE-*` platform-tag family** (`APPLE-68K`, `APPLE-PPC`, `APPLE-INTEL`, `APPLE-SILICON`)
that is entirely separate from the PC `SKT-*`/`MEM-*`/`BUS-*` namespaces — Apple machines
never enter `DATA.PARTS`/the build catalog/compat engine. Each template carries its own
repairability flags (`ramUpgradable`, `hddUpgradable`, `cpuUpgradable: false` always) and a
small fault/part-cost table scaled to the era column above, structurally parallel to the
mobile-device tables in §4.

---

## 4. Mobile devices (repair-job device kinds)

### 4.1 Typical faults & parts cost ranges by era

| Era | Common faults | Part cost (shop cost) | Retail repair price | Notes |
|---|---|---|---|---|
| 2007–2010 (iPhone 2007, Android G1 2008) | cracked screen, dead battery, water damage (usually "no repair, replace") | screen $60–150; battery $20–40 | screen $80–200; battery $50–80 | Independent repair barely exists yet — mostly carrier/warranty |
| 2011–2014 (repair-shop boom begins; iPhone 4/4S glass-both-sides, big-screen Android) | screen/digitizer, battery, charge port, water damage (ultrasonic cleaning niche) | screen $30–100; battery $15–30; charge port $10–25 | screen $60–150; battery $40–70; charge port $40–70 | uBreakiFix founded 2009, iCracked 2010 — the boom era |
| 2015–2019 (large glass-backed phones, OLED premiums, "batterygate" 2017–18) | OLED screen, battery (heightened post-2017 awareness), charge port lint/wear, camera, back-glass crack | screen $80–300; battery $20–40; charge port $15–30 | screen $130–400; battery $50–90; charge port $50–80 | Water damage micro-solder repair becomes a real high-margin niche service |
| 2020–2025 (foldables, Face ID modules, "parts pairing") | OLED screen (calibration-sensitive on Face ID models), battery, charge port, back glass, foldable hinge | screen $150–450; battery $40–90; charge port $20–40 | screen $200–600; battery $70–130; charge port $70–110 | Right-to-repair rules (2022–23) start easing parts access |

Tablets (2010+) follow the same categories at roughly 1.5–2× the screen cost (larger
panels), fewer charge-port failures, more bent-chassis-from-drop damage given size.

### 4.2 Which shops did this work

The **2010s independent repair-shop boom** (uBreakiFix founded 2009, CPR Cell Phone
Repair ~2007, iCracked's on-demand model 2010, countless strip-mall/mall-kiosk "Phone
Repair" storefronts) is a near-perfect match for this game's existing shop-tier ladder
(Garage → Strip-mall Unit → Main Street Storefront → Superstore) — mobile repair is
**great late-game job volume**, ramping sharply from the 2013 era preset onward and
staying strong through 2021+.

### 4.3 Recommended modeling

**Not** catalog build parts. Model as a new device-kind system, parallel to §3.3:
`DATA.MOBILE_DEVICES` (device templates: `id, kind: "smartphone"|"tablet", name, brand,
introYear, eolYear, tier`) + `DATA.MOBILE_FAULTS` (fault templates keyed by kind: screen,
battery, charge-port, water-damage, camera, speaker/mic, button — each with an era-scaled
part-cost range and labor hours per §4.1). These generate their own job subtype
(e.g. `type:"peripheral"` subtype `"mobile_repair"`, or a dedicated `type:"mobile"`),
era-gated (phones ≥2007, tablets ≥2010), weighted to ramp up sharply from ~2013 to match
the real-world boom — and they never touch `DATA.PARTS`/compat.js at all.

---

## 5. Catalog depth — recommended new parts

### 5.1 New `expansion` category proposal

Add `expansion` to the category enum (alongside cpu/motherboard/ram/storage/gpu/psu/case/
cooling/os/peripheral). Compat rule: bus-relevant (`BUS-ISA8/16`, `BUS-PCI`, `BUS-PCIE`)
like gpu, but never required for a valid build (like peripheral) — purely flavor/upgrade
inventory that lets repair/upgrade jobs target "add a sound card," "add a NIC," etc.
perf key: `{}` (no perf-relevant stat; reliability/desc carry the flavor).

**Sound cards**

| Name | Brand | Years | Price | Notes |
|---|---|---|---|---|
| AdLib Music Synthesizer Card | AdLib | 1987–1992 | $195 | FM synth, pre-Sound Blaster standard |
| Creative Sound Blaster 1.0 | Creative | 1989–1992 | $239 | *(already exists as peripheral; keep as expansion cross-reference only)* |
| Gravis UltraSound (GUS) | Advanced Gravis | 1992–1996 | $199 | Wavetable, the demo-scene favorite |
| Sound Blaster Pro | Creative | 1991–1994 | $249 | Stereo FM, first CD-ROM interface bundle |
| Sound Blaster AWE32 | Creative | 1994–1998 | $299 | Wavetable + General MIDI |
| Sound Blaster Live! | Creative | 1998–2003 | $179 | EMU10K1 DSP, EAX positional audio |
| Sound Blaster Audigy 2 | Creative | 2002–2006 | $149 | 24-bit, THX certification |
| Creative X-Fi Titanium | Creative | 2005–2010 | $129 | Last big discrete gaming sound card wave |

**NICs**

| Name | Brand | Years | Price | Notes |
|---|---|---|---|---|
| Novell NE1000 8-bit NIC | Novell/Eagle | 1987–1991 | $195 | Early Ethernet-on-ISA |
| NE2000-compatible ISA NIC | Generic/Realtek | 1990–1997 | $89 | The universal cheap-clone Ethernet card |
| 3Com EtherLink III (3C509) | 3Com | 1992–1998 | $129 | ISA Plug-and-Play NIC, office standard |
| Intel EtherExpress PRO/100 | Intel | 1995–2001 | $69 | PCI Fast Ethernet |
| Linksys 10/100 PCI NIC | Linksys | 1998–2004 | $35 | Home-network budget card |
| Gigabit PCI NIC | D-Link | 2003–2009 | $45 | 1000BASE-T arrives on desktops |
| Wireless 802.11g PCI Card | Netgear | 2003–2008 | $59 | Early Wi-Fi add-in |
| Killer Gaming NIC | Bigfoot Networks | 2008–2013 | $99 | Low-latency marketing-driven NIC |

**Internal modems**

| Name | Brand | Years | Price | Notes |
|---|---|---|---|---|
| 2400 Baud Internal Modem Card | Zoom | 1988–1993 | $149 | ISA internal, no external box |
| 14.4K Internal Fax/Modem | Hayes | 1992–1997 | $179 | Internal answer to the Sportster |
| 28.8K Internal Modem | Boca Research | 1995–1998 | $129 | |
| 56K Internal Modem (PCI) | US Robotics | 1998–2004 | $69 | PCI-bus winmodem generation |
| Winmodem (soft-modem, PCI) | Conexant | 1999–2005 | $29 | CPU-dependent budget modem, technician's headache |
| ISDN Internal Terminal Adapter | 3Com | 1997–2002 | $199 | Business-line internal ISDN card |

**RAID / SCSI / USB / FireWire cards**

| Name | Brand | Years | Price | Notes |
|---|---|---|---|---|
| Adaptec AHA-1542 SCSI Host Adapter | Adaptec | 1990–1996 | $299 | The classic ISA SCSI card |
| Adaptec AHA-2940 PCI SCSI Card | Adaptec | 1995–2001 | $199 | Fast SCSI-2 for scanners/CD burners/servers |
| 3ware Escalade IDE RAID Card | 3ware | 2000–2005 | $249 | Early ATA RAID for small servers |
| HighPoint RocketRAID Card | HighPoint | 2003–2008 | $99 | Budget SATA RAID |
| Adaptec SCSI RAID Card | Adaptec | 1996–2002 | $399 | Server-tier hardware RAID |
| USB 1.1 PCI Card | Belkin | 1998–2002 | $39 | Retrofit USB onto pre-USB boards |
| USB 2.0 PCI Card | IOGEAR | 2002–2008 | $29 | |
| FireWire 400 PCI Card | Adaptec | 2000–2006 | $59 | DV camcorder capture era |
| USB 3.0 PCIe Card | StarTech | 2011–2016 | $25 | Retrofit USB 3.0 onto older boards |

### 5.2 Iconic missing items (fill into existing categories)

| Name | Brand | Category | Years | Price | Perf/score | Notes |
|---|---|---|---|---|---|---|
| 3dfx Voodoo2 8MB | 3dfx | gpu | 1998–2000 | $249 | gpu: 105 | **The** missing iconic card — confirmed launch price $249/8MB |
| 3dfx Voodoo2 12MB | 3dfx | gpu | 1998–2000 | $299 | gpu: 115 | 12MB variant, higher texture headroom; SLI pair ≈180–200 effective |
| Diamond Monster 3D II (Voodoo2) | Diamond | gpu | 1998–2000 | $299 | gpu: 115 | Brand-variant per catalog's existing Voodoo1 pattern |
| STB Velocity 4400 (Voodoo2) | STB | gpu | 1998–2000 | $289 | gpu: 110 | 2nd/3rd brand variant per §9.1's ≥2-brand rule |
| Iomega Zip 250 Drive | Iomega | storage | 1998–2003 | $199 | storageGB 0.25, speed 12 | Successor to the existing Zip 100 |
| Iomega Jaz 1GB Drive | Iomega | storage | 1996–2001 | $399 | storageGB 1, speed 15 | Removable-cartridge workstation storage |
| SyQuest EZ135 Drive | SyQuest | storage | 1995–1998 | $199 | storageGB 0.135, speed 10 | Pre-Zip removable format, design-shop favorite |
| Panasonic LS-120 SuperDisk | Panasonic | storage | 1996–2000 | $149 | storageGB 0.12, speed 5 | Backward-compatible 3.5" floppy successor attempt |
| Plextor 4x/4x/16x CD-RW Drive | Plextor | storage | 1998–2002 | $229 | storageGB 0.68, speed 20 | The enthusiast CD burner |
| Toshiba DVD-ROM Drive | Toshiba | storage | 1997–2002 | $199 | storageGB 4.7, speed 25 | Plain reader, precedes the existing 2003 DVD burner |
| Pioneer Blu-ray Drive (BD-ROM) | Pioneer | storage | 2006–2010 | $299 | storageGB 25, speed 60 | Read-only, HD-DVD format-war era |
| LG Blu-ray Burner (BD-RE) | LG | storage | 2009–2014 | $149 | storageGB 25, speed 65 | Writable Blu-ray, HTPC/archival niche |
| HP Colorado 250MB Tape Backup | HP | storage | 1994–1998 | $249 | storageGB 0.25, speed 6 | QIC internal tape, SMB backup staple |
| SanDisk Cruzer 256MB USB Flash Drive | SanDisk | storage | 2003–2007 | $49 | storageGB 0.25, speed 40 | Sneakernet's final form |
| SanDisk Extreme 64GB USB 3.0 Drive | SanDisk | storage | 2013–2018 | $39 | storageGB 64, speed 60 | |

### 5.3 More 2016–25 coverage (fill thin recent years)

| Name | Brand | Category | Years | Price | Perf/score |
|---|---|---|---|---|---|
| AMD Ryzen 5 5600X | AMD | cpu | 2020–2023 | $299 | cpu: 11500 |
| Intel Core i5-12600K | Intel | cpu | 2021–2023 | $289 | cpu: 13500 |
| Intel Core i9-14900K | Intel | cpu | 2023–2025 | $589 | cpu: 17500 |
| AMD Ryzen 9 9950X | AMD | cpu | 2024–2026 | $649 | cpu: 18500 |
| NVIDIA GeForce RTX 3060 | NVIDIA | gpu | 2021–2023 | $329 | gpu: 12500 |
| AMD Radeon RX 6800 XT | AMD | gpu | 2020–2023 | $649 | gpu: 19500 |
| Intel Arc A750 | Intel | gpu | 2022–2024 | $289 | gpu: 13000 |
| NVIDIA GeForce RTX 4070 | NVIDIA | gpu | 2023–2025 | $599 | gpu: 24000 |
| 32GB DDR5-6000 Kit (2×16GB) | G.Skill | ram | 2021–2025 | $110 | ramMB: 32768 |
| 64GB DDR5-5600 Kit (2×32GB) | Corsair | ram | 2022–2025 | $189 | ramMB: 65536 |
| 2TB PCIe 4.0 NVMe SSD | Samsung | storage | 2020–2024 | $149 | storageGB 2000, speed 98 |
| 4TB PCIe 5.0 NVMe SSD | Crucial | storage | 2023–2025 | $299 | storageGB 4000, speed 100 |
| 850W 80+ Gold ATX 3.0 PSU | Corsair | psu | 2021–2025 | $139 | watts 850 |
| 1000W 80+ Platinum PSU (12VHPWR) | Seasonic | psu | 2022–2025 | $219 | watts 1000 |
| Mesh-Front RGB Mid Tower Case | Lian Li | case | 2020–2025 | $99 | style 8 |
| 360mm AIO Liquid Cooler | NZXT | cooling | 2019–2025 | $159 | cool 9 |
| Low-Profile Air Cooler (SFF) | Noctua | cooling | 2020–2025 | $69 | cool 6 |
| 1080p Webcam | Logitech | peripheral | 2018–2025 | $59 | — |
| Wireless Mechanical Keyboard | Keychron | peripheral | 2020–2025 | $99 | — |
| USB-C Dock/Hub | Anker | peripheral | 2019–2025 | $49 | — |

That's 8 expansion sub-tables (8+8+6+9 = 31 items) + 15 iconic-missing + 20 recent-fill =
**66 items**, comfortably inside the requested 60–100; extend with 1–2 more brand variants
per item (matching the existing Voodoo1/RAM/PSU brand-variant pattern) to reach the top of
the range if desired.

---

## 6. OS families (§11.4 lineage table)

All 43 existing `os` parts, mapped to the engine's fixed family list
(DOS/WIN3X/WIN9X/WINNT/WINVISTA7/WINMOD/OS2/MACOS/LINUX/OTHER):

| id | Product | Family |
|---|---|---|
| os-pcdos-11 | IBM PC DOS 1.1 | DOS |
| os-msdos-211 | MS-DOS 2.11 (OEM) | DOS |
| os-pcdos-21 | IBM PC DOS 2.1 | DOS |
| os-cpm86 | Digital Research CP/M-86 | OTHER |
| os-msdos-30 | MS-DOS 3.0 | DOS |
| os-pcdos-33 | IBM PC DOS 3.3 | DOS |
| os-msdos-401 | MS-DOS 4.01 | DOS |
| os-drdos-5 | DR DOS 5.0 | DOS |
| os-win30 | Windows 3.0 (w/ DOS) | WIN3X |
| os-msdos-5 | MS-DOS 5.0 | DOS |
| os-win31 | Windows 3.1 (w/ DOS 6) | WIN3X |
| os-wfw-311 | Windows for Workgroups 3.11 | WIN3X |
| os-os2-12 | IBM OS/2 1.2 | OS2 |
| os-msdos-622 | MS-DOS 6.22 | DOS |
| os-os2-warp | OS/2 Warp 3 | OS2 |
| os-pcdos-70 | IBM PC DOS 7.0 | DOS |
| os-win95 | Windows 95 | WIN9X |
| os-winnt4 | Windows NT 4.0 Workstation | WINNT |
| os-beos-r45 | BeOS Release 4.5 | OTHER |
| os-win98 | Windows 98 | WIN9X |
| os-win98se | Windows 98 SE | WIN9X |
| os-win2k | Windows 2000 Professional | WINNT |
| os-winme | Windows Me | WIN9X |
| os-winxp-home | Windows XP Home Edition | WINNT |
| os-winxp-pro | Windows XP Professional | WINNT |
| os-suse-linux | SuSE Linux Professional (Boxed) | LINUX |
| os-winxp-mce | Windows XP Media Center 2005 | WINNT |
| os-vista-hp | Windows Vista Home Premium | WINVISTA7 |
| os-vista-ult | Windows Vista Ultimate | WINVISTA7 |
| os-ubuntu-804 | Ubuntu 8.04 LTS Disc | LINUX |
| os-win7-hp | Windows 7 Home Premium | WINVISTA7 |
| os-win7-pro | Windows 7 Professional | WINVISTA7 |
| os-win8 | Windows 8 | WINMOD |
| os-win81 | Windows 8.1 | WINMOD |
| os-ubuntu-1204 | Ubuntu 12.04 LTS Disc | LINUX |
| os-win10-home | Windows 10 Home | WINMOD |
| os-win10-pro | Windows 10 Pro | WINMOD |
| os-win10-usb | Windows 10 Home (Retail USB) | WINMOD |
| os-win10-pro-usb | Windows 10 Pro (Retail USB) | WINMOD |
| os-ubuntu-1804 | Ubuntu 18.04 LTS USB | LINUX |
| os-win11-home | Windows 11 Home | WINMOD |
| os-win11-pro | Windows 11 Pro | WINMOD |
| os-ubuntu-2204 | Ubuntu 22.04 LTS USB | LINUX |

**Gaps worth adding** (all currently absent from the catalog):

- **MACOS family has zero entries.** If §3's Apple line lands, add 4–6 flavor-only MACOS
  parts (System 6 ~1988, System 7 ~1991, Mac OS 8 ~1997, Mac OS 9 ~1999, Mac OS X 10.4
  Tiger ~2005, macOS Monterey ~2021) — used only inside Apple-device job steps/Wiki, never
  in the PC build catalog/compat engine (no `ARCH-*` tag needed, or tag them
  `ARCH-APPLE` as a clearly-separate bucket the compat engine ignores).
- **Early Linux distros (pre-2001) are entirely missing.** SuSE (2001) is the earliest
  LINUX entry; the catalog jumps straight from DOS/Win9x to 2001. Add Slackware Linux
  (1993), Red Hat Linux (1994/95), Debian (1993, mostly a mail-order/download curiosity
  pre-1996), and Caldera OpenLinux (1998) for 1990s hobbyist/BBS-era flavor.
- **OS/2 arc is thin.** Only Warp 3 (1994) and 1.2 (1989) exist; OS/2 Warp 4 "Merlin"
  (1996) is the natural bridge entry before OS/2's practical retail death ~1997–98.

---

## 7. Schema recommendations for v0.4b

### 7.1 `slots` object on motherboards

```js
slots: { ram: 4, gpu: 2, storage: 6 }   // §1 convention: gpu = ISA/VLB/PCI slot count on
                                         // pre-AGP boards, 1 on any AGP board, physical
                                         // x16-length count on PCIe boards; storage =
                                         // channel/port count (IDE ch.=2 devices)
```
**Engine impact:** this is the first hook giving `compat.js`/`validateBuild` real *capacity*
constraints beyond today's tag-overlap check — e.g. reject a build with 2 GPU parts when
`slots.gpu < 2`, or 4 RAM sticks against `slots.ram = 2`. `getBuildCatalog` can gray out
additional RAM/GPU picks once a build already fills `slots.*`. Backward compatible: omit
the field (or default to a generous `{ram:99,gpu:99,storage:99}`) for any part missing it
so old saves/migrated boards never regress.

### 7.2 GPU `sliTag` pairing rule

```js
sliTag: "VOODOO2"       // or "GEFORCE-6800-SLI", "CROSSFIRE-X850" etc.
```
Optional field on `gpu` parts that historically supported multi-GPU pairing (Voodoo2,
NVIDIA SLI-era 2004–2020, AMD CrossFire-era 2005–2019). Pairing rule: a multi-GPU
build/job requires **2+ installed gpu parts sharing the same `sliTag`** AND a motherboard
with `slots.gpu ≥ 2`. Note the one historical wrinkle worth preserving: first-gen
CrossFire (2005–06) was *asymmetric* (one "CrossFire Edition" master + one compatible
standard card) — if that nuance is skipped for simplicity, document the simplification.
**Engine impact:** `jobs.js` gains a new build-generation branch (gamer customer type,
era-gated per §2.3) that specifically requests a matched SLI/CrossFire pair;
`validateBuild` gains a new problem string ("second GPU isn't SLI-compatible with the
first" / "motherboard has only 1 GPU slot"). Non-multi-GPU builds ignore the field
entirely — zero impact on existing behavior.

### 7.3 Device-kind tables for Apple/mobile

```js
DATA.APPLE_MACHINES = [ { id, name, family: "APPLE-PPC", introYear, eolYear,
  ramUpgradable, hddUpgradable, cpuUpgradable: false, basePriceRange: [90,140],
  faultCategories: ["ram","storage","screen","logic-board"] }, ... ];
DATA.MOBILE_DEVICES = [ { id, kind: "smartphone"|"tablet", name, brand, introYear, eolYear,
  tier }, ... ];
DATA.MOBILE_FAULTS = { screen: [...], battery: [...], "charge-port": [...],
  "water-damage": [...], camera: [...], "speaker-mic": [...], button: [...] };
```
**Engine impact:** the biggest lift of the three — `jobs.js`/`simulation.js` need a new
job-generation branch that picks a device from these tables instead of assembling a
`DATA.PARTS` machine, and that branch **skips `compat.js` entirely** (no platformTags, no
build catalog, no `getBuildCatalog`/`validateBuild` involvement) — it resolves pay/parts-
cost/steps purely against the device's own fault table. UI needs a new device-based
fault/needs card distinct from the existing part-picker, and the Wiki tab needs a
read-only render path for these tables. This is additive (doesn't touch the PARTS/compat
pipeline) but does require new branching in at least two engine files and one new UI
card type — budget it as the largest single piece of v0.4b Part B.

---

## 8. Prioritized implementation order

1. **Motherboard `slots` schema + backfill on all 64 existing boards** (§1.2) — low risk,
   pure data addition, and a prerequisite for everything multi-GPU/multi-RAM.
2. **Multi-GPU `sliTag` + job-generation hook** (§2, §7.2) — depends on #1; delivers the
   most visible playtest-requested feature (SLI/CrossFire gamer job flavor) for the
   least engine risk.
3. **Catalog depth pass** (§5: `expansion` category, Voodoo2/Zip/optical gaps, 2016–25
   fill, brand variants) — pure data, no engine dependency, can run in parallel with #2.
4. **OS family mapping finalization** (§6) — small, low-risk; land the early-Linux/OS2
   Warp 4 gap-fills now so §11.4 doesn't need a second pass once Apple lands.
5. **Apple device-kind table + `APPLE-*` tag family + job/Wiki branch** (§3, §7.3) —
   the larger lift; do this before mobile so the device-kind engine plumbing is proven
   once before reusing it.
6. **Mobile device-kind table + fault system** (§4, §7.3) — reuses the plumbing built in
   #5; same shape, second and cheaper implementation.
7. Everything else noted as "follows after the parts-research doc lands" in the v0.4a
   addendum (e.g. the graphical build UI) — out of scope for this document; sequence
   after #1–6 land and pass validate-data/sim-test.
