// AudioEngine — fully procedural Web Audio for "An Ordinary Cat".
// No audio files: every sound is built from oscillators, generated noise buffers,
// filters and envelopes. See docs/notes/audio.md for the name list and usage.
//
// Signal graph:
//   one-shots ─▶ sfxBus ─┐
//   loops ─────▶ ambBus ─┼─▶ master(mute) ─▶ glue comp ─▶ limiter ─▶ soft-clip ─▶ meter ─▶ out
//   (sends) ───▶ reverb ─┘
//
// The AudioContext is created lazily in resume() (first user gesture). Calls made
// before that are safe no-ops, except loop()/setRoomAmbience()/setClockRunning(),
// whose desired state is remembered and applied once audio starts.

const LOOP_FADE = 1.0;
const ROOM_FADE = 1.5;
const EPS = 0.0001;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Per-room ambient beds: loop name -> gain.
const ROOM_BEDS = {
  foyer: { rain: 0.35, drone: 0.5, wind: 0.25 },
  conservatory: { rain: 0.9, wind: 0.6, drone: 0.35 },
  parlour: { gaslight: 0.7, mantelClock: 0.6, drone: 0.2 },
  nursery: { sash: 0.7, rocker: 0.6, rain: 0.15 },
  cellar: { furnace: 0.8, fire: 0.55, drip: 0.6 },
  midnight: { rain: 0.35, wind: 0.2, clockTick: 1.1 },
};

// Voice presets for blip(): built once, per-call cost = 1 oscillator + 1 gain.
const VOICES = {
  tallow:  { type: 'triangle', f: 330, lp: 1500, q: 0.9, peak: 0.09, wobble: 0.02 },
  finch:   { type: 'sawtooth', f: 140, lp: 800,  q: 1.1, peak: 0.07, wobble: 0.035 },
  neutral: { type: 'triangle', f: 400, lp: 2600, q: 0.7, peak: 0.08, wobble: 0.015 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._warned = new Set();
    this._loops = new Map();   // name -> live instance
    this._wanted = new Map();  // name -> gain (desired loop state, kept before resume)
    this._room = null;
    this._roomLoops = new Set();
    this._clockRunning = false;
    this._sched = null;
    this._voices = null;
    this._meterBuf = null;
  }

  // ───────────────────────────────────────────────────────── lifecycle

  async resume() {
    if (!this.ctx) {
      if (!this._build()) return;
    }
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (e) { /* ignore */ }
    // apply remembered state
    for (const [name, gain] of this._wanted) {
      if (!this._loops.has(name)) this._startLoop(name, gain, LOOP_FADE);
    }
    if (this._room) this._applyRoom(ROOM_FADE);
  }

  get ready() { return !!this.ctx; }

  _build() {
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return false; }
    this.ctx = ctx;

    // master chain
    this._master = ctx.createGain();
    this._master.gain.value = this.muted ? 0 : 1;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 2.5;
    glue.attack.value = 0.01; glue.release.value = 0.25;

    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.001; lim.release.value = 0.12;

    // soft clip safety net: tanh-ish curve, unity-ish for small signals, never > 0.98
    const clip = ctx.createWaveShaper();
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = 0.98 * Math.tanh(x * 1.1) / Math.tanh(1.1); }
    clip.curve = curve;

    const trim = ctx.createGain(); trim.gain.value = 0.9;

    this._meter = ctx.createAnalyser();
    this._meter.fftSize = 2048;
    this._meterBuf = new Float32Array(this._meter.fftSize);

    this._master.connect(glue); glue.connect(lim); lim.connect(trim); trim.connect(clip);
    clip.connect(this._meter); this._meter.connect(ctx.destination);

    // buses
    this._sfx = ctx.createGain(); this._sfx.gain.value = 1; this._sfx.connect(this._master);
    this._amb = ctx.createGain(); this._amb.gain.value = 0.7; this._amb.connect(this._master);

    // noise buffers
    this._white = this._makeNoise('white', 2.5);
    this._pink = this._makeNoise('pink', 4);
    this._brown = this._makeNoise('brown', 4);

    // reverb
    this._revIn = ctx.createGain(); this._revIn.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = this._makeImpulse(2.4, 2.6);
    const revTone = ctx.createBiquadFilter(); revTone.type = 'lowpass'; revTone.frequency.value = 5200;
    this._revOut = ctx.createGain(); this._revOut.gain.value = 0.42;
    this._revIn.connect(conv); conv.connect(revTone); revTone.connect(this._revOut); this._revOut.connect(this._master);

    // blip voices (persistent filter + bus per voice)
    this._voices = {};
    for (const k in VOICES) {
      const v = VOICES[k];
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lp; f.Q.value = v.q;
      f.connect(this._sfx);
      this._voices[k] = { ...v, node: f };
    }

    // loop scheduler (lookahead; generous so background-tab throttling doesn't leave gaps)
    this._sched = setInterval(() => this._schedule(), 60);
    return true;
  }

  _makeNoise(kind, seconds) {
    const ctx = this.ctx, len = (ctx.sampleRate * seconds) | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // crossfade the loop seam
    const fade = Math.min(2048, len >> 3);
    for (let i = 0; i < fade; i++) { const a = i / fade; d[i] = d[i] * a + d[len - fade + i] * (1 - a); }
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx, len = (ctx.sampleRate * seconds) | 0;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;          // soften highs
        const pre = Math.min(1, i / (ctx.sampleRate * 0.012));       // tiny pre-delay ramp
        d[i] = lp * Math.pow(1 - t, decay) * pre * 0.6;
      }
    }
    return buf;
  }

  // ───────────────────────────────────────────────────────── building blocks

  _now() { return this.ctx.currentTime + 0.012; }

  /** Output gain node for one sound; auto-disconnects after `life` seconds. */
  _voice(gain, send, life) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = gain;
    g.connect(this._sfx);
    let s = null;
    if (send > 0) { s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this._revIn); }
    setTimeout(() => { try { g.disconnect(); s && s.disconnect(); } catch (e) {} }, (life + 0.6) * 1000);
    return g;
  }

  _env(param, t, a, peak, d, hold = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(EPS, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(EPS, t + a + hold + d);
    param.setValueAtTime(0, t + a + hold + d + 0.001);
  }

  /** Enveloped oscillator. Returns {osc, g}. */
  _tone(dest, { type = 'sine', f, f2, glide, t, a = 0.005, peak = 0.2, d = 0.2, hold = 0, detune = 0 }) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + (glide ?? (a + hold + d)));
    this._env(g.gain, t, a, peak, d, hold);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + hold + d + 0.05);
    return { osc: o, g };
  }

  /** Enveloped filtered noise. Returns {src, filt, g}. */
  _noise(dest, { kind = 'white', type = 'bandpass', f = 1000, f2, glide, Q = 1, t, a = 0.005, peak = 0.2, d = 0.2, hold = 0, rate = 1 }) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = kind === 'pink' ? this._pink : kind === 'brown' ? this._brown : this._white;
    src.loop = true; src.playbackRate.value = rate;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.Q.value = Q;
    filt.frequency.setValueAtTime(f, t);
    if (f2) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + (glide ?? (a + hold + d)));
    const g = ctx.createGain(); this._env(g.gain, t, a, peak, d, hold);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t, Math.random() * (src.buffer.duration - 0.5)); src.stop(t + a + hold + d + 0.05);
    return { src, filt, g };
  }

  /** Inharmonic bell. */
  _bell(dest, f, t, peak, d, ratios = [1, 2.76, 5.4, 8.93], amps = [1, 0.45, 0.22, 0.1]) {
    for (let i = 0; i < ratios.length; i++) {
      this._tone(dest, { f: f * ratios[i], t, a: 0.003, peak: peak * amps[i], d: d / (1 + i * 0.9) });
    }
  }

  /** Random curve for rough amplitude/filter modulation. */
  _roughCurve(n, lo, hi, smooth = 0.6) {
    const c = new Float32Array(n); let v = (lo + hi) / 2;
    for (let i = 0; i < n; i++) { v = v * smooth + rand(lo, hi) * (1 - smooth); c[i] = v; }
    return c;
  }

  _warnOnce(kind, name) {
    const key = kind + ':' + name;
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`[audio] unknown ${kind} "${name}"`);
  }

  // ───────────────────────────────────────────────────────── public: one-shots

  /** One-shot by name. opts: { gain = 1, pitch = 1 }. Never throws. */
  play(name, opts = {}) {
    const def = SFX[name];
    if (!def) { this._warnOnce('sound', name); return; }
    if (!this.ctx) return;
    try {
      const gain = opts.gain ?? 1, pitch = opts.pitch ?? 1;
      const out = this._voice(gain, def.send || 0, def.life || 2);
      def.fn(this, this._now(), pitch, out);
    } catch (e) {
      this._warnOnce('error', name + ': ' + (e && e.message));
    }
  }

  /** Glassy pluck. 0 = C5. */
  glassNote(semitoneOffset = 0) {
    if (!this.ctx) return;
    try {
      const f = 523.25 * Math.pow(2, (semitoneOffset || 0) / 12);
      const t = this._now(), out = this._voice(1, 0.4, 2.5);
      this._tone(out, { f, t, a: 0.002, peak: 0.16, d: 1.6 });
      this._tone(out, { f: f * 2.002, t, a: 0.002, peak: 0.05, d: 0.7 });
      this._tone(out, { f: f * 3.01, t, a: 0.002, peak: 0.03, d: 0.35 });
      this._tone(out, { f: f * 5.43, t, a: 0.002, peak: 0.018, d: 0.18 });
      this._noise(out, { type: 'highpass', f: 6000, t, a: 0.001, peak: 0.025, d: 0.012 });
    } catch (e) { this._warnOnce('error', 'glassNote'); }
  }

  /** n spaced bell strikes; the last rings out. */
  clockChime(n = 1) {
    if (!this.ctx) return;
    n = Math.max(1, Math.min(12, n | 0));
    try {
      const t0 = this._now(), gap = 1.35, f = 392;
      const ratios = [0.5, 1, 1.2, 1.5, 2, 2.51, 3.0], amps = [0.35, 1, 0.45, 0.3, 0.38, 0.12, 0.08];
      for (let i = 0; i < n; i++) {
        const last = i === n - 1, t = t0 + i * gap;
        const out = this._voice(1, 0.45, i * gap + 6);
        this._bell(out, f, t, 0.12, last ? 5.0 : 2.0, ratios, amps);
        this._noise(out, { type: 'bandpass', f: 2400, Q: 3, t, a: 0.001, peak: 0.05, d: 0.03 });
      }
    } catch (e) { this._warnOnce('error', 'clockChime'); }
  }

  /** ~40ms speech blip. Cheap: one oscillator + one gain per call. */
  blip(pitch = 1, opts = {}) {
    if (!this.ctx || !this._voices) return;
    const v = this._voices[opts.who] || this._voices.neutral;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const f = v.f * (pitch || 1) * (0.94 + Math.random() * 0.13);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = v.type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (1 + v.wobble), t + 0.014);
    o.frequency.linearRampToValueAtTime(f * (1 - v.wobble), t + 0.042);
    const gg = g.gain;
    gg.setValueAtTime(0, t);
    gg.linearRampToValueAtTime(v.peak * (opts.gain ?? 1), t + 0.006);
    gg.setValueAtTime(v.peak * 0.8 * (opts.gain ?? 1), t + 0.024);
    gg.linearRampToValueAtTime(0, t + 0.044);
    o.connect(g); g.connect(v.node);
    o.start(t); o.stop(t + 0.05);
  }

  // ───────────────────────────────────────────────────────── public: loops

  loop(name, opts = {}) {
    if (!LOOPS[name]) { this._warnOnce('loop', name); return; }
    const gain = opts.gain ?? 1;
    this._wanted.set(name, gain);
    if (!this.ctx) return;
    const inst = this._loops.get(name);
    if (inst && !inst.stopping) { this._rampLoop(inst, gain, opts.fade ?? 0.5); return; }
    this._startLoop(name, gain, opts.fade ?? LOOP_FADE);
  }

  stopLoop(name, fade = LOOP_FADE) {
    this._wanted.delete(name);
    this._roomLoops.delete(name);
    const inst = this._loops.get(name);
    if (!inst) return;
    this._loops.delete(name);
    this._killLoop(inst, fade);
  }

  stopAllLoops(fade = LOOP_FADE) {
    for (const name of [...this._loops.keys()]) this.stopLoop(name, fade);
    this._wanted.clear();
    this._roomLoops.clear();
    this._room = null;
  }

  setLoopGain(name, gain, fade = 0.5) {
    if (this._wanted.has(name)) this._wanted.set(name, gain);
    const inst = this._loops.get(name);
    if (inst) this._rampLoop(inst, gain, fade);
  }

  isLooping(name) { return this._wanted.has(name); }
  get activeLoops() { return [...this._wanted.keys()]; }

  _startLoop(name, gain, fade) {
    const def = LOOPS[name], ctx = this.ctx;
    try {
      const out = ctx.createGain();
      out.gain.setValueAtTime(EPS, ctx.currentTime);
      out.connect(this._amb);
      let send = null;
      if (def.send) { send = ctx.createGain(); send.gain.value = def.send; out.connect(send); send.connect(this._revIn); }
      const inst = { name, out, send, gain, sources: [], tick: null, next: ctx.currentTime + 0.05, stopping: false, level: def.level ?? 1 };
      def.build(this, inst);
      this._loops.set(name, inst);
      this._rampLoop(inst, gain, fade);
    } catch (e) {
      this._warnOnce('error', 'loop ' + name + ': ' + (e && e.message));
    }
  }

  _rampLoop(inst, gain, fade) {
    const p = inst.out.gain, t = this.ctx.currentTime;
    inst.gain = gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(Math.max(EPS, p.value), t);
    p.linearRampToValueAtTime(Math.max(EPS, gain * inst.level), t + Math.max(0.02, fade));
  }

  _killLoop(inst, fade) {
    inst.stopping = true;
    const t = this.ctx.currentTime, p = inst.out.gain;
    fade = Math.max(0.03, fade);
    p.cancelScheduledValues(t);
    p.setValueAtTime(Math.max(EPS, p.value), t);
    p.exponentialRampToValueAtTime(EPS, t + fade);
    p.setValueAtTime(0, t + fade + 0.01);
    for (const s of inst.sources) { try { s.stop(t + fade + 0.05); } catch (e) {} }
    setTimeout(() => {
      try { inst.out.disconnect(); inst.send && inst.send.disconnect(); } catch (e) {}
    }, (fade + 1.5) * 1000);
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, until = now + 1.1;
    for (const inst of this._loops.values()) {
      if (!inst.tick || inst.stopping) continue;
      if (inst.next < now) inst.next = now + 0.02;
      let guard = 0;
      while (inst.next < until && guard++ < 64) {
        try { inst.next = inst.tick(inst.next); } catch (e) { inst.tick = null; this._warnOnce('error', 'loop tick ' + inst.name); break; }
      }
    }
  }

  // ───────────────────────────────────────────────────────── public: room ambience

  setRoomAmbience(roomId) {
    this._room = roomId && ROOM_BEDS[roomId] ? roomId : null;
    if (roomId && !ROOM_BEDS[roomId]) this._warnOnce('room', roomId);
    this._applyRoom(ROOM_FADE);
  }

  /** Room 1 only: the grandfather clock ticks once it has been set. */
  setClockRunning(b) {
    this._clockRunning = !!b;
    if (this._room === 'foyer') this._applyRoom(ROOM_FADE);
  }

  _applyRoom(fade) {
    const bed = { ...(this._room ? ROOM_BEDS[this._room] : {}) };
    if (this._room === 'foyer' && this._clockRunning) bed.clockTick = 0.8;
    for (const name of [...this._roomLoops]) {
      if (!(name in bed)) this.stopLoop(name, fade);
    }
    for (const name in bed) {
      this.loop(name, { gain: bed[name], fade });
      this._roomLoops.add(name);
    }
  }

  // ───────────────────────────────────────────────────────── public: mute & metering

  setMuted(b) {
    this.muted = !!b;
    if (!this.ctx) return;
    const p = this._master.gain, t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(this.muted ? 0 : 1, t, 0.08);
  }

  /** Peak absolute sample level at the output over the last ~45ms (post-limiter). */
  getPeak() {
    if (!this.ctx) return 0;
    this._meter.getFloatTimeDomainData(this._meterBuf);
    let m = 0; const b = this._meterBuf;
    for (let i = 0; i < b.length; i++) { const v = b[i] < 0 ? -b[i] : b[i]; if (v > m) m = v; }
    return m;
  }

  dispose() {
    clearInterval(this._sched);
    if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
    this.ctx = null; this._loops.clear();
  }
}

// ═════════════════════════════════════════════════════════════ ONE-SHOTS
// fn(engine, t, pitch, out). `send` = reverb send level, `life` = seconds until cleanup.

const SFX = {
  // ── UI ─────────────────────────────────────────────
  click: { life: 0.3, fn(e, t, p, out) {
    e._tone(out, { type: 'triangle', f: 1050 * p, f2: 620 * p, glide: 0.04, t, a: 0.002, peak: 0.16, d: 0.05 });
    e._noise(out, { type: 'bandpass', f: 2800 * p, Q: 4, t, a: 0.001, peak: 0.09, d: 0.018 });
  } },
  hover: { life: 0.2, fn(e, t, p, out) {
    e._tone(out, { f: 1900 * p, f2: 2100 * p, t, a: 0.008, peak: 0.03, d: 0.04 });
  } },
  pickup: { life: 0.5, fn(e, t, p, out) {
    e._noise(out, { type: 'bandpass', f: 900, f2: 2600, Q: 1.2, t, a: 0.03, peak: 0.06, d: 0.12 });
    e._tone(out, { type: 'triangle', f: 659 * p, t: t + 0.02, a: 0.004, peak: 0.13, d: 0.12 });
    e._tone(out, { type: 'triangle', f: 880 * p, t: t + 0.09, a: 0.004, peak: 0.13, d: 0.2 });
  } },
  drop: { life: 0.5, fn(e, t, p, out) {
    e._tone(out, { f: 190 * p, f2: 85 * p, t, a: 0.003, peak: 0.3, d: 0.16 });
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 700, Q: 0.7, t, a: 0.002, peak: 0.18, d: 0.08 });
  } },
  select: { life: 0.5, fn(e, t, p, out) {
    e._tone(out, { f: 784 * p, t, a: 0.004, peak: 0.12, d: 0.15 });
    e._tone(out, { f: 1175 * p, t: t + 0.05, a: 0.004, peak: 0.1, d: 0.2 });
  } },
  error: { life: 0.6, fn(e, t, p, out) {
    const lp = e.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.8; lp.connect(out);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.13;
      e._tone(lp, { type: 'square', f: 138 * p, t: tt, a: 0.01, peak: 0.08, hold: 0.05, d: 0.05 });
      e._tone(lp, { type: 'square', f: 141 * p, t: tt, a: 0.01, peak: 0.06, hold: 0.05, d: 0.05 });
    }
  } },
  success: { send: 0.45, life: 2.5, fn(e, t, p, out) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => e._bell(out, f * p, t + i * 0.085, 0.08, 1.2, [1, 2.0, 3.01], [1, 0.25, 0.08]));
  } },
  unlock: { send: 0.4, life: 2.8, fn(e, t, p, out) {
    // deep clunk
    e._tone(out, { f: 110 * p, f2: 48 * p, t, a: 0.003, peak: 0.38, d: 0.28 });
    e._noise(out, { kind: 'brown', type: 'lowpass', f: 500, t, a: 0.002, peak: 0.35, d: 0.12 });
    e._noise(out, { type: 'bandpass', f: 1600, Q: 5, t, a: 0.001, peak: 0.12, d: 0.03 });
    e._noise(out, { type: 'bandpass', f: 1200, Q: 5, t: t + 0.07, a: 0.001, peak: 0.09, d: 0.03 });
    // shimmer
    [2093, 2637, 3136, 3951, 4186].forEach((f, i) =>
      e._tone(out, { f: f * p, t: t + 0.12 + i * 0.05, a: 0.02, peak: 0.035, d: 0.9 }));
  } },
  page: { life: 0.5, fn(e, t, p, out) {
    const n = e._noise(out, { type: 'bandpass', f: 1800 * p, f2: 4200 * p, Q: 1.4, t, a: 0.04, peak: 0.12, d: 0.16 });
    n.g.gain.setValueCurveAtTime(e._roughCurve(24, 0.03, 0.13, 0.3), t + 0.045, 0.12);
  } },
  paperRustle: { life: 0.6, fn(e, t, p, out) {
    for (let i = 0; i < 5; i++) {
      e._noise(out, { type: 'bandpass', f: rand(2000, 5000) * p, Q: 1.5, t: t + i * rand(0.04, 0.07), a: 0.005, peak: rand(0.05, 0.1), d: rand(0.03, 0.07) });
    }
  } },

  // ── World ──────────────────────────────────────────
  clockTick: { life: 0.2, fn(e, t, p, out) { tick(e, out, t, p, 0.12); } },
  bookSlide: { life: 0.8, fn(e, t, p, out) {
    const n = e._noise(out, { kind: 'pink', type: 'bandpass', f: 700 * p, f2: 1300 * p, Q: 1.2, t, a: 0.06, peak: 0.16, hold: 0.2, d: 0.12 });
    n.filt.frequency.setValueCurveAtTime(e._roughCurve(20, 600 * p, 1500 * p, 0.4), t + 0.01, 0.35);
    e._tone(out, { f: 140 * p, f2: 80 * p, t: t + 0.38, a: 0.003, peak: 0.2, d: 0.1 });
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 500, t: t + 0.38, a: 0.002, peak: 0.12, d: 0.06 });
  } },
  shelfSwing: { life: 1.8, fn(e, t, p, out) {
    creak(e, out, t, 0.9, 85 * p, 650 * p, 0.12);
    e._noise(out, { kind: 'brown', type: 'lowpass', f: 220, t, a: 0.2, peak: 0.25, hold: 0.4, d: 0.3 });
    e._tone(out, { f: 95 * p, f2: 50 * p, t: t + 1.0, a: 0.003, peak: 0.32, d: 0.25 });
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 600, t: t + 1.0, a: 0.002, peak: 0.18, d: 0.1 });
  } },
  gasHiss: { life: 1.8, fn(e, t, p, out) {
    e._noise(out, { type: 'highpass', f: 2800 * p, f2: 4200 * p, Q: 0.6, t, a: 0.12, peak: 0.08, hold: 0.7, d: 0.45 });
    e._noise(out, { type: 'bandpass', f: 6500 * p, Q: 2, t, a: 0.12, peak: 0.03, hold: 0.7, d: 0.45 });
  } },
  flameIgnite: { send: 0.15, life: 1.2, fn(e, t, p, out) {
    e._noise(out, { type: 'bandpass', f: 300 * p, f2: 2200 * p, glide: 0.18, Q: 0.9, t, a: 0.03, peak: 0.25, d: 0.45 });
    e._tone(out, { f: 90 * p, f2: 55 * p, t, a: 0.02, peak: 0.22, d: 0.3 });
    e._noise(out, { kind: 'brown', type: 'lowpass', f: 900, t: t + 0.05, a: 0.05, peak: 0.2, d: 0.5 });
  } },
  whump: { send: 0.35, life: 1.8, fn(e, t, p, out) {
    e._tone(out, { f: 130 * p, f2: 32 * p, glide: 0.5, t, a: 0.006, peak: 0.85, d: 0.7 });
    e._noise(out, { kind: 'brown', type: 'lowpass', f: 1400, f2: 90, glide: 0.8, t, a: 0.005, peak: 0.75, d: 0.9 });
    e._noise(out, { type: 'bandpass', f: 1800, f2: 400, Q: 0.8, t, a: 0.004, peak: 0.18, d: 0.25 });
  } },
  ratchet: { life: 0.6, fn(e, t, p, out) {
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.038, f = (2100 + i * 60) * p;
      e._noise(out, { type: 'bandpass', f, Q: 6, t: tt, a: 0.001, peak: 0.13, d: 0.02 });
      e._tone(out, { type: 'triangle', f: f * 0.45, t: tt, a: 0.001, peak: 0.05, d: 0.018 });
    }
    e._tone(out, { f: 200 * p, f2: 120 * p, t: t + 0.23, a: 0.002, peak: 0.12, d: 0.06 });
  } },
  chime: { send: 0.55, life: 3, fn(e, t, p, out) {
    e._bell(out, 1318.5 * p, t, 0.13, 2.2);
    e._bell(out, 1975.5 * p, t + 0.11, 0.07, 1.8);
  } },
  candleLight: { send: 0.1, life: 0.8, fn(e, t, p, out) {
    e._noise(out, { type: 'bandpass', f: 3200 * p, f2: 1800 * p, Q: 2, t, a: 0.004, peak: 0.12, d: 0.08 });
    e._noise(out, { type: 'lowpass', f: 400, f2: 1300, Q: 0.7, t: t + 0.05, a: 0.06, peak: 0.12, d: 0.35 });
    e._tone(out, { f: 160 * p, f2: 110 * p, t: t + 0.05, a: 0.04, peak: 0.06, d: 0.2 });
  } },
  gust: { life: 2, fn(e, t, p, out) {
    e._noise(out, { kind: 'pink', type: 'bandpass', f: 300 * p, f2: 950 * p, glide: 0.6, Q: 1.1, t, a: 0.5, peak: 0.4, hold: 0.1, d: 0.9 });
    e._noise(out, { type: 'bandpass', f: 1800 * p, f2: 900, Q: 4, t: t + 0.2, a: 0.4, peak: 0.04, d: 0.8 });
  } },
  ritualSwell: { send: 0.6, life: 6, fn(e, t, p, out) {
    const lp = e.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 3.2);
    lp.frequency.exponentialRampToValueAtTime(900, t + 5);
    lp.connect(out);
    [130.8, 196, 261.6, 329.6, 392, 523.3].forEach((f, i) => {
      for (const det of [-7, 7]) e._tone(lp, { type: 'sawtooth', f: f * p, t: t + i * 0.12, a: 2.6, peak: 0.07 / (1 + i * 0.25), hold: 0.5, d: 1.6, detune: det });
    });
    e._noise(out, { kind: 'pink', type: 'bandpass', f: 400, f2: 3500, glide: 3.0, Q: 0.8, t, a: 2.8, peak: 0.16, d: 0.9 });
    e._bell(out, 1046.5 * p, t + 3.0, 0.1, 2.5);
  } },
  zap: { send: 0.1, life: 0.8, fn(e, t, p, out) {
    const saw = e._tone(out, { type: 'sawtooth', f: 1400 * p, f2: 70 * p, glide: 0.3, t, a: 0.003, peak: 0.28, d: 0.32 });
    saw.g.gain.setValueCurveAtTime(e._roughCurve(40, 0, 0.35, 0.1), t + 0.004, 0.3);
    e._noise(out, { type: 'highpass', f: 3000, Q: 0.7, t, a: 0.002, peak: 0.22, d: 0.22 });
    e._tone(out, { type: 'square', f: 60 * p, t, a: 0.004, peak: 0.12, hold: 0.12, d: 0.12 });
  } },
  tinPeel: { life: 1.3, fn(e, t, p, out) {
    const n = e._noise(out, { type: 'bandpass', f: 1500 * p, f2: 3200 * p, Q: 14, t, a: 0.05, peak: 0.22, hold: 0.45, d: 0.12 });
    n.g.gain.setValueCurveAtTime(e._roughCurve(30, 0.08, 0.24, 0.5), t + 0.06, 0.42);
    e._tone(out, { type: 'triangle', f: 2400 * p, f2: 3100 * p, t, a: 0.08, peak: 0.025, hold: 0.35, d: 0.15 });
    // pop as the lid comes free
    e._noise(out, { type: 'bandpass', f: 1200, Q: 2, t: t + 0.62, a: 0.002, peak: 0.16, d: 0.05 });
    e._bell(out, 1900 * p, t + 0.62, 0.04, 0.5, [1, 2.4, 4.1], [1, 0.5, 0.3]);
  } },
  drawerOpen: { life: 0.9, fn(e, t, p, out) {
    const n = e._noise(out, { kind: 'pink', type: 'lowpass', f: 700 * p, Q: 1, t, a: 0.04, peak: 0.2, hold: 0.22, d: 0.08 });
    n.g.gain.setValueCurveAtTime(e._roughCurve(20, 0.08, 0.22, 0.3), t + 0.045, 0.2);
    e._tone(out, { f: 160 * p, f2: 100 * p, t: t + 0.36, a: 0.003, peak: 0.18, d: 0.08 });
    e._noise(out, { type: 'bandpass', f: 1500, Q: 3, t: t + 0.36, a: 0.001, peak: 0.06, d: 0.03 });
  } },
  keyTurn: { life: 0.6, fn(e, t, p, out) {
    e._noise(out, { type: 'bandpass', f: 3600 * p, Q: 10, t, a: 0.001, peak: 0.16, d: 0.03 });
    e._tone(out, { f: 2300 * p, t, a: 0.001, peak: 0.04, d: 0.06 });
    e._noise(out, { type: 'bandpass', f: 2400 * p, Q: 8, t: t + 0.13, a: 0.001, peak: 0.2, d: 0.04 });
    e._tone(out, { f: 1500 * p, t: t + 0.13, a: 0.001, peak: 0.05, d: 0.08 });
    e._tone(out, { f: 220 * p, f2: 150 * p, t: t + 0.13, a: 0.002, peak: 0.1, d: 0.05 });
  } },
  doorOpen: { life: 2, fn(e, t, p, out) {
    creak(e, out, t, 1.2, 110 * p, 900 * p, 0.17);
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 300, f2: 900, t: t + 0.2, a: 0.4, peak: 0.12, d: 0.8 });
  } },
  stoneGrind: { life: 1.8, fn(e, t, p, out) {
    const a = e._noise(out, { kind: 'brown', type: 'lowpass', f: 380 * p, Q: 1, t, a: 0.12, peak: 0.42, hold: 0.85, d: 0.3 });
    a.g.gain.setValueCurveAtTime(e._roughCurve(60, 0.15, 0.45, 0.4), t + 0.13, 0.8);
    const b = e._noise(out, { type: 'bandpass', f: 160 * p, Q: 3, t, a: 0.12, peak: 0.25, hold: 0.85, d: 0.3 });
    b.filt.frequency.setValueCurveAtTime(e._roughCurve(30, 110 * p, 260 * p, 0.5), t + 0.01, 1.0);
  } },
  pour: { life: 1.8, fn(e, t, p, out) {
    const n = e._noise(out, { type: 'bandpass', f: 900 * p, Q: 6, t, a: 0.08, peak: 0.22, hold: 0.9, d: 0.25 });
    n.filt.frequency.setValueCurveAtTime(e._roughCurve(50, 550 * p, 1600 * p, 0.25), t + 0.01, 1.1);
    for (let i = 0; i < 8; i++) {
      const tt = t + rand(0.05, 1.1), f = rand(500, 1100) * p;
      e._tone(out, { f, f2: f * 1.7, glide: 0.04, t: tt, a: 0.004, peak: 0.05, d: 0.04 });
    }
  } },
  splash: { life: 1.2, fn(e, t, p, out) {
    e._noise(out, { type: 'highpass', f: 900 * p, Q: 0.6, t, a: 0.008, peak: 0.17, d: 0.18 });
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 2500 * p, f2: 500, Q: 0.7, t, a: 0.01, peak: 0.17, d: 0.5 });
    for (let i = 0; i < 6; i++) {
      const tt = t + rand(0.1, 0.6), f = rand(700, 1600) * p;
      e._tone(out, { f, f2: f * 1.5, glide: 0.03, t: tt, a: 0.002, peak: 0.04, d: 0.04 });
    }
  } },
  sparkle: { send: 0.5, life: 2, fn(e, t, p, out) {
    const scale = [2093, 2349, 2637, 3136, 3520, 4186];
    for (let i = 0; i < 7; i++) {
      e._tone(out, { f: pick(scale) * p, t: t + i * rand(0.04, 0.08), a: 0.002, peak: 0.045, d: rand(0.25, 0.5) });
    }
  } },
  meow: { send: 0.08, life: 0.9, fn(e, t, p, out) {
    // a cute "mrrp": a rolled start then an upward chirp, filtered through a soft vowel formant
    const ctx = e.ctx, o = ctx.createOscillator(), g = ctx.createGain(), roll = ctx.createGain();
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    const f = 430 * p;
    o.frequency.setValueAtTime(f * 0.85, t);
    o.frequency.linearRampToValueAtTime(f * 0.95, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.24);
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.36);
    f1.type = 'bandpass'; f1.Q.value = 3;
    f1.frequency.setValueAtTime(700, t); f1.frequency.linearRampToValueAtTime(1300, t + 0.24); f1.frequency.linearRampToValueAtTime(900, t + 0.36);
    f2.type = 'bandpass'; f2.Q.value = 5; f2.frequency.setValueAtTime(2300, t);
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    // the "rr" roll: amplitude LFO for the first ~110ms
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 28; depth.gain.setValueAtTime(0.5, t); depth.gain.linearRampToValueAtTime(0, t + 0.12);
    roll.gain.value = 0.5; lfo.connect(depth); depth.connect(roll.gain);
    e._env(g.gain, t, 0.03, 0.32, 0.2, 0.15);
    o.connect(roll); roll.connect(f1); roll.connect(f2);
    const mix = ctx.createGain(); mix.gain.value = 1;
    f1.connect(mix); const f2g = ctx.createGain(); f2g.gain.value = 0.35; f2.connect(f2g); f2g.connect(mix);
    mix.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
  } },
  purr: { life: 1.6, fn(e, t, p, out) {
    const ctx = e.ctx;
    const n = e._noise(out, { kind: 'brown', type: 'lowpass', f: 320 * p, Q: 1.5, t, a: 0.15, peak: 0.5, hold: 0.85, d: 0.25 });
    // breath shape: in (louder) / out (softer)
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueCurveAtTime(new Float32Array([0, 0.3, 0.5, 0.45, 0.2, 0.3, 0.42, 0.38, 0.15, 0.03, 0]), t, 1.25);
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.type = 'triangle'; lfo.frequency.value = 25 * p; depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(am.gain);
    n.g.disconnect(); n.g.connect(am); am.connect(out);
    e._tone(am, { type: 'triangle', f: 50 * p, t, a: 0.15, peak: 0.12, hold: 0.85, d: 0.25 });
    lfo.start(t); lfo.stop(t + 1.3);
  } },
  footstep: { life: 0.4, fn(e, t, p, out) {
    const v = rand(0.9, 1.1);
    e._noise(out, { kind: 'pink', type: 'lowpass', f: 380 * p * v, Q: 0.8, t, a: 0.004, peak: 0.2, d: 0.07 });
    e._tone(out, { f: 115 * p * v, f2: 70 * p, t, a: 0.003, peak: 0.14, d: 0.07 });
  } },
  swoosh: { life: 0.7, fn(e, t, p, out) {
    const n = e._noise(out, { kind: 'pink', type: 'bandpass', f: 400 * p, Q: 1.6, t, a: 0.15, peak: 0.45, d: 0.22 });
    n.filt.frequency.setValueAtTime(400 * p, t);
    n.filt.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.16);
    n.filt.frequency.exponentialRampToValueAtTime(600 * p, t + 0.37);
  } },
  whiteout: { send: 0.7, life: 7, fn(e, t, p, out) {
    e._noise(out, { kind: 'pink', type: 'highpass', f: 300, f2: 3000, glide: 1.5, Q: 0.5, t, a: 1.4, peak: 0.25, hold: 0.2, d: 2.2 });
    [523.3, 659.3, 784, 1046.5, 1568, 2093].forEach((f, i) =>
      e._tone(out, { f: f * p, t: t + i * 0.08, a: 1.3, peak: 0.07, hold: 0.4, d: 3.5 }));
    e._tone(out, { f: 65.4 * p, t, a: 1.2, peak: 0.25, hold: 0.3, d: 2.5 });
    e._bell(out, 2093 * p, t + 1.45, 0.09, 3);
  } },
};

function tick(e, out, t, p, peak) {
  e._noise(out, { type: 'bandpass', f: 3200 * p, Q: 7, t, a: 0.001, peak, d: 0.018 });
  e._tone(out, { type: 'triangle', f: 1400 * p, t, a: 0.001, peak: peak * 0.4, d: 0.025 });
  e._tone(out, { f: 300 * p, t, a: 0.001, peak: peak * 0.4, d: 0.04 });
}

function creak(e, out, t, dur, f0, formant, peak) {
  const ctx = e.ctx, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueCurveAtTime(e._roughCurve(40, f0 * 0.75, f0 * 1.35, 0.7), t, dur);
  bp.type = 'bandpass'; bp.frequency.value = formant; bp.Q.value = 5;
  e._env(g.gain, t, 0.08, peak, 0.2, Math.max(0, dur - 0.28));
  o.connect(bp); bp.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.1);
}

// ═════════════════════════════════════════════════════════════ LOOPS
// build(engine, inst): connect continuous sources into inst.out (push them on
// inst.sources so they can be stopped) and optionally set inst.tick(time) -> nextTime
// for scheduled events. inst.level is the loop's internal loudness at gain 1.

function noiseSrc(e, inst, kind, rate = 1) {
  const s = e.ctx.createBufferSource();
  s.buffer = kind === 'pink' ? e._pink : kind === 'brown' ? e._brown : e._white;
  s.loop = true; s.playbackRate.value = rate;
  s.start(e.ctx.currentTime, Math.random() * 2);
  inst.sources.push(s);
  return s;
}
function lfo(e, inst, freq, depth, target, type = 'sine') {
  const o = e.ctx.createOscillator(), g = e.ctx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = depth;
  o.connect(g); g.connect(target);
  o.start(e.ctx.currentTime, 0); inst.sources.push(o);
  return o;
}
function filt(e, type, f, Q = 0.7) {
  const b = e.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b;
}

const LOOPS = {
  fire: { level: 1, build(e, inst) {
    const n = noiseSrc(e, inst, 'brown'), lp = filt(e, 'lowpass', 700), g = e.ctx.createGain();
    g.gain.value = 0.22;
    lfo(e, inst, 0.23, 0.06, g.gain);
    n.connect(lp); lp.connect(g); g.connect(inst.out);
    const hiss = noiseSrc(e, inst, 'white'), bp = filt(e, 'bandpass', 2500, 0.8), hg = e.ctx.createGain();
    hg.gain.value = 0.012; hiss.connect(bp); bp.connect(hg); hg.connect(inst.out);
    inst.tick = (t) => {
      const big = Math.random() < 0.08;
      e._noise(inst.out, { type: 'bandpass', f: rand(1200, 5000), Q: rand(1, 4), t, a: 0.001, peak: big ? rand(0.14, 0.22) : rand(0.03, 0.09), d: big ? rand(0.02, 0.05) : rand(0.006, 0.02) });
      if (big) e._noise(inst.out, { kind: 'pink', type: 'lowpass', f: 600, t, a: 0.002, peak: 0.1, d: 0.06 });
      return t + (Math.random() < 0.3 ? rand(0.02, 0.06) : rand(0.08, 0.45));
    };
  } },
  rain: { level: 1, build(e, inst) {
    const n = noiseSrc(e, inst, 'pink'), lp = filt(e, 'lowpass', 1300, 0.5), hp = filt(e, 'highpass', 180), g = e.ctx.createGain();
    g.gain.value = 0.2;
    lfo(e, inst, 0.045, 0.06, g.gain);
    lfo(e, inst, 0.11, 0.03, g.gain);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(inst.out);
    // faint patter on the glass
    const w = noiseSrc(e, inst, 'white', 0.9), bp = filt(e, 'bandpass', 3500, 0.9), wg = e.ctx.createGain();
    wg.gain.value = 0.012; w.connect(bp); bp.connect(wg); wg.connect(inst.out);
    inst.tick = (t) => {
      e._noise(inst.out, { type: 'bandpass', f: rand(2500, 6000), Q: 3, t, a: 0.001, peak: rand(0.006, 0.02), d: 0.012 });
      return t + rand(0.03, 0.2);
    };
  } },
  bubble: { level: 1, send: 0.05, build(e, inst) {
    const lp = filt(e, 'lowpass', 1500, 0.8); lp.connect(inst.out);
    const s = noiseSrc(e, inst, 'brown'), sl = filt(e, 'lowpass', 300), sg = e.ctx.createGain();
    sg.gain.value = 0.05; s.connect(sl); sl.connect(sg); sg.connect(inst.out);
    inst.tick = (t) => {
      const f = rand(280, 900);
      e._tone(lp, { f, f2: f * rand(1.4, 2.0), glide: 0.05, t, a: 0.004, peak: rand(0.04, 0.1), d: rand(0.03, 0.07) });
      return t + (Math.random() < 0.25 ? rand(0.04, 0.09) : rand(0.12, 0.45));
    };
  } },
  hum: { level: 1, build(e, inst) {
    const lp = filt(e, 'lowpass', 400, 0.6), g = e.ctx.createGain(); g.gain.value = 1;
    lp.connect(g); g.connect(inst.out);
    for (const [f, a, type] of [[55, 0.09, 'sine'], [55.35, 0.07, 'sine'], [110.2, 0.035, 'triangle'], [164.9, 0.012, 'sine']]) {
      const o = e.ctx.createOscillator(), og = e.ctx.createGain();
      o.type = type; o.frequency.value = f; og.gain.value = a;
      o.connect(og); og.connect(lp); o.start(); inst.sources.push(o);
    }
    lfo(e, inst, 0.07, 0.15, g.gain);
  } },
  wind: { level: 1, build(e, inst) {
    for (const [kind, f, depth, rate, amp] of [['pink', 500, 260, 0.06, 0.22], ['pink', 1100, 500, 0.037, 0.08]]) {
      const n = noiseSrc(e, inst, kind), bp = filt(e, 'bandpass', f, 1.1), g = e.ctx.createGain();
      g.gain.value = amp;
      lfo(e, inst, rate, depth, bp.frequency);
      lfo(e, inst, rate * 0.8, amp * 0.6, g.gain);
      n.connect(bp); bp.connect(g); g.connect(inst.out);
    }
  } },
  drone: { level: 1, send: 0.45, build(e, inst) {
    const lp = filt(e, 'lowpass', 900, 0.8), g = e.ctx.createGain(); g.gain.value = 1;
    lp.connect(g); g.connect(inst.out);
    lfo(e, inst, 0.05, 350, lp.frequency);
    // D minor-add9-ish, soft and open
    for (const [f, a] of [[73.4, 0.05], [110, 0.035], [146.8, 0.03], [220, 0.018], [329.6, 0.01]]) {
      for (const det of [-5, 5]) {
        const o = e.ctx.createOscillator(), og = e.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f; o.detune.value = det; og.gain.value = a;
        o.connect(og); og.connect(lp); o.start(); inst.sources.push(o);
      }
    }
    lfo(e, inst, 0.09, 0.12, g.gain);
  } },
  clockTick: { level: 1, build(e, inst) {
    let tock = false;
    inst.tick = (t) => {
      tick(e, inst.out, t, tock ? 0.82 : 1, 0.1);
      tock = !tock;
      return t + 1.0;
    };
  } },
  // the parlour: a low gas hiss at the brackets; now and then the coals settle in the grate
  gaslight: { level: 1, build(e, inst) {
    const n = noiseSrc(e, inst, 'white', 0.8), hp = filt(e, 'highpass', 3200, 0.6), lp = filt(e, 'lowpass', 7000), g = e.ctx.createGain();
    g.gain.value = 0.014;
    lfo(e, inst, 0.13, 0.003, g.gain);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(inst.out);
    const b = noiseSrc(e, inst, 'brown'), bl = filt(e, 'lowpass', 220), bg = e.ctx.createGain();
    bg.gain.value = 0.05; b.connect(bl); bl.connect(bg); bg.connect(inst.out);
    let first = true;
    inst.tick = (t) => {
      if (!first) {
        // a coal settles: a soft knock and a few small ticks of ash
        e._noise(inst.out, { kind: 'pink', type: 'lowpass', f: 500, t, a: 0.003, peak: rand(0.05, 0.09), d: rand(0.06, 0.12) });
        for (let i = 0, k = 2 + ((Math.random() * 3) | 0); i < k; i++) {
          e._noise(inst.out, { type: 'bandpass', f: rand(1800, 4200), Q: 3, t: t + 0.05 + i * rand(0.04, 0.12), a: 0.001, peak: rand(0.015, 0.04), d: 0.015 });
        }
      }
      first = false;
      return t + rand(7, 16);
    };
  } },
  // the parlour's mantel clock: slower and smaller than the hall's
  mantelClock: { level: 1, build(e, inst) {
    let tock = false;
    inst.tick = (t) => {
      tick(e, inst.out, t, tock ? 1.15 : 1.35, 0.05);
      tock = !tock;
      return t + 1.5;
    };
  } },
  // the nursery: wind at an ill-fitting sash (a thin whistle that comes and goes) over a faint street
  sash: { level: 1, build(e, inst) {
    const n = noiseSrc(e, inst, 'pink'), bp = filt(e, 'bandpass', 1500, 9), g = e.ctx.createGain();
    g.gain.value = 0.05;
    lfo(e, inst, 0.07, 160, bp.frequency);
    lfo(e, inst, 0.05, 0.04, g.gain);
    n.connect(bp); bp.connect(g); g.connect(inst.out);
    const w = noiseSrc(e, inst, 'pink'), wb = filt(e, 'bandpass', 450, 1.0), wg = e.ctx.createGain();
    wg.gain.value = 0.09;
    lfo(e, inst, 0.045, 160, wb.frequency);
    w.connect(wb); wb.connect(wg); wg.connect(inst.out);
    const st = noiseSrc(e, inst, 'brown'), sl = filt(e, 'lowpass', 160), sg = e.ctx.createGain();
    sg.gain.value = 0.04; st.connect(sl); sl.connect(sg); sg.connect(inst.out);
    let first = true;
    inst.tick = (t) => {
      // the street: a cab going by, far off, a few hooves and wheels on wet setts
      if (!first) {
        e._noise(inst.out, { kind: 'brown', type: 'lowpass', f: 260, t, a: 1.6, peak: 0.06, hold: 0.6, d: 1.8 });
        for (let i = 0; i < 6; i++) e._noise(inst.out, { kind: 'pink', type: 'bandpass', f: rand(600, 900), Q: 4, t: t + 0.6 + i * 0.32 + rand(0, 0.04), a: 0.002, peak: 0.012, d: 0.03 });
      }
      first = false;
      return t + rand(18, 34);
    };
  } },
  // the nursery: a rocking horse (or chair) creaks once and back, now and then
  rocker: { level: 1, build(e, inst) {
    let first = true;
    inst.tick = (t) => {
      if (!first) {
        creak(e, inst.out, t, 0.5, 70, 520, 0.035);
        creak(e, inst.out, t + 1.1, 0.45, 62, 480, 0.025);
      }
      first = false;
      return t + rand(9, 20);
    };
  } },
  // the cellar: the furnace roars low behind its door
  furnace: { level: 1, send: 0.2, build(e, inst) {
    const n = noiseSrc(e, inst, 'brown'), lp = filt(e, 'lowpass', 140, 0.9), g = e.ctx.createGain();
    g.gain.value = 0.35;
    lfo(e, inst, 0.17, 0.08, g.gain);
    lfo(e, inst, 0.06, 40, lp.frequency);
    n.connect(lp); lp.connect(g); g.connect(inst.out);
    const o = e.ctx.createOscillator(), og = e.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 41; og.gain.value = 0.04;
    o.connect(og); og.connect(inst.out); o.start(); inst.sources.push(o);
  } },
  // the cellar: a drip, somewhere in the dark
  drip: { level: 1, send: 0.6, build(e, inst) {
    inst.tick = (t) => {
      const f = rand(900, 1400);
      e._tone(inst.out, { f, f2: f * 1.6, glide: 0.04, t, a: 0.002, peak: 0.05, d: 0.06 });
      return t + (Math.random() < 0.2 ? rand(0.5, 0.9) : rand(2.5, 6));
    };
  } },
};

export const SOUND_NAMES = Object.keys(SFX);
export const LOOP_NAMES = Object.keys(LOOPS);
