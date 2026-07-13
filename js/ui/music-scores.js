/* ====================================================================== *
 * Circuit & Solder — Era Soundtrack (v0.8)
 *
 * OVERSEER-AUTHORED CONTENT — these compositions were written by the
 * project overseer. Subagents: integrate, don't rewrite. Tuning synth
 * params (§18 voices) is the audio engine's job; the NOTES are the score.
 *
 * The soundtrack follows PC audio history — the same idea as the era
 * skins: what you hear is what period hardware could play.
 *   early  : PC-speaker style — ONE square voice; "chords" are faked by
 *            interleaving bass notes and arpeggios in a single line.
 *   90s    : AdLib/OPL2-style 2-operator FM — FM bass, FM electric piano,
 *            FM bells, noise hats.
 *   00s    : subtractive synthesis — saw pads/leads through a lowpass,
 *            the software-synth & tracker era.
 *   modern : soft pads — detuned saws, slow attacks, gentle delay.
 *
 * Format (SPEC §18.2):
 *   note tuple: [bar, beat, note, durBeats, vel]   bar 0-based; beat 0-based
 *   floats in 4/4; note names use sharps only ("A#2"); vel 0..1.
 *   Chord-mode channels give `chords` (one array of note names per bar,
 *   low→high) and a `mode` the engine expands deterministically.
 * ====================================================================== */
(function (root) {
  'use strict';
  var UI = root.UI = root.UI || {};
  var M = UI.MUSIC_SCORES = [];

  /* ------------------------------------------------------------------ *
   * EARLY ERA — PC speaker (single voice; mono is enforced by the engine)
   * ------------------------------------------------------------------ */

  /* 1. "Power-On Self Test" — C major, bright and busy, the shop opening
   * up. Classic beeper trick: root notes on the strong beats, arpeggio
   * sparkle between, one voice doing the work of three. */
  M.push({
    id: 'post-jingle', name: 'Power-On Self Test', eraSkin: 'early',
    bpm: 116, bars: 8,
    channels: [{
      voice: 'beeper', gain: 0.30, mode: 'notes',
      notes: [
        // bar 1 — C
        [0, 0.0, 'C3', 0.5, 0.9], [0, 0.5, 'E4', 0.5, 0.6], [0, 1.0, 'G4', 0.5, 0.7],
        [0, 1.5, 'E4', 0.5, 0.6], [0, 2.0, 'C4', 0.5, 0.8], [0, 2.5, 'E4', 0.5, 0.6],
        [0, 3.0, 'G4', 0.5, 0.7], [0, 3.5, 'C5', 0.5, 0.8],
        // bar 2 — Am
        [1, 0.0, 'A2', 0.5, 0.9], [1, 0.5, 'C4', 0.5, 0.6], [1, 1.0, 'E4', 0.5, 0.7],
        [1, 1.5, 'C4', 0.5, 0.6], [1, 2.0, 'A3', 0.5, 0.8], [1, 2.5, 'C4', 0.5, 0.6],
        [1, 3.0, 'E4', 0.5, 0.7], [1, 3.5, 'A4', 0.5, 0.8],
        // bar 3 — F
        [2, 0.0, 'F3', 0.5, 0.9], [2, 0.5, 'A3', 0.5, 0.6], [2, 1.0, 'C4', 0.5, 0.7],
        [2, 1.5, 'F4', 0.5, 0.7], [2, 2.0, 'A4', 0.5, 0.8], [2, 2.5, 'F4', 0.5, 0.6],
        [2, 3.0, 'C4', 0.5, 0.6], [2, 3.5, 'A3', 0.5, 0.6],
        // bar 4 — G (lift into the repeat)
        [3, 0.0, 'G3', 0.5, 0.9], [3, 0.5, 'B3', 0.5, 0.6], [3, 1.0, 'D4', 0.5, 0.7],
        [3, 1.5, 'G4', 0.5, 0.7], [3, 2.0, 'B4', 0.5, 0.8], [3, 2.5, 'G4', 0.5, 0.6],
        [3, 3.0, 'D4', 0.5, 0.6], [3, 3.5, 'B3', 0.5, 0.6],
        // bar 5 — C (broken-octave sparkle)
        [4, 0.0, 'C3', 0.5, 0.9], [4, 0.5, 'G4', 0.5, 0.6], [4, 1.0, 'E4', 0.5, 0.6],
        [4, 1.5, 'G4', 0.5, 0.6], [4, 2.0, 'C5', 0.5, 0.85], [4, 2.5, 'G4', 0.5, 0.6],
        [4, 3.0, 'E4', 0.5, 0.6], [4, 3.5, 'G4', 0.5, 0.6],
        // bar 6 — Am
        [5, 0.0, 'A2', 0.5, 0.9], [5, 0.5, 'E4', 0.5, 0.6], [5, 1.0, 'C4', 0.5, 0.6],
        [5, 1.5, 'E4', 0.5, 0.6], [5, 2.0, 'A4', 0.5, 0.85], [5, 2.5, 'E4', 0.5, 0.6],
        [5, 3.0, 'C4', 0.5, 0.6], [5, 3.5, 'E4', 0.5, 0.6],
        // bar 7 — F | G (two beats each, climbing)
        [6, 0.0, 'F3', 0.5, 0.9], [6, 0.5, 'A4', 0.5, 0.7], [6, 1.0, 'C5', 0.5, 0.8],
        [6, 1.5, 'A4', 0.5, 0.7], [6, 2.0, 'G3', 0.5, 0.9], [6, 2.5, 'B4', 0.5, 0.7],
        [6, 3.0, 'D5', 0.5, 0.8], [6, 3.5, 'B4', 0.5, 0.7],
        // bar 8 — C cadence, let it ring
        [7, 0.0, 'C3', 0.5, 0.9], [7, 0.5, 'C4', 0.5, 0.7], [7, 1.0, 'E4', 0.5, 0.75],
        [7, 1.5, 'G4', 0.5, 0.8], [7, 2.0, 'C5', 1.5, 0.9], [7, 3.5, 'G4', 0.5, 0.5]
      ]
    }],
    drums: 'none'
  });

  /* 2. "Amber Monitor" — A minor, slower, wistful; late night in the
   * garage with one machine humming. Longer notes up top, walking low
   * notes underneath — still one voice. */
  M.push({
    id: 'amber-monitor', name: 'Amber Monitor', eraSkin: 'early',
    bpm: 92, bars: 8,
    channels: [{
      voice: 'beeper', gain: 0.28, mode: 'notes',
      notes: [
        // bar 1 — Am
        [0, 0.0, 'A2', 1.0, 0.85], [0, 1.0, 'E4', 1.0, 0.7], [0, 2.0, 'A4', 1.5, 0.8],
        [0, 3.5, 'B4', 0.5, 0.6],
        // bar 2 — F
        [1, 0.0, 'F3', 1.0, 0.85], [1, 1.0, 'C5', 1.0, 0.75], [1, 2.0, 'A4', 1.0, 0.7],
        [1, 3.0, 'G4', 0.5, 0.6], [1, 3.5, 'A4', 0.5, 0.6],
        // bar 3 — C
        [2, 0.0, 'C3', 1.0, 0.85], [2, 1.0, 'G4', 1.0, 0.7], [2, 2.0, 'E4', 1.5, 0.75],
        [2, 3.5, 'D4', 0.5, 0.55],
        // bar 4 — G
        [3, 0.0, 'G2', 1.0, 0.85], [3, 1.0, 'D4', 1.0, 0.7], [3, 2.0, 'B3', 1.0, 0.65],
        [3, 3.0, 'D4', 1.0, 0.65],
        // bar 5 — Am
        [4, 0.0, 'A2', 1.0, 0.85], [4, 1.0, 'C4', 0.5, 0.6], [4, 1.5, 'E4', 0.5, 0.65],
        [4, 2.0, 'A4', 2.0, 0.8],
        // bar 6 — F
        [5, 0.0, 'F3', 1.0, 0.85], [5, 1.0, 'A4', 0.5, 0.7], [5, 1.5, 'C5', 0.5, 0.75],
        [5, 2.0, 'D5', 1.5, 0.8], [5, 3.5, 'C5', 0.5, 0.6],
        // bar 7 — E major (the minor key's dominant — the ache)
        [6, 0.0, 'E3', 1.0, 0.85], [6, 1.0, 'B4', 1.0, 0.75], [6, 2.0, 'G#4', 1.5, 0.75],
        [6, 3.5, 'E4', 0.5, 0.55],
        // bar 8 — Am resolve, falling home
        [7, 0.0, 'A2', 1.0, 0.85], [7, 1.0, 'C5', 0.5, 0.7], [7, 1.5, 'B4', 0.5, 0.65],
        [7, 2.0, 'A4', 2.0, 0.8]
      ]
    }],
    drums: 'none'
  });

  /* ------------------------------------------------------------------ *
   * 90s ERA — OPL2-style FM
   * ------------------------------------------------------------------ */

  /* 3. "Strip Mall Sunrise" — F major seventh-chord changes, walking FM
   * bass, e-piano comping on the offbeats, a small bell hook. Opening
   * the shop with coffee. */
  M.push({
    id: 'strip-mall-sunrise', name: 'Strip Mall Sunrise', eraSkin: '90s',
    bpm: 96, bars: 8,
    channels: [
      { voice: 'fmBass', gain: 0.34, mode: 'notes',
        notes: [
          [0, 0.0, 'F2', 1.0, 0.9], [0, 1.5, 'C3', 0.5, 0.6], [0, 2.0, 'F2', 1.0, 0.8], [0, 3.0, 'A2', 0.5, 0.6], [0, 3.5, 'C3', 0.5, 0.65],
          [1, 0.0, 'D2', 1.0, 0.9], [1, 1.5, 'A2', 0.5, 0.6], [1, 2.0, 'D3', 1.0, 0.8], [1, 3.0, 'C3', 0.5, 0.6], [1, 3.5, 'A2', 0.5, 0.6],
          [2, 0.0, 'G2', 1.0, 0.9], [2, 1.5, 'D3', 0.5, 0.6], [2, 2.0, 'G2', 1.0, 0.8], [2, 3.0, 'A#2', 0.5, 0.6], [2, 3.5, 'D3', 0.5, 0.65],
          [3, 0.0, 'C2', 1.0, 0.9], [3, 1.5, 'G2', 0.5, 0.6], [3, 2.0, 'C3', 1.0, 0.8], [3, 3.0, 'A#2', 0.5, 0.6], [3, 3.5, 'G2', 0.5, 0.6],
          [4, 0.0, 'F2', 1.0, 0.9], [4, 1.5, 'C3', 0.5, 0.6], [4, 2.0, 'F2', 1.0, 0.8], [4, 3.0, 'A2', 0.5, 0.6], [4, 3.5, 'C3', 0.5, 0.65],
          [5, 0.0, 'D2', 1.0, 0.9], [5, 1.5, 'A2', 0.5, 0.6], [5, 2.0, 'D3', 1.0, 0.8], [5, 3.0, 'C3', 0.5, 0.6], [5, 3.5, 'A2', 0.5, 0.6],
          [6, 0.0, 'G2', 1.0, 0.9], [6, 1.5, 'D3', 0.5, 0.6], [6, 2.0, 'G2', 1.0, 0.8], [6, 3.0, 'A2', 0.5, 0.65], [6, 3.5, 'B2', 0.5, 0.7],
          [7, 0.0, 'C2', 1.0, 0.9], [7, 1.0, 'C3', 0.5, 0.6], [7, 1.5, 'A#2', 0.5, 0.6], [7, 2.0, 'G2', 1.0, 0.75], [7, 3.0, 'E2', 0.5, 0.6], [7, 3.5, 'C2', 0.5, 0.7]
        ] },
      { voice: 'fmEP', gain: 0.22, mode: 'offbeat',
        chords: [
          ['A3', 'C4', 'E4'],        // Fmaj7 upper structure
          ['F3', 'A3', 'C4'],        // Dm7
          ['A#3', 'D4', 'F4'],       // Gm7
          ['G3', 'A#3', 'E4'],       // C7
          ['A3', 'C4', 'E4'],
          ['F3', 'A3', 'C4'],
          ['A#3', 'D4', 'F4'],
          ['G3', 'A#3', 'E4']
        ] },
      { voice: 'fmBell', gain: 0.16, mode: 'notes',
        notes: [
          [0, 3.5, 'A4', 0.5, 0.6],
          [1, 0.0, 'F4', 1.0, 0.7], [1, 1.0, 'E4', 0.5, 0.55], [1, 1.5, 'D4', 1.5, 0.6],
          [3, 2.0, 'E4', 0.5, 0.55], [3, 2.5, 'G4', 0.5, 0.6], [3, 3.0, 'A#4', 0.5, 0.65], [3, 3.5, 'A4', 0.5, 0.6],
          [5, 0.0, 'F4', 1.0, 0.7], [5, 1.0, 'A4', 1.0, 0.7], [5, 2.0, 'C5', 1.5, 0.75],
          [7, 0.0, 'A4', 0.5, 0.6], [7, 0.5, 'G4', 0.5, 0.55], [7, 1.0, 'E4', 1.0, 0.6], [7, 2.0, 'F4', 2.0, 0.7]
        ] }
    ],
    drums: 'hats8'
  });

  /* 4. "Beige Boxes" — D dorian groove; the busy clone-bench afternoon.
   * Riffy FM bass, e-piano stabs answering. */
  M.push({
    id: 'beige-boxes', name: 'Beige Boxes', eraSkin: '90s',
    bpm: 104, bars: 8,
    channels: [
      { voice: 'fmBass', gain: 0.34, mode: 'notes',
        notes: [
          [0, 0.0, 'D2', 0.5, 0.9], [0, 0.5, 'D2', 0.5, 0.5], [0, 1.5, 'D3', 0.5, 0.7], [0, 2.0, 'C3', 0.5, 0.6], [0, 2.5, 'A2', 0.5, 0.6], [0, 3.5, 'F2', 0.5, 0.65],
          [1, 0.0, 'D2', 0.5, 0.9], [1, 0.5, 'D2', 0.5, 0.5], [1, 1.5, 'F2', 0.5, 0.65], [1, 2.0, 'G2', 0.5, 0.7], [1, 3.0, 'A2', 1.0, 0.75],
          [2, 0.0, 'A#1', 0.5, 0.9], [2, 0.5, 'A#1', 0.5, 0.5], [2, 1.5, 'A#2', 0.5, 0.7], [2, 2.0, 'A2', 0.5, 0.6], [2, 2.5, 'F2', 0.5, 0.6], [2, 3.5, 'D2', 0.5, 0.65],
          [3, 0.0, 'G2', 0.5, 0.9], [3, 0.5, 'G2', 0.5, 0.5], [3, 1.5, 'A#2', 0.5, 0.65], [3, 2.0, 'A2', 0.5, 0.6], [3, 2.5, 'G2', 0.5, 0.6], [3, 3.0, 'A2', 1.0, 0.7],
          [4, 0.0, 'D2', 0.5, 0.9], [4, 0.5, 'D2', 0.5, 0.5], [4, 1.5, 'D3', 0.5, 0.7], [4, 2.0, 'C3', 0.5, 0.6], [4, 2.5, 'A2', 0.5, 0.6], [4, 3.5, 'F2', 0.5, 0.65],
          [5, 0.0, 'D2', 0.5, 0.9], [5, 0.5, 'D2', 0.5, 0.5], [5, 1.5, 'F2', 0.5, 0.65], [5, 2.0, 'G2', 0.5, 0.7], [5, 3.0, 'A2', 1.0, 0.75],
          [6, 0.0, 'A#1', 0.5, 0.9], [6, 0.5, 'A#1', 0.5, 0.5], [6, 1.5, 'A#2', 0.5, 0.7], [6, 2.0, 'C3', 0.5, 0.7], [6, 2.5, 'D3', 0.5, 0.75],
          [7, 0.0, 'A2', 0.5, 0.9], [7, 1.0, 'G2', 0.5, 0.7], [7, 1.5, 'F2', 0.5, 0.65], [7, 2.0, 'E2', 0.5, 0.6], [7, 2.5, 'D2', 1.5, 0.8]
        ] },
      { voice: 'fmEP', gain: 0.20, mode: 'notes',
        notes: [
          [0, 1.0, 'F4', 0.5, 0.6], [0, 3.0, 'E4', 0.5, 0.55],
          [1, 1.0, 'F4', 0.5, 0.6], [1, 2.5, 'G4', 0.5, 0.6], [1, 3.5, 'A4', 0.5, 0.65],
          [2, 1.0, 'F4', 0.5, 0.6], [2, 3.0, 'D4', 0.5, 0.55],
          [3, 1.0, 'D4', 0.5, 0.55], [3, 2.5, 'E4', 0.5, 0.6], [3, 3.5, 'F4', 0.5, 0.6],
          [4, 1.0, 'A4', 0.5, 0.65], [4, 3.0, 'G4', 0.5, 0.6],
          [5, 1.0, 'A4', 0.5, 0.65], [5, 2.5, 'C5', 0.5, 0.7], [5, 3.5, 'A4', 0.5, 0.6],
          [6, 1.0, 'F4', 0.5, 0.6], [6, 2.5, 'G4', 0.5, 0.65], [6, 3.5, 'A4', 0.5, 0.7],
          [7, 0.5, 'F4', 0.5, 0.6], [7, 1.5, 'E4', 0.5, 0.55], [7, 2.5, 'D4', 1.0, 0.65]
        ] }
    ],
    drums: 'hats8'
  });

  /* ------------------------------------------------------------------ *
   * 00s ERA — subtractive
   * ------------------------------------------------------------------ */

  /* 5. "LAN Night" — A minor; the night before the LAN party, cases open,
   * cables everywhere. Pulsing sub, plucky saw lead. */
  M.push({
    id: 'lan-night', name: 'LAN Night', eraSkin: '00s',
    bpm: 100, bars: 8,
    channels: [
      { voice: 'subBass', gain: 0.30, mode: 'root8',
        chords: [['A1'], ['F1'], ['C2'], ['G1'], ['A1'], ['F1'], ['C2'], ['G1']] },
      { voice: 'sawPad', gain: 0.14, mode: 'pad',
        chords: [
          ['A2', 'E3', 'A3', 'C4'], ['F2', 'C3', 'F3', 'A3'],
          ['C3', 'G3', 'C4', 'E4'], ['G2', 'D3', 'G3', 'B3'],
          ['A2', 'E3', 'A3', 'C4'], ['F2', 'C3', 'F3', 'A3'],
          ['C3', 'G3', 'C4', 'E4'], ['G2', 'D3', 'G3', 'B3']
        ] },
      { voice: 'sawLead', gain: 0.16, mode: 'notes',
        notes: [
          [0, 0.0, 'E4', 0.5, 0.7], [0, 0.5, 'A4', 0.5, 0.65], [0, 1.0, 'C5', 1.0, 0.75], [0, 2.5, 'B4', 0.5, 0.6], [0, 3.0, 'A4', 1.0, 0.65],
          [1, 0.5, 'A4', 0.5, 0.6], [1, 1.0, 'C5', 1.0, 0.7], [1, 2.0, 'F5', 1.0, 0.8], [1, 3.0, 'E5', 1.0, 0.7],
          [2, 0.0, 'E5', 1.5, 0.75], [2, 1.5, 'D5', 0.5, 0.6], [2, 2.0, 'C5', 1.0, 0.65], [2, 3.0, 'G4', 1.0, 0.6],
          [3, 0.0, 'B4', 1.5, 0.7], [3, 1.5, 'A4', 0.5, 0.6], [3, 2.0, 'G4', 1.0, 0.6], [3, 3.0, 'B4', 1.0, 0.65],
          [4, 0.0, 'A4', 2.0, 0.7], [4, 2.5, 'E4', 0.5, 0.55], [4, 3.0, 'A4', 1.0, 0.65],
          [5, 0.0, 'C5', 1.0, 0.7], [5, 1.5, 'D5', 0.5, 0.65], [5, 2.0, 'F5', 2.0, 0.8],
          [6, 0.0, 'E5', 1.0, 0.75], [6, 1.0, 'C5', 0.5, 0.65], [6, 1.5, 'D5', 0.5, 0.65], [6, 2.0, 'E5', 1.0, 0.7], [6, 3.0, 'G5', 1.0, 0.8],
          [7, 0.0, 'F5', 0.5, 0.7], [7, 0.5, 'E5', 0.5, 0.65], [7, 1.0, 'D5', 1.0, 0.65], [7, 2.0, 'B4', 2.0, 0.7]
        ] }
    ],
    drums: 'hats8'
  });

  /* 6. "Silver & Blue" — E minor; steadier and cooler, the storefront
   * era. Up-down arps over slow pads. */
  M.push({
    id: 'silver-and-blue', name: 'Silver & Blue', eraSkin: '00s',
    bpm: 92, bars: 8,
    channels: [
      { voice: 'subBass', gain: 0.28, mode: 'rootFifth8',
        chords: [['E1'], ['C2'], ['G1'], ['D2'], ['E1'], ['C2'], ['A1'], ['B1']] },
      { voice: 'sawPad', gain: 0.13, mode: 'pad',
        chords: [
          ['E2', 'B2', 'E3', 'G3'], ['C3', 'G3', 'C4', 'E4'],
          ['G2', 'D3', 'G3', 'B3'], ['D3', 'A3', 'D4', 'F#4'],
          ['E2', 'B2', 'E3', 'G3'], ['C3', 'G3', 'C4', 'E4'],
          ['A2', 'E3', 'A3', 'C4'], ['B2', 'F#3', 'B3', 'D#4']
        ] },
      { voice: 'bellArp', gain: 0.15, mode: 'arpUpDown8',
        chords: [
          ['E4', 'G4', 'B4', 'E5'], ['E4', 'G4', 'C5', 'E5'],
          ['D4', 'G4', 'B4', 'D5'], ['D4', 'F#4', 'A4', 'D5'],
          ['E4', 'G4', 'B4', 'E5'], ['E4', 'G4', 'C5', 'E5'],
          ['E4', 'A4', 'C5', 'E5'], ['D#4', 'F#4', 'B4', 'D#5']
        ] }
    ],
    drums: 'none'
  });

  /* ------------------------------------------------------------------ *
   * MODERN ERA — soft pads
   * ------------------------------------------------------------------ */

  /* 7. "Mesh & Glass" — lydian-leaning C major; the quiet, tidy modern
   * shop. Slow pads, a high bell arp like case lighting. */
  M.push({
    id: 'mesh-and-glass', name: 'Mesh & Glass', eraSkin: 'modern',
    bpm: 72, bars: 8,
    channels: [
      { voice: 'subBass', gain: 0.24, mode: 'whole',
        chords: [['C2'], ['A1'], ['F1'], ['G1'], ['C2'], ['A1'], ['D2'], ['G1']] },
      { voice: 'softPad', gain: 0.16, mode: 'pad',
        chords: [
          ['C3', 'E3', 'G3', 'B3'],  // Cmaj7
          ['A2', 'E3', 'G3', 'B3'],  // Am9 flavor
          ['F2', 'C3', 'E3', 'A3'],  // Fmaj7
          ['G2', 'D3', 'F#3', 'B3'], // G with a lydian wink
          ['C3', 'E3', 'G3', 'B3'],
          ['A2', 'E3', 'G3', 'B3'],
          ['D3', 'F#3', 'A3', 'C4'], // D7 borrowed brightness
          ['G2', 'D3', 'G3', 'B3']
        ] },
      { voice: 'bellArp', gain: 0.10, mode: 'arp8',
        chords: [
          ['E5', 'G5', 'B5'], ['E5', 'G5', 'B5'],
          ['E5', 'A5', 'C6'], ['D5', 'G5', 'B5'],
          ['E5', 'G5', 'B5'], ['E5', 'G5', 'B5'],
          ['F#5', 'A5', 'C6'], ['D5', 'G5', 'B5']
        ] }
    ],
    drums: 'none'
  });

  /* 8. "Closing Time" — descending lofi changes; lights off, one last
   * burn-in still running. Sparse piano-ish line, soft kit. */
  M.push({
    id: 'closing-time', name: 'Closing Time', eraSkin: 'modern',
    bpm: 66, bars: 8,
    channels: [
      { voice: 'subBass', gain: 0.24, mode: 'whole',
        chords: [['F1'], ['E1'], ['D1'], ['C1'], ['F1'], ['E1'], ['D1'], ['G1']] },
      { voice: 'softPad', gain: 0.15, mode: 'pad',
        chords: [
          ['F2', 'A2', 'C3', 'E3'],  // Fmaj7
          ['E2', 'G2', 'B2', 'D3'],  // Em7
          ['D2', 'F2', 'A2', 'C3'],  // Dm7
          ['C2', 'E2', 'G2', 'B2'],  // Cmaj7
          ['F2', 'A2', 'C3', 'E3'],
          ['E2', 'G2', 'B2', 'D3'],
          ['D2', 'F2', 'A2', 'C3'],
          ['G2', 'B2', 'D3', 'F3']   // G7 turnaround
        ] },
      { voice: 'fmEP', gain: 0.13, mode: 'notes',
        notes: [
          [0, 1.0, 'A3', 1.0, 0.5], [0, 2.5, 'C4', 1.5, 0.55],
          [1, 1.0, 'B3', 1.5, 0.5], [1, 3.0, 'G3', 1.0, 0.45],
          [2, 0.5, 'A3', 1.0, 0.5], [2, 2.0, 'F3', 2.0, 0.5],
          [3, 1.0, 'E3', 1.0, 0.45], [3, 2.5, 'G3', 1.5, 0.5],
          [4, 1.0, 'C4', 1.0, 0.55], [4, 2.5, 'E4', 1.5, 0.6],
          [5, 1.0, 'D4', 1.5, 0.55], [5, 3.0, 'B3', 1.0, 0.5],
          [6, 0.5, 'C4', 1.5, 0.55], [6, 2.5, 'A3', 1.5, 0.5],
          [7, 1.0, 'B3', 1.0, 0.5], [7, 2.0, 'D4', 2.0, 0.55]
        ] }
    ],
    drums: 'lofiKit'
  });

})(typeof window !== 'undefined' ? window : globalThis);
