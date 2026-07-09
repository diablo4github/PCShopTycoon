# Circuit & Solder — Art Style Bible

Visual identity for Imagine-generated (and hand-made) still assets.  
Companion to the uplift plan: **scenes and archetypes over product catalogs**.  
Does **not** replace CSS era skins, the motherboard schematic, or UI chrome.

**Status:** v1.1 — choices locked; **phases 0–1 complete** (logo + full New Game era/scenario banner set).  
**Principle:** one coherent illustrated world; history-honest archetypes; readable next to dense UI.

---

## 1. Purpose

| Goal | How art helps |
|---|---|
| Sell the fantasy in the first 10 seconds | Era + scenario card banners on New Game |
| Make progression feel physical | Shop-tier dioramas |
| Keep daily UI scannable | Category glyphs (not 695 part photos) |
| Reward long play | Achievement badge icons |
| Support the education product | Optional Wiki/transition headers later |

Art is **card chrome, icons, and mood** — never the only carrier of game information.  
Money, stats, dates, part names, and compatibility stay in real UI text.

---

## 2. Design pillars

1. **Bench-side nostalgia, not vaporwave.** Warm workbench light, tools, cardboard, cable clutter. Sentimental but practical — a real shop, not a neon museum poster.
2. **Educational honesty.** Period-plausible silhouettes and materials. No fake SKUs, no counterfeit brand packaging, no anachronistic RGB in 1983.
3. **Readable density.** Soft illustration that sits under or beside UI labels. Mid contrast; avoid pure-black voids and pure-white blowouts that clash with era skins.
4. **One hand, many decades.** Same line weight, lighting model, and material language from XT beige through 2021 mesh cases — only props and color temperature shift.
5. **Archetype over inventory.** “A garage with a 5150-class machine,” not “exact IBM model number with legible badge.” “Empty GPU shelf with sealed boxes,” not “RTX 3080 Founders Edition render.”

---

## 3. Master style (the look)

### 3.1 Medium

**Digital gouache / soft technical illustration** with a light editorial finish:

- Painterly fills, gentle gradients, visible but controlled brush texture  
- Clean silhouettes; hardware readable at card thumbnail size  
- Slightly simplified geometry (not photoreal CAD, not cartoon rubber-hose)  
- Occasional inked edge on focal objects only — not heavy comic outlines everywhere  

**Closest genre neighbors (mood only, not to copy):** quiet shop dioramas, museum exhibit panels, high-end board-game box art for historical sims — warmer and messier than sterile tech ads.

### 3.2 Line, form, detail

| Property | Spec |
|---|---|
| Line | Soft or broken contour; not hard cel-shade black outlines |
| Detail | Medium: enough screws/vents/ports to feel real; no microscopic PCB traces as the subject |
| Depth | Clear foreground prop → mid workbench → soft background wall |
| Faces / people | **None** in era, scenario, shop-tier, or banner art |
| Hands | None in banners; tools may rest on the bench unattended |

### 3.3 Lighting

- **Key:** warm practical light (desk lamp, shop fluorescent with slight warmth, afternoon window)  
- **Fill:** soft bounce from cream/beige walls or cardboard  
- **Accent:** era accent color as a **small** glint (CRT glow, Win95 teal UI on a monitor, single blue LED in 2004, empty shelf cool light in 2021) — never full-frame neon  
- **Contrast:** medium; preserve form in shadows (UI sits on cream/gray page backgrounds)

### 3.4 Materials library (consistent across eras)

Use these material “words” in prompts so silicon, plastic, and cardboard feel shared:

- Beige/putty ABS, yellowed cream plastics (early eras)  
- Brushed aluminum, black ATX steel, mesh front panels (later)  
- Green/brown PCB hints only as secondary props  
- Cardboard shipping boxes (unbranded or generic labels)  
- Anti-static bags, zip-ties, Phillips screwdrivers, multimeter, spool of solder  
- CRT glass glow early; flat LCD later  
- Dust, coffee ring, sticky notes, handwritten ticket — **shop lived-in**, not showroom sterile  

### 3.5 Color temperature by era (tint, don’t re-skin)

Align loosely with CSS era accents; keep a shared neutral base so cards don’t fight each other in a grid.

| Era skin | CSS accent (ref) | Illustration bias |
|---|---|---|
| **early** (’83–early ’90s) | Amber `#ffb000` on dark brown | Warm amber lamp, cream plastics, brown wood desk, mono CRT green/amber optional |
| **90s** | Teal `#0f766e` | Beige/gray towers, teal accent props (mouse pad, sticky note, retail blister), paper manuals |
| **00s** | Blue `#2f6db8` | Silver/black cases, one blue LED, LAN cable blue, glossy retail box shapes (generic) |
| **modern** | Indigo `#4262eb` | Cool gray bench, mesh/black cases, sparse RGB (one tasteful strip max), empty shelves, cardboard scarcity |

Shared neutrals for all art: cream `#f3eddd`-ish walls, warm gray metal, soft charcoal for depth — not pure `#000` / `#fff` fields.

### 3.6 Typography inside images

**Default: no readable text.**  
UI will overlay titles (“1983 — The Repair Era”, scenario names, prices).

If a prop needs a label (box, sticky note, CRT):

- Scribble, abstract glyphs, or 1–3 letter marks only  
- Never invent real brand wordmarks, OS splash screens with slogans, or fake model numbers the player could misread as fact  

**Logo exception:** the brand mark may use the words “Circuit & Solder” only if generation is verified legible; otherwise prefer a **wordless mark** (iron + trace) and keep the title in HTML.

---

## 4. What we never put in art

- Photoreal product packshots of named GPUs/CPUs with legible logos  
- Counterfeit trademark packaging (Intel/NVIDIA/Apple/Microsoft trade dress)  
- Anachronisms (RGB watercool in 1983; USB-C on a 1991 bench as the hero prop)  
- Gore, horror, or “broken body” metaphors — broken **machines** only  
- UI mockups with fake stats, dollar amounts, or charts (those belong in code)  
- Busy isometric cutaways that fight the schematic UI  
- Dark cyberpunk cityscapes, holograms, matrix rain  
- Celebrity or recognizable real people  

---

## 5. Asset families & composition

### 5.1 Logo / brand mark

| | |
|---|---|
| **Count** | 1 primary + optional monochrome / favicon crop |
| **Aspect** | `1:1` master; export square + simplified 32–64px crop |
| **Subject** | Soldering iron tip + a simple PCB trace or chip outline forming a subtle “C” or shop crest |
| **Mood** | Craft + silicon; friendly professional, not corporate SaaS |
| **BG** | Flat or soft vignette; transparent-friendly solid that matches early header dark `#1c1406` or cream |
| **Text** | **Wordmark allowed:** “Circuit & Solder” only; must be checked for spelling/legibility before ship |

**Sticky style clause (append to every pack prompt):**  
> Soft digital gouache technical illustration, medium detail, warm workbench lighting, period-plausible PC repair shop world, no legible brand logos or product names, no photoreal packshots, coherent with a historical PC shop tycoon game.

### 5.2 Era cards (New Game) — Tier S

| | |
|---|---|
| **Count** | 6 |
| **Aspect** | **`3:2` banner** (card may crop slightly; keep focal subject in center-safe ~70%) |
| **Composition** | One hero machine or shop corner + 2–4 supporting props; eye-level or slight high angle; shallow depth |
| **Safe zones** | Leave soft lower-third or side area less busy for optional CSS gradient fade under title text |
| **People** | **None** — hardware and environment only |

**Per-era brief (subject → setting → accent):**

| ID | Hero | Setting | Accent beat |
|---|---|---|---|
| `era1983` | Open beige XT-class desktop, ISA boards visible | Home garage / kitchen table, CRT, floppies, multimeter | Amber desk lamp, green CRT glow |
| `era1991` | Whitebox tower mid-build, beige case panels off | Crowded clone-shop bench, VGA monitor, component piles | Teal mouse pad or tool handle |
| `era1996` | Mid-tower with CD-ROM, modem box nearby | Busy ’90s shop, Win95-era desk chaos (abstract UI glow only) | Teal/amber mix, cardboard retail shapes |
| `era2004` | Black/silver ATX gaming-ish tower, CAT5 coil | Brighter storefront bench, fluorescent shop light | Single blue LED, blue ethernet |
| `era2013` | Clean mid-tower + 2.5" SSD on anti-static bag | Quieter shop, tablet/phone in background as small props | Cooler gray, less clutter, one plant or empty chair (squeeze) |
| `era2021` | Work-from-home tower; **empty** GPU shelf / “out of stock” energy | Modern bench, sealed generic boxes, sparse stock | Cool light, cardboard stacks, scarcity not violence |

### 5.3 Scenario cards (New Game) — Tier S

Same style and aspect as era cards; **stakes** read in props, not text.

| ID | Hero beat |
|---|---|
| `y2k-rush` | Stack of PCs with date-related sticky notes, wall calendar near 1999/2000, overtime lamp, contract folders (abstract) |
| `dotcom-survivor` | Half-empty shop, “for lease” energy next door optional, lean bench, liquidator-style bulk beige boxes |
| `flood-trader` | Modest garage, calendars/weather mood, **pallets of hard-drive boxes** (generic), quiet before the storm |
| `shortage-shop` | Empty GPU/graphics shelf, webcam boxes, tape on floor where stock should be, one carefully guarded sealed carton |

Scenarios reuse era materials (1998–2000 / 2011 / 2020) but push **narrative props** harder than sandbox era cards.

### 5.4 Shop tiers — Tier A

| Tier | Scene |
|---|---|
| Garage | Single bench, water heater/garage door hint, one CRT, chaotic but hopeful |
| Strip-mall unit | Glass storefront strip, fluorescent, small signage area (no legible shop name), 2 benches |
| Main Street storefront | Brick/window display with a built PC, cleaner front-of-house + back bench |
| Superstore | Wide floor, multiple benches, inventory shelving, brighter commercial light — still independent, not big-box logo parody |

Aspect: **`3:2`**. Same style clause; no people. Show **scale of space**, not UI floor plans.

### 5.5 Category icons — Tier A

| | |
|---|---|
| **Count** | 11 (cpu, motherboard, ram, storage, gpu, psu, case, cooling, os, peripheral, expansion) |
| **Aspect** | `1:1` |
| **Composition** | Single centered object, 10–15% padding, **transparent background** (alpha; no plate or drop shadow required) |
| **Style** | Same gouache materials, **simpler** than scenes; reads at 24–32px |
| **Color** | Neutral metal/plastic + one accent glint; works on all era skins |

Treat as a **set**: generate one “icon base” (e.g. CPU) then `image_edit` siblings for consistency.

Archetype silhouettes (not brands):

- **cpu** — ceramic/metal square package with pins or lands  
- **motherboard** — simplified ATX-ish PCB rectangle, socket square, slot lines  
- **ram** — vertical DIMM stick  
- **storage** — 3.5" HDD or 2.5" SSD brick (one icon; HDD silhouette is more timeless)  
- **gpu** — dual-slot card with fan circle(s), no logo  
- **psu** — box with grill and cable stubs  
- **case** — simple tower silhouette  
- **cooling** — fan or tower cooler  
- **os** — install media archetype (floppy → CD → USB stick montage is risky; prefer **abstract install disc + small screen glow** or era-neutral USB/disc hybrid kept simple)  
- **peripheral** — CRT front or keyboard+mouse simplified  
- **expansion** — short ISA/PCI bracket card  

### 5.6 Achievement badges — Tier A

| Approach | When |
|---|---|
| **Shared icon families (~12–16)** | Default first ship |
| Unique art for flagships | e.g. first SLI, scenario clear, lifetime bench |

| | |
|---|---|
| **Aspect** | `1:1` |
| **Shape** | **Regular hex medallion** with soft metal rim optional |
| **Locked look** | Desaturate in CSS (`filter: grayscale`) — deliver **full color unlocked** art only |
| **Motifs** | Screwdriver, first POST glow, dual GPUs, cert frame, credit card abstract, wiki book, etc. |

Reuse the master style; tighter crop; little-to-no background scenery.

### 5.7 Wiki headers & transitions — Tier B (later)

- **Article headers (20):** wide **`3:2`**, conceptual still (bus slots evolving, stack of storage media, etc.), calm museum lighting  
- **Transitions (8):** one dramatic but non-apocalyptic beat (ISA cards in a dusty bin, ATX standoffs, SSD next to 3.5" drive)  
- Still: no legible charts, no fake timelines with wrong years  

### 5.8 Explicitly out of scope for art files

- Motherboard schematic (stays CSS/SVG interactive)  
- Per-part and per-device photography  
- Staff portrait series for every random name  
- Full-page backgrounds that dim body text  

---

## 6. Prompt system

### 6.1 Structure (every prompt)

Natural prose, **2–5 sentences**, roughly:

1. **Subject** (hero object / scene)  
2. **Setting & props**  
3. **Style + lighting**  
4. **Composition / aspect intent**  
5. **Sticky style clause** (section 5.1)

Lead with the subject. Describe what *is* there, not long ban lists (the sticky clause covers the hard bans).

### 6.2 Master sticky clause (copy-paste)

```
Soft digital gouache technical illustration for a historical PC repair shop tycoon game. Medium detail, warm practical workbench lighting, lived-in shop materials (beige plastics, cardboard, tools, mild dust). Period-plausible hardware archetypes only — no legible brand logos, no trademark packaging, no photoreal product shots, no readable UI text or fake model numbers. Coherent painterly style, medium contrast, cream and warm-gray neutrals.
```

### 6.3 Consistency workflow (Imagine)

1. **Lock the look** with 1–2 hero pieces (logo, then `era1996` or `era1983` as style anchors).  
2. **Do not** regenerate the whole set from scratch each time. Use **`image_edit`** with the anchor image as reference for sibling era/scenario cards: “Same illustration style, materials, and lighting model as the reference; new scene: …”.  
3. Icons: one base icon → edit to other categories.  
4. If text appears and is wrong, **crop/cover in CSS** or regenerate with stronger “no readable text”; don’t rely on edit loops for typography.  

### 6.4 Example prompts (production-ready)

**Logo**

> A square brand emblem for an independent PC repair shop: a soldering iron tip meeting a simple copper PCB trace that suggests a small chip outline, centered on a deep warm brown field. Soft digital gouache technical illustration, restrained gold-amber highlights, no letters, no brand logos of real companies. Clean silhouette that still reads when tiny. Soft digital gouache technical illustration for a historical PC repair shop tycoon game. Medium detail, warm practical workbench lighting… *(append sticky clause)*

**Era 1983**

> An open beige home-computer desktop on a wooden garage workbench, side panel off, floppy disks and a multimeter nearby, a small CRT glowing soft green in the background. Warm amber desk lamp, cream plastics, mild dust, lived-in 1983 repair chaos, no people required. Wide banner composition with the computer centered and a quieter lower third. *(sticky clause)*

**Scenario: shortage-shop**

> A modern PC shop bench under cool light where the wall shelf for graphics cards is almost empty, tape outlines and a few sealed generic cardboard cartons left, one carefully guarded box on the counter. 2020 work-from-home era mood, mesh-case tower to the side, scarcity and patience not panic. Wide banner, center-safe focal shelf. *(sticky clause)*

**Category icon: gpu**

> A single simplified desktop graphics card viewed at a slight angle, dual-slot bracket, circular fan, generic shroud, centered on a soft cream radial background with padding. Iconic, readable small, no text, no logos. Same soft digital gouache technical illustration as the shop game’s icon set. *(sticky clause)*

---

## 7. Technical delivery (when wiring into the game)

| Spec | Recommendation |
|---|---|
| Repo path | `assets/` (e.g. `assets/eras/era1983.webp`, `assets/icons/gpu.webp`) |
| Formats | WebP preferred; PNG for logo with transparency |
| Era/scenario banners | Long edge ~1280–1600px; keep file weight modest for `file://` |
| Icons / badges | 256×256 source; display smaller in UI |
| Naming | Match data ids: `era1983`, `y2k-rush`, `Garage` / tier ids, category keys |
| Loading | Plain `<img>` or CSS `background-image`; no build step, no CDN required |
| Fail-soft | UI must work if assets missing (text cards as today) |
| Accessibility | Meaningful scenes can be `alt`’d with short era blurb; decorative icons `alt=""` |

**CSS integration notes (for UI workstream later):**

- Card image as top banner; title/blurb remain HTML  
- `object-fit: cover` with center focus  
- Optional bottom gradient using `var(--panel-bg)` so text stays readable on all era skins  
- Icons: inline next to category labels; monochrome via CSS only if needed  

---

## 8. Production order

| Phase | Deliverables | Success check |
|---|---|---|
| **0. Style lock** | Logo + 1 era card (`era1983` or `era1996`) | Looks like same world; no logos; readable at card size |
| **1. New Game pack** | Remaining 5 eras + 4 scenarios | Grid of 10 feels unified; eras distinct by props |
| **2. Utility pack** | 11 category icons | Reads at 32px; consistent camera/ground |
| **3. Progression pack** | 4 shop tiers | Scale of space obvious at a glance |
| **4. Meta pack** | Achievement icon families | Unlocked wall feels collectible |
| **5. Education pack** | Wiki headers / transitions | Optional; same style clause |

Do not start phase 5 until phases 0–1 are approved.

---

## 9. QA checklist (every image)

- [ ] Same medium (gouache/technical illustration), not a random photoreal outlier  
- [ ] No legible real-world trademarks or product names  
- [ ] No fake stats, charts, or UI that could be mistaken for game data  
- [ ] Period props match the target year band  
- [ ] Focal subject clear at ~320px wide (card thumb)  
- [ ] Medium contrast; works on cream and cool-gray page backgrounds  
- [ ] Center-safe composition for `object-fit: cover`  
- [ ] Scenario stakes readable without reading body text  
- [ ] Does not replace or confuse the CSS motherboard schematic  

---

## 10. Mapping to game systems (quick ref)

| Game surface | Asset family | Owner when integrating |
|---|---|---|
| New Game era grid | Era banners | UI (`screens.js`, CSS) |
| New Game scenarios | Scenario banners | UI |
| Header / favicon | Logo | UI (`index.html`) |
| Market / inventory / wiki filters | Category icons | UI |
| Shop tab tier card | Shop tiers | UI |
| Ledger achievements | Badge icons | UI |
| Wiki articles / news transitions | Headers (phase 5) | UI + optional data `image` keys |

DATA/ENGINE do not need art paths for phase 0–3 if UI maps ids → files.  
If DATA later gains `image: "era1983"` fields, that is a separate small contract — prefer UI-side map first to avoid blocking.

---

## 11. Style one-liner (for chat / agent prompts)

> *Circuit & Solder art: soft digital gouache technical illustrations of lived-in, period-plausible PC repair shops — warm bench light, archetype hardware, no brand logos or photoreal packshots — built for dense educational tycoon UI.*

---

## 12. Locked choices (phase 0)

| Question | Decision | Notes |
|---|---|---|
| People in era cards? | **None** | Hardware + shop environment only; no figures in era or scenario banners |
| Logo with wordmark? | **Yes — exception** | “Circuit & Solder” allowed in logo only; verify legibility before ship; all other assets stay text-free |
| Banner aspect | **3:2** | Era + scenario cards; center-safe focal for `object-fit: cover` |
| Icon ground | **Transparent** | Category icons (and badge marks) export with alpha; no cream plate |
| Achievement shape | **Hex** | Regular hex medallion; metal rim optional; locked state via CSS grayscale |

**People ban (sticky add-on for banners):** append “no people, no hands, no figures” to every era/scenario/shop-tier prompt.

---

*Style bible v1.1 — choices locked. Phase 0 complete (see §13).*

---

## 13. Phase 0 lock (shipped)

| Asset | Path | Notes |
|---|---|---|
| Logo | `assets/brand/logo-circuit-solder.jpg` | Wordmark **CIRCUIT & SOLDER** verified legible; iron + copper trace + chip emblem on warm brown |
| Era anchor | `assets/eras/era1983.jpg` | **3:2** painterly gouache bench scene; no people; use as `image_edit` reference for all other era/scenario banners |

**Rejected candidate:** a photoreal garage still (session `images/1.jpg`) — wrong medium for the pack; do not use as style reference.

**Phase 1 complete** — full New Game banner set on disk (not yet wired into UI).

### Phase 1 inventory

| ID | Path |
|---|---|
| era1983 | `assets/eras/era1983.jpg` |
| era1991 | `assets/eras/era1991.jpg` |
| era1996 | `assets/eras/era1996.jpg` |
| era2004 | `assets/eras/era2004.jpg` |
| era2013 | `assets/eras/era2013.jpg` |
| era2021 | `assets/eras/era2021.jpg` |
| y2k-rush | `assets/scenarios/y2k-rush.jpg` |
| dotcom-survivor | `assets/scenarios/dotcom-survivor.jpg` |
| flood-trader | `assets/scenarios/flood-trader.jpg` |
| shortage-shop | `assets/scenarios/shortage-shop.jpg` |

All banners **3:2**, no people, from `image_edit` on the era1983 anchor (except era1983 itself).  
**UI wiring (done):** New Game uses `assets/brand/logo-circuit-solder.jpg` in the header and `assets/eras/{id}.jpg` / `assets/scenarios/{id}.jpg` as 3:2 card banners (`js/ui/screens.js` + `css/styles.css`). Missing images fail-soft (art strip collapses).  

**Next:** Phase 2 (category icons) when ready.
