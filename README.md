# Circuit & Solder: PC Shop Tycoon

A turn-based business management game about running a computer repair & building shop
across four decades of PC history — from the 1983 home-computer boom to the 2021 GPU
shortage and beyond.

No 3D, no assembly minigames: building and repair are menu-driven decisions about
fulfilling customer requirements profitably, against a dynamic, history-driven parts
economy.

## Run it

Open `index.html` in any modern browser (works from `file://`), or serve statically:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

## Playing

- Pick a start era (1983–2021). Each day you have 8 work hours: accept job offers,
  diagnose, source parts, repair/build, buy inventory ahead of market shocks — then
  **End Day**.
- Shop is open Mon–Sat. Rent hits on the 1st. Go cash-negative and you have 14 days
  to recover before bankruptcy.
- Grow reputation and prestige to unlock business contracts, enthusiast clientele,
  and wholesale discounts; upgrade the shop from garage to superstore.
- Match customer brand tastes for pay bonuses, push into overtime when a deadline
  looms (tomorrow starts short), strip broken machines for parts, and browse the
  in-game **Wiki** — 600+ real components with period-accurate historical notes that
  unlock as the calendar advances.
- Era-flavored generative music and sound effects (all synthesized in-browser, no
  assets) with mute toggles in the header; UI auto-scales to your window.

## Development

- `SPEC.md` — full architecture spec (data schemas, engine API, formulas).
- Plain vanilla JS, no build step. Data in `js/data/`, game logic in `js/engine/`,
  rendering in `js/ui/`.
- Headless checks: `node tools/validate-data.js && node tools/sim-test.js`
