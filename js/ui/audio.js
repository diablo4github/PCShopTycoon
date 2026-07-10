/* ==========================================================================
 * Circuit & Solder: PC Shop Tycoon — js/ui/audio.js (v2, SPEC §9.8)
 * All-WebAudio synthesized audio: zero external assets (CSP / file:// safe).
 *
 *  - SFX: click, accept, decline, complete (cash register), error,
 *    endday chime, callback sting, mishap, purchase. Short & subtle.
 *  - Era music: generative background loops keyed to the era skin
 *    (era-early square arpeggio / 90s FM-ish pad / 00s soft saw /
 *    modern airy sine pad + sparse hats).
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

  /* music scheduler state */
  var eraCls = 'era-early';
  var schedTimer = null;
  var nextTime = 0;
  var step = 0;

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

  /* ------------------------------------------------------------------ *
   * Generative era music
   * Lookahead scheduler: every 200ms schedule notes ~0.35s ahead.
   * ------------------------------------------------------------------ */

  /** One enveloped oscillator routed to the MUSIC bus at absolute time t. */
  function mNote(freq, t, dur, vol, type, detune) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.6, dur * 0.35));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return g;
  }

  /** FM-ish pad voice: modulator oscillator wired into carrier frequency. */
  function mFm(freq, t, dur, vol, ratio, index) {
    var car = ctx.createOscillator();
    var mod = ctx.createOscillator();
    var mg = ctx.createGain();
    var g = ctx.createGain();
    car.type = 'sine';
    car.frequency.value = freq;
    mod.type = 'sine';
    mod.frequency.value = freq * (ratio || 2);
    mg.gain.value = freq * (index || 0.6);
    mod.connect(mg);
    mg.connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    car.connect(g);
    g.connect(musicBus);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }

  /** Filtered saw pad voice (00s). */
  function mSaw(freq, t, dur, vol) {
    var osc = ctx.createOscillator();
    var filt = ctx.createBiquadFilter();
    var g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.value = 750;
    filt.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Sparse hat: tiny high-passed noise tick (modern). */
  function mHat(t, vol) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * 0.03));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(filt); filt.connect(g); g.connect(musicBus);
    src.start(t); src.stop(t + 0.05);
  }

  /* chord tables (Am — F — C — G family, one chord per 4 steps) */
  var CHORDS = [
    [220, 261.63, 329.63],   // Am
    [174.61, 220, 261.63],   // F
    [196, 261.63, 329.63],   // C/G-ish
    [196, 246.94, 293.66]    // G
  ];
  var PENTA = [110, 130.81, 164.81, 196, 220, 261.63];

  var ERA_LOOPS = {
    'era-early': {
      stepDur: 0.42,
      onStep: function (s, t) {
        // slow square-wave arpeggio, one quiet voice, occasional rest
        if (s % 8 === 7) return;
        var seq = [0, 2, 4, 5, 4, 2, 1, 3];
        var f = PENTA[seq[s % 8] % PENTA.length];
        mNote(f, t, 0.34, 0.05, 'square');
        if (s % 8 === 0) mNote(f / 2, t, 1.4, 0.035, 'square');
      }
    },
    'era-90s': {
      stepDur: 0.5,
      onStep: function (s, t) {
        if (s % 4 === 0) {
          var ch = CHORDS[(s / 4) % 4 | 0];
          for (var i = 0; i < ch.length; i++) mFm(ch[i], t, 2.1, 0.045, 2, 0.5);
          mFm(ch[0] / 2, t, 2.1, 0.05, 1, 0.3);
        }
      }
    },
    'era-00s': {
      stepDur: 0.46,
      onStep: function (s, t) {
        if (s % 4 === 0) {
          var ch = CHORDS[(s / 4 + 1) % 4 | 0];
          for (var i = 0; i < ch.length; i++) mSaw(ch[i], t, 2.0, 0.05);
        }
        if (s % 4 === 2) mNote(CHORDS[(s / 4 + 1) % 4 | 0][0] / 2, t, 0.9, 0.05, 'sine');
      }
    },
    'era-modern': {
      stepDur: 0.44,
      onStep: function (s, t) {
        if (s % 8 === 0) {
          var ch = CHORDS[(s / 8) % 4 | 0];
          for (var i = 0; i < ch.length; i++) {
            mNote(ch[i] * 2, t, 3.4, 0.028, 'sine', 4);
            mNote(ch[i] * 2, t, 3.4, 0.028, 'sine', -4);
          }
        }
        if (s % 4 === 2 && Math.random() < 0.65) mHat(t, 0.03);
        if (s % 8 === 5 && Math.random() < 0.4) mHat(t, 0.02);
      }
    }
  };

  function schedulerTick() {
    if (!ctx || !musicBus || !settings.music) return;
    var loop = ERA_LOOPS[eraCls] || ERA_LOOPS['era-early'];
    while (nextTime < ctx.currentTime + 0.35) {
      try { loop.onStep(step, Math.max(nextTime, ctx.currentTime + 0.02)); }
      catch (e) { /* keep the loop alive */ }
      nextTime += loop.stepDur;
      step = (step + 1) % 64;
    }
  }

  function startMusic() {
    if (!ctx || schedTimer) return;
    nextTime = ctx.currentTime + 0.1;
    step = 0;
    schedTimer = window.setInterval(schedulerTick, 200);
  }

  function stopMusic() {
    if (schedTimer) { window.clearInterval(schedTimer); schedTimer = null; }
  }

  /** Called by UI.updateEraSkin whenever the era skin class changes. */
  A.setEra = function (cls) {
    if (!ERA_LOOPS[cls]) return;
    if (eraCls !== cls) { eraCls = cls; step = 0; }
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
