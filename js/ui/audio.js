/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/audio.js (v3, SPEC §9.8 + §18.2)
 * All-WebAudio synthesized audio: zero external assets (CSP / file:// safe).
 *
 *  - SFX: click, accept, decline, complete (cash register), error,
 *    endday chime, callback sting, mishap, purchase. Short & subtle.
 *  - §18.2 era soundtrack: plays the OVERSEER-AUTHORED scores in
 *    js/ui/music-scores.js (loaded before this file) through voices that
 *    honestly recreate each era's synthesis technique:
 *      early  — PC-speaker: one plain square, MONO ENFORCED (new note cuts
 *               the previous — authentic beeper behavior).
 *      90s    — OPL2-style 2-operator FM (sine modulator wired into the
 *               carrier's frequency via a GainNode).
 *      00s    — subtractive saws through lowpass filters.
 *      modern — detuned soft pads + gentle feedback delay.
 *    Scores alternate on loop end; era-skin changes crossfade ~2s.
 *  - Testability (§18.2 binding): UI.audio.renderScore(scoreId, offlineCtx)
 *    renders any score headlessly into an OfflineAudioContext and returns
 *    the startRendering() promise. UI.audio.scoreDuration(scoreId) gives the
 *    exact loop length; UI.audio.debugScoreEvents(scoreId) exposes the
 *    deterministic expansion for tests (early-mono assertions etc.).
 *  - AudioContext is created on the FIRST pointerdown only (autoplay policy).
 *  - Settings persist in localStorage["cst-audio"] (never in the game save).
 * ========================================================================== */
(function () {
  'use strict';

  var UI = window.UI = window.UI || {};
  var A = UI.audio = UI.audio || {};

  var KEY = 'cst-audio';
  var settings = {
    music: true,
    sfx: true,
    musicVol: 0.15,   // §9.8 default
    sfxVol: 0.5       // §9.8 default
  };

  var ctx = null;           // AudioContext (lazy, first gesture)
  var sfxBus = null;        // GainNode for SFX
  var musicBus = null;      // GainNode for music
  var gestureSeen = false;

  /* ------------------------------------------------------------------ *
   * Settings persistence
   * ------------------------------------------------------------------ */

  function loadSettings() {
    try {
      if (typeof localStorage === 'undefined') return;
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (typeof o.music === 'boolean') settings.music = o.music;
        if (typeof o.sfx === 'boolean') settings.sfx = o.sfx;
        if (typeof o.musicVol === 'number') settings.musicVol = clamp01(o.musicVol);
        if (typeof o.sfxVol === 'number') settings.sfxVol = clamp01(o.sfxVol);
      }
    } catch (e) { /* corrupted or unavailable storage — keep defaults */ }
  }

  function saveSettings() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
  }

  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

  /* ------------------------------------------------------------------ *
   * Context bootstrap (first user gesture only)
   * ------------------------------------------------------------------ */

  function ensureCtx() {
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      sfxBus = ctx.createGain();
      sfxBus.gain.value = settings.sfxVol;
      sfxBus.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = settings.music ? settings.musicVol : 0;
      musicBus.connect(ctx.destination);
    } catch (e2) { ctx = null; }
    return ctx;
  }

  function onFirstGesture() {
    if (gestureSeen) return;
    gestureSeen = true;
    if (ensureCtx() && settings.music) startMusic();
  }

  /* ------------------------------------------------------------------ *
   * SFX synthesis helpers
   * ------------------------------------------------------------------ */

  /** One enveloped oscillator note routed to the SFX bus. */
  function tone(freq, opts) {
    if (!ctx || !sfxBus) return;
    opts = opts || {};
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var vol = (opts.vol !== undefined ? opts.vol : 0.25);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** A short filtered noise burst routed to the SFX bus. */
  function noiseBurst(opts) {
    if (!ctx || !sfxBus) return;
    opts = opts || {};
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.08;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filterType || 'bandpass';
    filt.frequency.value = opts.freq || 3000;
    filt.Q.value = opts.q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol !== undefined ? opts.vol : 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  var SFX = {
    click: function () { tone(880, { type: 'square', dur: 0.035, vol: 0.06 }); },
    accept: function () {
      tone(523.25, { type: 'triangle', dur: 0.09, vol: 0.16 });
      tone(783.99, { type: 'triangle', dur: 0.12, vol: 0.16, delay: 0.08 });
    },
    decline: function () { tone(392, { type: 'triangle', dur: 0.16, vol: 0.12, slideTo: 200 }); },
    complete: function () { /* cash register: drawer rattle + bell dyad */
      noiseBurst({ dur: 0.05, freq: 5200, vol: 0.1 });
      noiseBurst({ dur: 0.06, freq: 2600, vol: 0.08, delay: 0.05 });
      tone(1318.5, { type: 'triangle', dur: 0.22, vol: 0.14, delay: 0.07 });
      tone(1760, { type: 'triangle', dur: 0.28, vol: 0.11, delay: 0.09 });
    },
    error: function () { tone(130, { type: 'sawtooth', dur: 0.17, vol: 0.09, slideTo: 90 }); },
    endday: function () { /* soft chime up */
      tone(523.25, { dur: 0.14, vol: 0.12 });
      tone(659.25, { dur: 0.14, vol: 0.12, delay: 0.11 });
      tone(783.99, { dur: 0.2, vol: 0.12, delay: 0.22 });
    },
    callback: function () { /* uneasy tritone sting */
      tone(440, { type: 'triangle', dur: 0.24, vol: 0.11 });
      tone(622.25, { type: 'triangle', dur: 0.3, vol: 0.1, delay: 0.05 });
    },
    mishap: function () {
      tone(300, { type: 'sawtooth', dur: 0.28, vol: 0.12, slideTo: 70 });
      noiseBurst({ dur: 0.16, freq: 900, vol: 0.1, delay: 0.03 });
    },
    purchase: function () { /* small coin blip */
      tone(987.77, { type: 'triangle', dur: 0.05, vol: 0.1 });
      tone(1318.5, { type: 'triangle', dur: 0.09, vol: 0.1, delay: 0.045 });
    }
  };

  /** Play a named sound effect (no-op before first gesture or when muted). */
  A.sfx = function (name) {
    if (!settings.sfx || !ctx || !sfxBus) return;
    var fn = SFX[name];
    if (!fn) return;
    try { fn(); } catch (e) { /* never let audio break the UI */ }
  };

  /* ================================================================== *
   * §18.2 — THE ERA SYNTH ENGINE
   * Deterministic score expansion + per-era voice synthesis. Everything
   * below is (ctx, destination)-parametrized so an OfflineAudioContext
   * renders identically to live playback.
   * ================================================================== */

  var SCORE_MASTER = 0.7;   // headroom: keeps offline peaks well under 0.9

  /* ---- note names → frequency (sharps only, A4 = 440) ---- */
  var SEMIS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function noteToFreq(name) {
    var m = /^([A-G]#?)(-?\d)$/.exec(String(name || ''));
    if (!m) return 0;
    var midi = 12 * (parseInt(m[2], 10) + 1) + SEMIS[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function findScore(id) {
    var list = UI.MUSIC_SCORES || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function scoresForSkin(skin) {
    return (UI.MUSIC_SCORES || []).filter(function (s) { return s && s.eraSkin === skin; });
  }

  /** Exact loop length in seconds: bars × 4 beats × 60/bpm. */
  A.scoreDuration = function (scoreId) {
    var s = findScore(scoreId);
    return s ? s.bars * 4 * 60 / s.bpm : 0;
  };

  /* ---- deterministic mode expansion (§18.2 table) ---- */

  /** Per-voice release tails (s) — events are clipped so t+dur+release
   * never crosses the loop boundary (keeps the rendered duration exact). */
  var VOICE_REL = {
    beeper: 0.02, fmBass: 0.06, fmEP: 0.1, fmBell: 0.25,
    sawLead: 0.08, sawPad: 0.3, softPad: 0.5, subBass: 0.06, bellArp: 0.1,
    kick: 0.02, snare: 0.02, hat: 0.01
  };

  function chordAt(chords, bar) {
    if (!chords || !chords.length) return null;
    return chords[bar % chords.length];
  }

  /** Expand one channel into [{voice, gain, freq, t, dur, vel}] (t/dur in
   * SECONDS from loop start). Pure + deterministic. */
  function expandChannel(score, ch) {
    var spb = 60 / score.bpm;         // seconds per beat
    var out = [];
    function push(bar, beat, freq, durBeats, vel) {
      if (!freq) return;
      out.push({ voice: ch.voice, gain: ch.gain, freq: freq,
                 t: (bar * 4 + beat) * spb, dur: durBeats * spb, vel: vel });
    }
    var b, q, i, chord;
    if (ch.mode === 'notes') {
      (ch.notes || []).forEach(function (n) {
        push(n[0], n[1], noteToFreq(n[2]), n[3], n[4]);
      });
      return out;
    }
    for (b = 0; b < score.bars; b++) {
      chord = chordAt(ch.chords, b);
      if (!chord || !chord.length) continue;
      var n0 = noteToFreq(chord[0]);
      if (ch.mode === 'pad') {
        for (i = 0; i < chord.length; i++) push(b, 0, noteToFreq(chord[i]), 4, 0.75);
      } else if (ch.mode === 'whole') {
        push(b, 0, n0, 4, 0.8);
      } else if (ch.mode === 'offbeat') {
        for (i = 0; i < chord.length; i++) {
          push(b, 1, noteToFreq(chord[i]), 0.35, 0.7);
          push(b, 3, noteToFreq(chord[i]), 0.35, 0.7);
        }
      } else if (ch.mode === 'arp8') {
        for (q = 0; q < 8; q++) {
          push(b, q * 0.5, noteToFreq(chord[q % chord.length]), 0.45, q === 0 ? 0.75 : 0.58);
        }
      } else if (ch.mode === 'arpUpDown8') {
        var n = chord.length;
        var period = n > 1 ? (2 * n - 2) : 1;
        for (q = 0; q < 8; q++) {
          var k = q % period;
          var idx = (n > 1 && k >= n) ? (2 * n - 2 - k) : k;
          push(b, q * 0.5, noteToFreq(chord[idx]), 0.45, q === 0 ? 0.72 : 0.56);
        }
      } else if (ch.mode === 'root8') {
        for (q = 0; q < 8; q++) {
          push(b, q * 0.5, n0, 0.4, q === 0 ? 0.85 : (q === 4 ? 0.75 : 0.6));
        }
      } else if (ch.mode === 'rootFifth8') {
        var fifth = n0 * Math.pow(2, 7 / 12);
        for (q = 0; q < 8; q++) {
          push(b, q * 0.5, (q % 2 === 0) ? n0 : fifth, 0.4, q === 0 ? 0.85 : 0.6);
        }
      }
    }
    return out;
  }

  /** Drum events for a score (voice: kick/snare/hat; freq unused). */
  function expandDrums(score) {
    var spb = 60 / score.bpm;
    var out = [];
    function push(voice, bar, beat, vol) {
      out.push({ voice: voice, gain: vol, freq: 0, t: (bar * 4 + beat) * spb, dur: 0.1, vel: 1 });
    }
    var b, q;
    if (score.drums === 'hats8') {
      for (b = 0; b < score.bars; b++) {
        for (q = 0; q < 8; q++) {
          push('hat', b, q * 0.5, (q === 0 || q === 4) ? 0.05 : 0.032); // light accents on 1 & 3
        }
      }
    } else if (score.drums === 'lofiKit') {
      for (b = 0; b < score.bars; b++) {
        push('kick', b, 0, 0.07); push('kick', b, 2, 0.062);
        push('snare', b, 1, 0.05); push('snare', b, 3, 0.05);
        push('hat', b, 0.5, 0.025); push('hat', b, 2.5, 0.025); // sparse
      }
    }
    return out;
  }

  /** Full deterministic expansion of a score: all channels + drums, with
   * loop-boundary clipping and §18.2 early-era MONO enforcement (a new
   * beeper note cuts the previous — authentic PC-speaker behavior). */
  function expandScore(score) {
    var loopDur = score.bars * 4 * 60 / score.bpm;
    var events = [];
    (score.channels || []).forEach(function (ch) {
      var evs = expandChannel(score, ch);
      if (score.eraSkin === 'early' && ch.voice === 'beeper') {
        evs.sort(function (a, b) { return a.t - b.t; });
        for (var i = 0; i < evs.length - 1; i++) {
          evs[i].dur = Math.min(evs[i].dur, Math.max(0.02, evs[i + 1].t - evs[i].t - 0.006));
        }
      }
      events = events.concat(evs);
    });
    events = events.concat(expandDrums(score));
    /* clip: nothing (incl. release tail) may cross the loop boundary */
    var clipped = [];
    events.forEach(function (ev) {
      var rel = VOICE_REL[ev.voice] || 0.1;
      var maxDur = loopDur - ev.t - rel;
      if (ev.t >= loopDur - 0.02 || maxDur < 0.02) return;
      ev.dur = Math.min(ev.dur, maxDur);
      clipped.push(ev);
    });
    clipped.sort(function (a, b) { return a.t - b.t; });
    return { events: clipped, loopDur: loopDur };
  }

  /** Test hook (§18.3): the deterministic expansion, for assertions like
   * "early scores never overlap two notes". */
  A.debugScoreEvents = function (scoreId) {
    var s = findScore(scoreId);
    return s ? expandScore(s) : null;
  };

  /* ---- voices (all take an explicit ctx + destination) ---- */

  /** Shared amp envelope: attack → (optional decay to sustain) → hold →
   * release ending at t+dur+rel. Returns the gain node, already connected. */
  function ampEnv(c, dest, t, dur, peak, att, rel, susFrac) {
    var g = c.createGain();
    var p = Math.max(0.0002, peak);
    var sus = (susFrac !== undefined) ? Math.max(0.0002, p * susFrac) : p;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(p, t + att);
    if (susFrac !== undefined && dur > att + 0.08) {
      g.gain.linearRampToValueAtTime(sus, t + att + (dur - att) * 0.6);
    }
    var end = Math.max(t + att, t + dur);
    g.gain.setValueAtTime(sus, end);
    g.gain.linearRampToValueAtTime(0.0001, end + rel);
    g.connect(dest);
    return g;
  }

  var VOICES = {
    /* PC speaker: ONE plain square, no filter, fast flat envelope. */
    beeper: function (c, dest, ev, t) {
      var o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = ev.freq;
      var p = ev.gain * ev.vel;
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p, t + 0.005);
      g.gain.setValueAtTime(p, Math.max(t + 0.005, t + ev.dur - 0.015));
      g.gain.linearRampToValueAtTime(0.0001, t + ev.dur);
      g.connect(dest);
      o.connect(g);
      o.start(t); o.stop(t + ev.dur + 0.02);
    },

    /* OPL2-style 2-op FM: sine modulator → GainNode → carrier.frequency. */
    fmBass: function (c, dest, ev, t) {
      fm2op(c, dest, ev, t, { ratio: 1, index: 2.6, idxEnd: 0.25, idxDecay: 0.14,
                              att: 0.004, rel: 0.06, susFrac: 0.35 });
    },
    fmEP: function (c, dest, ev, t) {
      /* high-ratio, low-index tine — the DX/OPL e-piano trick */
      fm2op(c, dest, ev, t, { ratio: 14, index: 0.16, idxEnd: 0.015, idxDecay: 0.09,
                              att: 0.003, rel: 0.1, susFrac: 0.4 });
    },
    fmBell: function (c, dest, ev, t) {
      /* long shimmer decay lives inside the (loop-clipped) note length */
      fm2op(c, dest, ev, t, { ratio: 3.5, index: 1.1, idxEnd: 0.08, idxDecay: 0.9,
                              att: 0.003, rel: 0.25, susFrac: 0.15 });
    },

    /* subtractive: saw(s) → lowpass */
    sawLead: function (c, dest, ev, t) {
      var o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = ev.freq;
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(600 + 2600 * ev.vel, t);
      f.frequency.exponentialRampToValueAtTime(650, t + Math.min(0.3, ev.dur));
      var g = ampEnv(c, dest, t, ev.dur, ev.gain * ev.vel, 0.012, 0.08, 0.72);
      o.connect(f); f.connect(g);
      o.start(t); o.stop(t + ev.dur + 0.12);
    },
    sawPad: function (c, dest, ev, t) {
      var g = ampEnv(c, dest, t, ev.dur, ev.gain * ev.vel * 0.6,
                     Math.min(0.45, ev.dur * 0.3), 0.3, 0.85);
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 950; f.Q.value = 0.4;
      f.connect(g);
      [-6, 6].forEach(function (cents) {
        var o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = ev.freq; o.detune.value = cents;
        o.connect(f);
        o.start(t); o.stop(t + ev.dur + 0.35);
      });
    },

    /* modern soft pad: 3 detuned saws + sine sub octave, slow attack;
     * the caller wires a gentle feedback-delay send per schedule pass. */
    softPad: function (c, dest, ev, t, sends) {
      var g = ampEnv(c, dest, t, ev.dur, ev.gain * ev.vel * 0.45,
                     Math.min(0.8, ev.dur * 0.4), 0.5, 0.9);
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1300; f.Q.value = 0.3;
      f.connect(g);
      /* POST-envelope delay send — a pre-fader send would pour the raw saw
       * stack into the feedback loop and clip (caught by the §18.3 peak test) */
      if (sends && sends.delay) g.connect(sends.delay);
      [-7, 0, 7].forEach(function (cents) {
        var o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = ev.freq; o.detune.value = cents;
        o.connect(f);
        o.start(t); o.stop(t + ev.dur + 0.55);
      });
      var sub = c.createOscillator();
      sub.type = 'sine'; sub.frequency.value = ev.freq / 2;
      var sg = c.createGain(); sg.gain.value = 0.5;
      sub.connect(sg); sg.connect(f);
      sub.start(t); sub.stop(t + ev.dur + 0.55);
    },

    subBass: function (c, dest, ev, t) {
      var g = ampEnv(c, dest, t, ev.dur, ev.gain * ev.vel, 0.012, 0.06, 0.8);
      var o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = ev.freq;
      o.connect(g);
      var o2 = c.createOscillator();
      o2.type = 'triangle'; o2.frequency.value = ev.freq;
      var g2 = c.createGain(); g2.gain.value = 0.35;
      o2.connect(g2); g2.connect(g);
      o.start(t); o.stop(t + ev.dur + 0.1);
      o2.start(t); o2.stop(t + ev.dur + 0.1);
    },

    bellArp: function (c, dest, ev, t) {
      var durEff = Math.min(ev.dur, 0.6);
      var p = ev.gain * ev.vel;
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0002, t + durEff + 0.1);
      g.connect(dest);
      var o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = ev.freq;
      o.connect(g);
      var o2 = c.createOscillator();          // 2.76× inharmonic partial = tine sparkle
      o2.type = 'sine'; o2.frequency.value = ev.freq * 2.76;
      var g2 = c.createGain(); g2.gain.value = 0.3;
      o2.connect(g2); g2.connect(g);
      o.start(t); o.stop(t + durEff + 0.12);
      o2.start(t); o2.stop(t + durEff + 0.12);
    },

    /* drums (ev.gain carries the per-hit level, all ≤ 0.08) */
    kick: function (c, dest, ev, t) {
      var o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      var g = c.createGain();
      g.gain.setValueAtTime(ev.gain, t);
      g.gain.exponentialRampToValueAtTime(0.0002, t + 0.13);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.15);
    },
    snare: function (c, dest, ev, t) {
      noiseHit(c, dest, t, 0.09, 'bandpass', 1800, 1, ev.gain);
    },
    hat: function (c, dest, ev, t) {
      noiseHit(c, dest, t, 0.03, 'highpass', 7000, 0.7, ev.gain);
    }
  };

  /** True 2-operator FM: sine modulator drives carrier frequency through a
   * GainNode whose value is the deviation in Hz (index × carrier freq),
   * decaying over idxDecay — brightness fades like real OPL2 patches. */
  function fm2op(c, dest, ev, t, cfg) {
    var car = c.createOscillator();
    car.type = 'sine'; car.frequency.value = ev.freq;
    var mod = c.createOscillator();
    mod.type = 'sine'; mod.frequency.value = ev.freq * cfg.ratio;
    var mg = c.createGain();
    var dev0 = ev.freq * cfg.ratio * cfg.index;      // Δf = I × fm
    var dev1 = Math.max(0.5, ev.freq * cfg.ratio * cfg.idxEnd);
    mg.gain.setValueAtTime(dev0, t);
    mg.gain.exponentialRampToValueAtTime(dev1, t + Math.max(0.02, cfg.idxDecay));
    mod.connect(mg);
    mg.connect(car.frequency);
    var g = ampEnv(c, dest, t, ev.dur, ev.gain * ev.vel, cfg.att, cfg.rel, cfg.susFrac);
    car.connect(g);
    car.start(t); mod.start(t);
    car.stop(t + ev.dur + cfg.rel + 0.05);
    mod.stop(t + ev.dur + cfg.rel + 0.05);
  }

  function noiseHit(c, dest, t, dur, type, freq, q, vol) {
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0002, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /** Schedule one full loop pass of a score into (c, dest) at time t0.
   * Returns the loop length in seconds. Works identically on a live
   * AudioContext and an OfflineAudioContext (§18.2 testability). */
  function scheduleScore(c, dest, score, t0) {
    var ex = expandScore(score);
    /* per-pass gentle feedback delay for softPad (modern era) */
    var sends = null;
    if ((score.channels || []).some(function (ch) { return ch.voice === 'softPad'; })) {
      var delay = c.createDelay(1.2);
      delay.delayTime.value = 0.45;
      var fb = c.createGain(); fb.gain.value = 0.3;
      var wet = c.createGain(); wet.gain.value = 0.22;
      delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(dest);
      sends = { delay: delay };
    }
    ex.events.forEach(function (ev) {
      var fn = VOICES[ev.voice];
      if (!fn) return;
      try { fn(c, dest, ev, t0 + ev.t, sends); }
      catch (e) { /* one bad note never kills the pass */ }
    });
    return ex.loopDur;
  }

  /** §18.2 (binding) — headless render for review/tests: schedules the
   * whole score at t=0 into the provided OfflineAudioContext and returns
   * its startRendering() promise. */
  A.renderScore = function (scoreId, offlineCtx) {
    var score = findScore(scoreId);
    if (!score) return Promise.reject(new Error('Unknown score: ' + scoreId));
    if (!offlineCtx) return Promise.reject(new Error('An OfflineAudioContext is required'));
    var master = offlineCtx.createGain();
    master.gain.value = SCORE_MASTER;
    master.connect(offlineCtx.destination);
    scheduleScore(offlineCtx, master, score, 0);
    return offlineCtx.startRendering();
  };

  /* ------------------------------------------------------------------ *
   * Live scheduler: alternate the era's two scores on loop end, ~2s
   * crossfade on era-skin change, honoring mute/volume + first gesture.
   * ------------------------------------------------------------------ */

  var eraCls = 'era-early';
  var schedTimer = null;
  var passes = [];          // [{gain, endT, scoreId}]
  var nextLoopStart = 0;
  var altIndex = 0;         // which of the era's scores plays next
  var currentScoreId = null;

  function skinOf(cls) { return String(cls || '').replace(/^era-/, ''); }

  function nextScoreFor(skin) {
    var list = scoresForSkin(skin);
    if (!list.length) return null;
    var s = list[altIndex % list.length];
    altIndex++;
    return s;
  }

  function startPass(score, when, fadeIn) {
    var passGain = ctx.createGain();
    if (fadeIn > 0) {
      passGain.gain.setValueAtTime(0.0001, when);
      passGain.gain.linearRampToValueAtTime(SCORE_MASTER, when + fadeIn);
    } else {
      passGain.gain.setValueAtTime(SCORE_MASTER, when);
    }
    passGain.connect(musicBus);
    var dur = scheduleScore(ctx, passGain, score, when);
    passes.push({ gain: passGain, endT: when + dur, scoreId: score.id });
    nextLoopStart = when + dur;
    currentScoreId = score.id;
    return dur;
  }

  function schedulerTick() {
    if (!ctx || !musicBus || !settings.music) return;
    var now = ctx.currentTime;
    passes = passes.filter(function (p) {
      if (p.endT < now - 4) { try { p.gain.disconnect(); } catch (e) { /* ok */ } return false; }
      return true;
    });
    /* §18.2 — ALTERNATE between the era's scores on each loop end */
    if (now > nextLoopStart - 1.2) {
      var s = nextScoreFor(skinOf(eraCls));
      if (s) startPass(s, Math.max(nextLoopStart, now + 0.05), 0);
    }
  }

  function startMusic() {
    if (!ctx || schedTimer) return;
    var s = nextScoreFor(skinOf(eraCls));
    if (!s) return;                         // scores not loaded — stay silent
    startPass(s, ctx.currentTime + 0.1, 0.4);
    schedTimer = window.setInterval(schedulerTick, 400);
  }

  function stopMusic() {
    if (schedTimer) { window.clearInterval(schedTimer); schedTimer = null; }
    if (ctx) {
      var now = ctx.currentTime;
      passes.forEach(function (p) {
        try {
          p.gain.gain.cancelScheduledValues(now);
          p.gain.gain.setValueAtTime(p.gain.gain.value, now);
          p.gain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        } catch (e) { /* ignore */ }
      });
    }
    passes = [];
    currentScoreId = null;
  }

  /** Called by UI.updateEraSkin whenever the era skin class changes:
   * ~2s crossfade from the old era's pass into the new era's score. */
  A.setEra = function (cls) {
    if (['era-early', 'era-90s', 'era-00s', 'era-modern'].indexOf(cls) === -1) return;
    if (eraCls === cls) return;
    eraCls = cls;
    altIndex = 0;
    if (!ctx || !schedTimer || !settings.music) return;
    var now = ctx.currentTime;
    passes.forEach(function (p) {
      try {
        p.gain.gain.cancelScheduledValues(now);
        p.gain.gain.setValueAtTime(p.gain.gain.value, now);
        p.gain.gain.linearRampToValueAtTime(0.0001, now + 2);   // fade the old era out
      } catch (e) { /* ignore */ }
      p.endT = Math.min(p.endT, now + 2.2);
    });
    var s = nextScoreFor(skinOf(cls));
    if (s) startPass(s, now + 0.15, 2);                          // fade the new era in
  };

  /** §18.2 — "Now playing" line for the System tab audio card. */
  var TECH_LABELS = {
    early: 'PC-speaker square wave — the only sound a 1983 PC had',
    '90s': '2-op FM synthesis — how AdLib/Sound Blaster music worked in 1991',
    '00s': 'Subtractive saw synths — the software-studio sound of the 2000s',
    modern: 'Detuned soft-synth pads — the modern ambient default'
  };
  A.nowPlaying = function () {
    if (!settings.music) return { off: true, reason: 'Music is muted' };
    if (!ctx || !currentScoreId) return { off: true, reason: 'Music starts after your first click' };
    var s = findScore(currentScoreId);
    if (!s) return { off: true, reason: 'Between songs' };
    return { off: false, name: s.name, technique: TECH_LABELS[s.eraSkin] || '' };
  };

  /* ------------------------------------------------------------------ *
   * Toggles, volumes, UI sync
   * ------------------------------------------------------------------ */

  A.toggleMusic = function () {
    settings.music = !settings.music;
    saveSettings();
    if (ctx && musicBus) musicBus.gain.value = settings.music ? settings.musicVol : 0;
    if (settings.music) { if (ctx) startMusic(); } else stopMusic();
    A.syncButtons();
  };

  A.toggleSfx = function () {
    settings.sfx = !settings.sfx;
    saveSettings();
    if (ctx && sfxBus) sfxBus.gain.value = settings.sfxVol;
    A.syncButtons();
    if (settings.sfx) A.sfx('click');
  };

  A.setMusicVol = function (v) {
    settings.musicVol = clamp01(v);
    saveSettings();
    if (ctx && musicBus && settings.music) musicBus.gain.value = settings.musicVol;
  };

  /* §16.3e — pure setter: no per-tick preview click (dragging the slider
   * used to machine-gun clicks). The Settings UI plays ONE preview click on
   * the slider's `change` (drag release) instead. */
  A.setSfxVol = function (v) {
    settings.sfxVol = clamp01(v);
    saveSettings();
    if (ctx && sfxBus) sfxBus.gain.value = settings.sfxVol;
  };

  A.getSettings = function () {
    return { music: settings.music, sfx: settings.sfx, musicVol: settings.musicVol, sfxVol: settings.sfxVol };
  };

  /** Reflect mute state on the header toggle buttons. */
  A.syncButtons = function () {
    var mb = document.getElementById('btn-music');
    if (mb) {
      mb.classList.toggle('muted', !settings.music);
      mb.title = settings.music ? 'Music on — click to mute' : 'Music off — click to unmute';
    }
    var sb = document.getElementById('btn-sfx');
    if (sb) {
      sb.classList.toggle('muted', !settings.sfx);
      sb.title = settings.sfx ? 'Sound effects on — click to mute' : 'Sound effects off — click to unmute';
    }
  };

  /* ------------------------------------------------------------------ *
   * Init (called from UI.init)
   * ------------------------------------------------------------------ */

  A.init = function () {
    loadSettings();
    A.syncButtons();
    // Autoplay policy: only create the AudioContext on the first pointerdown.
    document.addEventListener('pointerdown', onFirstGesture, true);
  };

})();
