// The river: one centre line with a width, from the landing to the well. Everything that needs to know where the
// water is (the boat, the banks, what grows on them, the moments along the way) asks this file. Distances are
// metres. `s` is distance along the river from the landing, `d` is metres to the right of the centre line.
import { track, fbm2, noise2, smooth, clamp } from './noise.js';

export const LENGTH = 1060;
export const STEP = 0.5;

// The five reaches, each a colour chord of its own (src/ifing/look.js) and a set piece (src/ifing/moments.js).
export const REACH = {
  naust: [0, 96],        // the landing: blue hour, the kept fire, the lone birch, one star
  iron: [96, 366],       // Jarnvidr, the Ironwood: black spruce, moss, mist, things that watch
  ve: [366, 596],        // the sanctuary: the rune gate, the mere, the stone ship under the moon
  glasir: [596, 806],    // the golden grove: red-gold leaves over black water, the loom
  well: [806, LENGTH],   // under the root and out onto the well, the white tree
};

// Half width of the channel, keyed along the river.
const WIDTH = [
  [0, 12], [50, 10.5], [96, 7.4], [130, 5.4], [196, 5.0], [232, 8.5], [262, 10.5], [300, 6.0], [340, 5.6], [372, 6.2],
  [386, 6.9], [410, 15], [470, 19], [540, 15], [590, 7.5], [630, 6.6], [700, 8.5], [742, 11.5], [772, 7.4], [806, 5.4], [842, 5.2], [872, 13],
  [920, 42], [980, 70], [LENGTH, 86],
];
// How much the river wanders: none at the landing (the first view is composed straight down it), free through the
// forest, and straight again for the last approach, so that the tree stands dead ahead through the root's arch.
const WANDER = [[0, 0], [58, 0], [150, 1], [330, 1], [372, 0.35], [470, 0.5], [600, 1], [760, 1], [822, 0.2], [880, 0], [LENGTH, 0]];

function headingAt(s) {
  return track(WANDER, s) * (0.46 * Math.sin(s / 108 + 0.5) + 0.21 * Math.sin(s / 46 + 2.0));
}

class River {
  constructor() {
    const n = Math.ceil(LENGTH / STEP);
    this.count = n + 1; this.length = n * STEP;
    this.x = new Float32Array(this.count); this.z = new Float32Array(this.count);
    this.tx = new Float32Array(this.count); this.tz = new Float32Array(this.count);
    this.hw = new Float32Array(this.count);
    let x = 0, z = 0;
    for (let i = 0; i <= n; i++) {
      const s = i * STEP, th = headingAt(s);
      this.x[i] = x; this.z[i] = z; this.tx[i] = -Math.sin(th); this.tz[i] = -Math.cos(th); this.hw[i] = track(WIDTH, s);
      const thm = headingAt(s + STEP * 0.5);
      x += -Math.sin(thm) * STEP; z += -Math.cos(thm) * STEP;
    }
  }

  /** The centre line at s: position, tangent (tx, tz), the unit vector to the right (rx, rz), half width, heading. */
  at(s, out = {}) {
    const f = Math.min(this.count - 1.0001, Math.max(0, s / STEP)), i = Math.floor(f), t = f - i, j = i + 1;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t; out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.tx = tx; out.tz = tz; out.rx = -tz; out.rz = tx;
    out.halfWidth = this.hw[i] + (this.hw[j] - this.hw[i]) * t;
    out.heading = Math.atan2(-tx, -tz);
    out.s = Math.min(this.length, Math.max(0, s));
    return out;
  }

  /** Half the water's width at s. Before the landing it opens into the bay behind; past the end, into the well. */
  halfWidth(s) {
    if (s < 0) return this.hw[0] + Math.pow(-s, 1.12) * 0.6;
    if (s > this.length) return this.hw[this.count - 1] + (s - this.length) * 1.6;
    const f = Math.min(this.count - 1.0001, s / STEP), i = Math.floor(f);
    return this.hw[i] + (this.hw[i + 1] - this.hw[i]) * (f - i);
  }

  /** World position s metres along, d metres right of the centre line. Returns [x, z]. */
  point(s, d = 0, out = [0, 0]) {
    const p = this.at(s, _a);
    // beyond either end the line runs on straight
    const over = s < 0 ? s : s > this.length ? s - this.length : 0;
    out[0] = p.x + p.rx * d + p.tx * over; out[1] = p.z + p.rz * d + p.tz * over;
    return out;
  }

  /** Project a world position onto the river: s, signed d, the half width there. `hint` keeps the search local. */
  locate(x, z, hint = null, out = {}) {
    let i0 = 0, i1 = this.count - 1;
    if (hint !== null && Number.isFinite(hint)) { const c = clamp(Math.round(hint / STEP), 0, this.count - 1); i0 = Math.max(0, c - 60); i1 = Math.min(this.count - 1, c + 60); }
    let best = i0, bd = Infinity;
    for (let i = i0; i <= i1; i++) { const dx = x - this.x[i], dz = z - this.z[i], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
    const dx = x - this.x[best], dz = z - this.z[best];
    let s = best * STEP + dx * this.tx[best] + dz * this.tz[best];
    s = clamp(s, Math.max(0, (best - 1) * STEP), Math.min(this.length, (best + 1) * STEP));
    const p = this.at(s, _a);
    out.s = s; out.d = (x - p.x) * p.rx + (z - p.z) * p.rz; out.halfWidth = p.halfWidth;
    out.tx = p.tx; out.tz = p.tz; out.rx = p.rx; out.rz = p.rz;
    return out;
  }
}
const _a = {};

export const river = new River();

// ------------------------------------------------------------------------------------------------ the banks
// How high each bank stands, keyed along the river: [s, left, right] in metres above the water a few metres back.
const BANK = [
  [0, 0.5, 0.9], [60, 0.9, 1.3], [110, 1.6, 2.2], [190, 2.4, 1.5], [236, 1.0, 3.4], [270, 0.9, 4.6], [286, 2.2, 3.4], [302, 5.0, 2.4], [322, 8.0, 2.0], [346, 5.0, 2.0], [364, 1.8, 1.8],
  [410, 0.55, 0.6], [520, 0.5, 0.7], [590, 1.2, 1.4], [700, 1.0, 1.3], [790, 1.8, 1.8], [830, 3.2, 3.2], [872, 1.2, 1.2], [940, 0.5, 0.5], [LENGTH, 0.4, 0.4],
];
const bankL = BANK.map(([s, l]) => [s, l]), bankR = BANK.map(([s, , r]) => [s, r]);

/**
 * Height of the land `out` metres outside the channel's edge on one side (-1 left, +1 right) at s.
 * Zero at the waterline, a lip of mud and roots, the bank, then the forest floor rolling away behind it.
 */
export function landHeight(s, side, out) {
  if (out <= 0) return 0;
  const bank = track(side < 0 ? bankL : bankR, s);
  const u = s * 0.11 + side * 31.7, v = out * 0.16 + side * 5.3;
  const lip = 0.16 * smooth(0, 0.7, out);
  const rise = bank * smooth(0.2, 2.6 + bank * 1.7, out) * (0.72 + 0.56 * noise2(s * 0.045 + side * 9.1, 2.3));
  const hummocks = (fbm2(u, v, 3) - 0.5) * 0.9 * smooth(0.6, 3.5, out);
  const roll = (fbm2(s * 0.021 + side * 3.3, out * 0.03 + 7.7, 3) - 0.35) * 5.5 * smooth(6, 34, out);
  return Math.max(0.02, lip + rise + hummocks + roll);
}

/** How wooded a place is, 0..1, by reach: thick in the Ironwood, open round the mere, nothing on the well. */
export const WOOD = [[-200, 0.6], [0, 0.5], [40, 0.6], [74, 0.95], [100, 1], [340, 1], [392, 0.4], [430, 0.18], [540, 0.22], [590, 0.8], [640, 1], [780, 0.9], [815, 0.45], [850, 0.12], [880, 0], [LENGTH, 0]];
export const wooded = (s) => track(WOOD, s);

/** Which reach s lies in. */
export function reachAt(s) {
  for (const k in REACH) if (s < REACH[k][1]) return k;
  return 'well';
}
