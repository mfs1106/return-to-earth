/**
 * Small, dependency-free numeric helpers shared by the simulators and renderer.
 * All simulation values are in SI units (m, s, m/s) unless a function says otherwise.
 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1);
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
export const deg = (radians) => (radians * 180) / Math.PI;
export const rad = (degrees) => (degrees * Math.PI) / 180;
export const distance2D = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

/** Scene-space centre of a rocket whose model origin is at its engine end. */
export function rocketCenter(pos, pitchDegrees, centerHeight) {
  const angle = (pitchDegrees * Math.PI) / 180;
  return {
    x: pos.x + Math.sin(angle) * centerHeight,
    y: pos.y + Math.cos(angle) * centerHeight,
    z: pos.z,
  };
}

export function formatMissionTime(seconds, withSign = true) {
  const sign = seconds < 0 ? '−' : withSign ? '+' : '';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = Math.floor(abs % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

export function formatClock(seconds) {
  const sign = seconds < 0 ? 'T−' : 'T+';
  return `${sign}${formatMissionTime(Math.abs(seconds), false)}`;
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return Math.round(value).toString();
}

/**
 * Monotone cubic Hermite interpolation (PCHIP / Fritsch–Carlson, 1980).
 * It is evaluated from the original keyframes at every frame, which makes seeking
 * backwards and forwards deterministic: no animation state is accumulated.
 */
export class MonotoneTrack {
  /**
   * @param {{t:number, values:number[], slope?:number[]}[]} keys
   */
  constructor(keys) {
    if (!Array.isArray(keys) || keys.length < 2) {
      throw new Error('MonotoneTrack needs at least two keyframes');
    }
    this.keys = [...keys].sort((a, b) => a.t - b.t);
    this.dimensions = this.keys[0].values.length;
    this.ts = this.keys.map((k) => k.t);
    this.ys = [];
    this.ms = [];
    for (let d = 0; d < this.dimensions; d += 1) {
      const y = this.keys.map((k) => k.values[d]);
      this.ys.push(y);
      this.ms.push(this._tangents(y, this.ts, d));
    }
  }

  _tangents(y, x, dimension) {
    const n = y.length;
    const h = new Array(n - 1);
    const delta = new Array(n - 1);
    for (let i = 0; i < n - 1; i += 1) {
      h[i] = x[i + 1] - x[i];
      delta[i] = (y[i + 1] - y[i]) / h[i];
    }
    const m = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i += 1) {
      if (delta[i - 1] === 0 || delta[i] === 0) {
        m[i] = 0;
      } else if (Math.sign(delta[i - 1]) !== Math.sign(delta[i])) {
        m[i] = 0;
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
      }
    }

    const forced = this.keys.map((k) => k.slope?.[dimension]);
    m[0] = forced[0] ?? this._endpointSlope(h[0], h[1], delta[0], delta[1]);
    m[n - 1] =
      forced[n - 1] ?? this._endpointSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
    return m;
  }

  _endpointSlope(h0, h1, d0, d1) {
    if (h1 === undefined || d1 === undefined) return d0;
    let slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(d0)) slope = 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > Math.abs(3 * d0)) {
      slope = 3 * d0;
    }
    return slope;
  }

  sample(time) {
    const ts = this.ts;
    const n = ts.length;
    if (time <= ts[0]) {
      return {
        values: this.ys.map((y) => y[0]),
        derivatives: this.ys.map(() => 0),
      };
    }
    if (time >= ts[n - 1]) {
      return {
        values: this.ys.map((y) => y[n - 1]),
        derivatives: this.ms.map((m) => m[n - 1]),
      };
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= time) lo = mid;
      else hi = mid;
    }
    const x0 = ts[lo];
    const x1 = ts[hi];
    const h = x1 - x0;
    const s = (time - x0) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = s3 - 2 * s2 + s;
    const h01 = -2 * s3 + 3 * s2;
    const h11 = s3 - s2;
    const values = [];
    const derivatives = [];
    for (let d = 0; d < this.dimensions; d += 1) {
      const y0 = this.ys[d][lo];
      const y1 = this.ys[d][hi];
      const m0 = this.ms[d][lo] * h;
      const m1 = this.ms[d][hi] * h;
      values.push(h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1);
      derivatives.push(
        ((6 * s2 - 6 * s) * y0 +
          (3 * s2 - 4 * s + 1) * m0 +
          (-6 * s2 + 6 * s) * y1 +
          (3 * s2 - 2 * s) * m1) /
          h,
      );
    }
    return { values, derivatives };
  }
}

/** Piecewise linear progress helper that returns 0 before start, 1 after end. */
export function progressBetween(t, start, end) {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp((t - start) / (end - start), 0, 1);
}

/** A deterministic pseudo-random generator, used by scene dressing and particles. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
