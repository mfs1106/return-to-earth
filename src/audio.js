/**
 * Procedural, intentionally stylised flight sound.
 * Audio is created only after the visitor explicitly enables it.
 */
const clamp01 = (value) => Math.max(0, Math.min(1, value || 0));

export class SoundEngine {
  constructor() {
    this.enabled = false;
    this.failed = false;
    this.ctx = null;
    this.master = null;
    this.effects = null;
    this.noiseBuffer = null;
    this.layers = {};
    this.lastMission = null;
    this.lastT = null;
    this.sources = [];
    this.cueSources = new Set();
  }

  async setEnabled(enabled) {
    if (this.failed) return false;
    if (!enabled) {
      this.enabled = false;
      this.resetTimeline();
      if (this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0.0001, now, 0.08);
        window.setTimeout(() => {
          if (!this.enabled && this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
        }, 500);
      }
      return true;
    }
    try {
      if (!this.ctx) this._init();
      await this.ctx.resume();
      this.enabled = true;
      this.resetTimeline();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.42, now, 0.18);
      return true;
    } catch (error) {
      this.failed = true;
      this.enabled = false;
      return false;
    }
  }

  _init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio unavailable');
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 18;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.22;
    this.master.connect(limiter).connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.gain.value = 1;
    this.effects.connect(this.master);

    const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.985 + white * 0.015;
      data[i] = brown * 2.1 + white * 0.16;
    }
    this.noiseBuffer = buffer;
    this._noiseLayer('engineLow', 'lowpass', 190, 0.6);
    this._noiseLayer('engineMid', 'bandpass', 650, 0.65);
    this._noiseLayer('wind', 'bandpass', 1150, 0.5);
    this._noiseLayer('heat', 'highpass', 1800, 0.5);

    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 105;
    rumbleFilter.connect(rumbleGain).connect(this.master);
    for (const [type, frequency, volume] of [['sawtooth', 39, 0.22], ['sine', 62, 0.32]]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain).connect(rumbleFilter);
      oscillator.start();
      this.sources.push(oscillator);
    }
    this.layers.rumble = { gain: rumbleGain, filter: rumbleFilter };
  }

  _noiseLayer(name, type, frequency, q) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.sources.push(source);
    this.layers[name] = { gain, filter };
  }

  resetTimeline() {
    this.lastMission = null;
    this.lastT = null;
    for (const source of this.cueSources) {
      try { source.stop(); } catch (error) { /* already finished */ }
    }
    this.cueSources.clear();
  }

  silence() {
    this.resetTimeline();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.effects.gain.setTargetAtTime(0, now, 0.04);
    for (const layer of Object.values(this.layers)) {
      layer.gain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  update({ mode, mission, t, playing, engine = 0, secondary = 0, wind = 0, heat = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const active = Boolean(playing);
    this.effects.gain.setTargetAtTime(active ? 1 : 0, now, 0.05);
    const thrust = active ? clamp01(engine + secondary * 0.23) : 0;
    const air = active ? clamp01(wind) : 0;
    const plasma = active ? clamp01(heat) : 0;
    const targets = {
      engineLow: Math.pow(thrust, 0.8) * 0.48,
      engineMid: Math.pow(thrust, 1.25) * 0.19,
      rumble: Math.pow(thrust, 0.7) * 0.43,
      wind: air * 0.22,
      heat: plasma * 0.14,
    };
    for (const [name, target] of Object.entries(targets)) {
      this.layers[name].gain.gain.setTargetAtTime(target, now, 0.12);
    }
    this.layers.engineLow.filter.frequency.setTargetAtTime(145 + thrust * 300, now, 0.2);
    this.layers.engineMid.filter.frequency.setTargetAtTime(420 + thrust * 620, now, 0.2);
    this.layers.wind.filter.frequency.setTargetAtTime(650 + air * 1750, now, 0.2);
    this.layers.heat.filter.frequency.setTargetAtTime(1250 + plasma * 2500, now, 0.2);

    const key = `${mode}:${mission?.id || ''}`;
    if (active && this.lastMission === key && t >= this.lastT && t - this.lastT < 1) {
      for (const event of mission?.events || []) {
        if (event.t > this.lastT && event.t <= t) this._cue(event.id);
      }
    }
    this.lastMission = key;
    this.lastT = t;
  }

  _tone(startHz, endHz, seconds, peak, type = 'sine') {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, now + seconds);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.035, seconds * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    oscillator.connect(gain).connect(this.effects);
    oscillator.start(now);
    oscillator.stop(now + seconds + 0.02);
    this.cueSources.add(oscillator);
    oscillator.onended = () => {
      this.cueSources.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  _burst(seconds, peak, frequency, type = 'bandpass') {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.03, seconds * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(now);
    source.stop(now + seconds + 0.02);
    this.cueSources.add(source);
    source.onended = () => {
      this.cueSources.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  _cue(id) {
    switch (id) {
      case 'liftoff':
        this._tone(105, 42, 1.4, 0.55, 'sawtooth');
        this._burst(1.5, 0.6, 260, 'lowpass');
        break;
      case 'maxq':
        this._tone(95, 66, 0.8, 0.12);
        this._burst(0.9, 0.2, 950);
        break;
      case 'meco':
      case 'boostback-end':
      case 'entry-end':
        this._tone(140, 54, 0.4, 0.25);
        this._burst(0.3, 0.16, 600);
        break;
      case 'stage-sep':
      case 'hot-stage':
        this._tone(750, 185, 0.55, 0.24, 'triangle');
        this._burst(0.55, 0.32, 1400);
        break;
      case 'ses':
      case 'boostback-start':
      case 'boostback':
      case 'entry-start':
      case 'landing-burn':
      case 'catch-burn':
        this._tone(60, 110, 0.75, 0.28, 'sawtooth');
        this._burst(0.9, 0.35, 480, 'lowpass');
        break;
      case 'entry':
        this._burst(1.2, 0.27, 1300);
        break;
      case 'legs':
      case 'grid-fin':
        this._burst(0.48, 0.24, 1700, 'highpass');
        this._tone(320, 115, 0.3, 0.12, 'triangle');
        break;
      case 'touchdown':
      case 'tower-catch':
        this._tone(105, 38, 1.15, 0.46, 'sawtooth');
        this._burst(0.8, 0.3, 250, 'lowpass');
        break;
      default:
        break;
    }
  }

  dispose() {
    this.enabled = false;
    this.resetTimeline();
    for (const source of this.sources) {
      try { source.stop(); } catch (error) { /* already stopped */ }
    }
    this.sources = [];
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
