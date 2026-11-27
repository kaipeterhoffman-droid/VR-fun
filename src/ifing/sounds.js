// Sounds: everything the river is heard to do, worked out as arithmetic while the page loads. There is not a
// recording in it. Water is a crowd of bubbles (each rings at the pitch its size gives it, and dies as fast as its
// size lets it); wood is three damped notes; fire is small bangs over a flutter; a horn is a stack of overtones that
// brightens as it is blown harder. src/ifing/audio.js plays them and decides how loud; this file only makes them.
//
// Nothing here needs a browser: every maker returns plain numbers (a Float32Array at SR a second), so that each can
// be rendered, measured and looked at as a picture by itself.
import { rng } from './noise.js';

export const SR = 32000;
const TAU = Math.PI * 2;
const N = (sec) => Math.round(sec * SR);
const swell = (t, up, hold, down) => (t < 0 ? 0 : t < up ? 0.5 - 0.5 * Math.cos(Math.PI * t / up) : t < up + hold ? 1 : t < up + hold + down ? 0.5 + 0.5 * Math.cos(Math.PI * (t - up - hold) / down) : 0);

/** One second-order filter run over x where it lies. kind: 'lp', 'hp' or 'bp' (whose peak passes unchanged). */
function filter(x, kind, f, q = 0.707) {
  const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2;
  if (kind === 'lp') { b1 = 1 - c; b0 = b2 = b1 / 2; } else if (kind === 'hp') { b1 = -(1 + c); b0 = b2 = (1 + c) / 2; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * c / a0, a2 = (1 - al) / a0; b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
function white(n, rnd) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1; return x; }
/** Noise with as much in every octave: the colour of wind and of far water. */
function pink(n, rnd) {
  const x = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  return x;
}
/** Make a stretch of noise go round: its tail is folded under its head, so that the join cannot be heard. */
function round(x, fade = 0.3) {
  const f = N(fade), L = x.length - f, out = x.slice(0, L);
  for (let i = 0; i < f; i++) { const t = i / f; out[i] = x[i] * Math.sqrt(t) + x[L + i] * Math.sqrt(1 - t); }
  return out;
}
function add(out, x, at = 0, k = 1) { for (let i = 0, j = at; i < x.length && j < out.length; i++, j++) out[j] += x[i] * k; return out; }
/** Bring a sound to a loudness: its root-mean-square if `rms` is given, else its highest peak. */
function set(x, peak, rms = 0) {
  let m = 0, e = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; e += x[i] * x[i]; }
  const k = rms ? rms / Math.sqrt(e / x.length || 1) : peak / (m || 1);
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}
function ends(x, a = 0.004, b = 0.02) { const na = N(a), nb = N(b), n = x.length; for (let i = 0; i < na; i++) x[i] *= i / na; for (let i = 0; i < nb; i++) x[n - 1 - i] *= i / nb; return x; }

// ---------------------------------------------------------------------------------------------------- water
/**
 * One bubble of air under water, radius r metres. It rings at 3/r hertz, loses its ring to heat and to the sound it
 * makes, and if it is rising (xi > 0) its pitch climbs as it nears the surface: that climb is the "plink" in a drop.
 */
function bubble(out, at, r, amp, xi = 0, wrap = false) {
  const f0 = 3 / r, d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5), len = Math.min(N(6.5 / d), N(0.6)), n = out.length;
  for (let i = 0; i < len; i++) {
    const t = i / SR; let j = at + i; if (j >= n) { if (!wrap) break; j -= n; }
    out[j] += amp * Math.sin(TAU * f0 * (t + 0.5 * xi * d * t * t)) * Math.exp(-d * t);
  }
}
/** A size for a bubble, millimetres: many small ones and few large, as in any water that is moving. */
const size = (rnd, r0, r1, a = 1.7) => Math.pow(Math.pow(r0, 1 - a) + rnd() * (Math.pow(r1, 1 - a) - Math.pow(r0, 1 - a)), 1 / (1 - a));

/** Water talking to itself for `sec` seconds, and coming round again: bubbles in little runs, as a trickle makes them. */
function babble(sec, seed, { runs, r0, r1, rise = 0.3, alpha = 1.7 }) {
  const out = new Float32Array(N(sec)), rnd = rng(seed), n = out.length;
  for (let k = 0; k < Math.round(sec * runs); k++) {
    const t0 = rnd() * n, many = 1 + Math.floor(rnd() * rnd() * 7), spread = N(0.02 + rnd() * 0.12), loud = 0.25 + rnd() * rnd();
    for (let q = 0; q < many; q++) { const r = size(rnd, r0, r1, alpha); bubble(out, Math.floor(t0 + rnd() * spread) % n, r * 1e-3, r * loud * (0.4 + rnd() * 0.6), rnd() < 0.5 ? rise * rnd() : 0, true); }
  }
  return out;
}
/** A blade going into the water: the slap of it, the air it takes down, and that air coming up again. */
function splash(seed, big = 1) {
  const rnd = rng(seed), out = new Float32Array(N(0.9)), slap = filter(white(N(0.5), rnd), 'bp', 1500 + rnd() * 700, 0.6), low = filter(white(N(0.3), rnd), 'bp', 420 + rnd() * 160, 0.8);
  for (let i = 0; i < slap.length; i++) { const t = i / SR; slap[i] *= Math.min(1, t / 0.006) * Math.exp(-t / 0.085); }
  for (let i = 0; i < low.length; i++) { const t = i / SR; low[i] *= Math.min(1, t / 0.004) * Math.exp(-t / 0.05); }
  add(out, slap, 0, 0.5); add(out, low, 0, 0.6);
  for (let k = 0; k < 50 * big; k++) { const t = 0.012 + 0.6 * rnd() * rnd(), r = size(rnd, 0.8, 6.5); bubble(out, N(t), r * 1e-3, r * 0.05 * (1.1 - t), rnd() < 0.6 ? 0.35 * rnd() : 0); }
  return ends(set(out, 0.9), 0.001, 0.05);
}
/** One drop from the blade's tip. `deep`: a heavier drop into still water, that answers itself a moment after. */
function drip(seed, deep = false) {
  const rnd = rng(seed), out = new Float32Array(N(deep ? 0.5 : 0.16)), r = deep ? 2.6 + rnd() * 1.4 : 1.1 + rnd() * 1.3, tick = filter(white(N(0.004), rnd), 'hp', 3000);
  add(out, tick, 0, 0.12); bubble(out, N(0.003), r * 1e-3, 1, 0.3 + rnd() * 0.3);
  if (deep) { bubble(out, N(0.05 + rnd() * 0.03), r * 0.62e-3, 0.45, 0.4); bubble(out, N(0.13 + rnd() * 0.04), r * 0.8e-3, 0.2, 0.2); }
  return ends(set(out, 0.9), 0.0005, 0.02);
}
/** Something the size of a head going under, and the water closing over it. */
function plunge() {
  const rnd = rng(911), out = new Float32Array(N(2.0)), hush = filter(white(N(0.9), rnd), 'bp', 650, 0.7);
  for (let i = 0; i < hush.length; i++) { const t = i / SR; hush[i] *= Math.min(1, t / 0.03) * Math.exp(-t / 0.22); }
  add(out, hush, 0, 0.35);
  for (let k = 0; k < 16; k++) { const t = 0.02 + 0.5 * rnd() * rnd(); bubble(out, N(t), (7 + rnd() * 16) * 1e-3, 0.5 + rnd() * 0.5, 0.15 * rnd()); }
  for (let k = 0; k < 60; k++) { const t = 0.15 + 1.5 * rnd(), r = size(rnd, 0.8, 5); bubble(out, N(t), r * 1e-3, r * 0.04 * (1.7 - t), 0.3 * rnd()); }
  return ends(set(out, 0.9), 0.002, 0.1);
}
/** The river against her planks: a slow, uneven patting, with the hollow of the hull under it. Goes round. */
function lapping(sec, seed) {
  const rnd = rng(seed), out = new Float32Array(N(sec)), n = out.length; let t = 0.3;
  while (t < sec - 0.2) {
    const loud = 0.35 + rnd() * 0.65, many = 3 + Math.floor(rnd() * 6);
    for (let q = 0; q < many; q++) bubble(out, N(t + rnd() * 0.16) % n, (3.5 + rnd() * rnd() * 9) * 1e-3, loud * (0.3 + rnd() * 0.7), 0.2 * rnd(), true);
    const pat = filter(white(N(0.22), rnd), 'bp', 300 + rnd() * 240, 1.4); for (let i = 0; i < pat.length; i++) { const u = i / SR; pat[i] *= Math.min(1, u / 0.02) * Math.exp(-u / 0.05) * loud * 2.2; }
    for (let i = 0, j = N(t); i < pat.length; i++, j++) out[j % n] += pat[i];
    t += 0.7 + rnd() * rnd() * 2.4;
  }
  return set(out, 0.9);
}

// ---------------------------------------------------------------------------------------------------- wood and fire
/** A thing of wood struck once: `notes` are [hertz, seconds to die away, loudness]. */
function knock(seed, notes, sec, tap = 0.3) {
  const rnd = rng(seed), out = new Float32Array(N(sec)), tick = filter(white(N(0.006), rnd), 'lp', 2800);
  for (let i = 0; i < tick.length; i++) tick[i] *= 1 - i / tick.length;
  add(out, tick, 0, tap);
  for (const [f, tau, a] of notes) { const ff = f * (0.93 + rnd() * 0.14), ph = rnd() * 0.6; for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] += a * Math.sin(TAU * ff * t + ph) * Math.exp(-t / tau); } }
  return ends(set(out, 0.9), 0.0004, 0.03);
}
/** A fire a little way off: the bangs of sap, the flutter of the flame, the hiss of what is wet in it. Goes round. */
function crackle(sec, seed) {
  const rnd = rng(seed), n = N(sec), out = new Float32Array(n);
  for (let k = 0; k < sec * 22; k++) {
    const at = Math.floor(rnd() * n), f = 1400 + rnd() * rnd() * 6500, tau = 0.0004 + rnd() * rnd() * 0.004, amp = Math.min(0.6, 0.035 / (Math.pow(rnd(), 1.6) + 0.035)), len = N(tau * 7), ph = rnd() * TAU;
    for (let i = 0; i < len; i++) { const t = i / SR; out[(at + i) % n] += amp * Math.sin(TAU * f * t + ph) * Math.exp(-t / tau); }
  }
  const roar = round(filter(filter(white(n + N(0.3), rnd), 'lp', 520, 0.6), 'hp', 90)), beat = round(filter(white(n + N(0.3), rnd), 'lp', 7, 0.8)), hiss = round(filter(white(n + N(0.3), rnd), 'hp', 3800));
  set(roar, 0, 0.022); set(beat, 0, 0.3); set(hiss, 0, 0.006);
  for (let i = 0; i < n; i++) { const b = Math.max(0.2, 1 + 1.4 * beat[i]); out[i] = out[i] + roar[i] * b + hiss[i] * b; }
  return set(out, 0.9);
}
/** Leaves of beaten gold touching one another in a wind: a rustle that rings. Goes round. */
function goldLeaves(sec, seed) {
  const rnd = rng(seed), n = N(sec), out = new Float32Array(n);
  const gust = (t) => { const u = t / sec * TAU; return Math.max(0, 0.42 + 0.3 * Math.sin(u * 2 + seed) + 0.22 * Math.sin(u * 3 + 1.3 * seed) + 0.16 * Math.sin(u * 7 + 2)); };
  for (let k = 0; k < sec * 70; k++) {
    const t0 = rnd() * sec, g = gust(t0); if (rnd() > g) continue;
    const f = 2300 * Math.pow(3.6, rnd()), tau = (0.008 + rnd() * rnd() * 0.05) * 3000 / f, amp = rnd() * rnd() * (0.3 + g), at = N(t0), len = N(tau * 6.5);
    for (let i = 0; i < len; i++) { const t = i / SR, e = Math.exp(-t / tau); out[(at + i) % n] += amp * e * (Math.sin(TAU * f * t) + 0.42 * e * Math.sin(TAU * f * 2.76 * t) + (f * 5.4 < SR * 0.45 ? 0.18 * e * e * Math.sin(TAU * f * 5.4 * t) : 0)); }
  }
  return set(out, 0.9);
}

// ---------------------------------------------------------------------------------------------------- voices
/** The great owl of the North, a long way into the trees: two notes, the second lower and let fall. */
function owl() {
  const out = new Float32Array(N(1.5)), rnd = rng(31), air = filter(white(out.length, rnd), 'bp', 320, 3); let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, a = swell(t, 0.1, 0.28, 0.22), b = swell(t - 0.82, 0.07, 0.1, 0.24) * 0.6, e = a + b;
    const f = (t < 0.8 ? 318 - 16 * t : 286 - 30 * (t - 0.82)) + 2.5 * Math.sin(TAU * 5.2 * t); ph += TAU * f / SR;
    out[i] = e * (Math.sin(ph) + 0.14 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph)) + air[i] * e * 0.5;
  }
  return set(out, 0.9);
}
/** A raven's one word. */
function croak(seed) {
  const rnd = rng(seed), out = new Float32Array(N(0.46)), air = filter(white(out.length, rnd), 'bp', 1500, 1.2), f0 = 250 + rnd() * 40, rough = 62 + rnd() * 16; let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, e = swell(t, 0.03, 0.2, 0.2), f = f0 * (1.06 - 0.16 * t / 0.46); ph += TAU * f / SR;
    let v = 0; for (let k = 1; k <= 14; k++) { const fk = f * k, g = Math.exp(-(((fk - 1150) / 520) ** 2)) + 0.6 * Math.exp(-(((fk - 2300) / 600) ** 2)) + 0.12; v += g * Math.sin(k * ph + k * k * 0.7); }
    out[i] = e * (v * (0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(TAU * rough * t), 0.5)) + air[i] * 1.6);
  }
  return set(out, 0.9);
}
/** A horn of bronze blown from a height a long way down the river: one note, then the fifth above it, held. */
function horn() {
  const out = new Float32Array(N(6.6)), rnd = rng(47), air = filter(white(out.length, rnd), 'bp', 1900, 0.8);
  const roll = []; for (let k = 1; k <= 13; k++) roll.push(1 / Math.pow(k, 0.75));
  const blow = (t0, up, hold, down, f0, amp) => {
    let ph = 0;
    for (let i = N(t0); i < Math.min(out.length, N(t0 + up + hold + down)); i++) {
      const t = i / SR - t0, e = swell(t, up, hold, down) * (1 + 0.035 * Math.sin(TAU * 4.6 * t)), f = f0 * (1 - 0.035 * Math.exp(-t / 0.07)); ph += TAU * f / SR;
      // each overtone is the one below it times the square root of the breath, so a soft note is dull and a hard one bright
      const c2 = 2 * Math.cos(ph), rt = Math.sqrt(e); let v = 0, s0 = 0, s1 = Math.sin(ph), p = e;
      for (let k = 1; k <= 13; k++) { v += p * roll[k - 1] * s1; const s2 = c2 * s1 - s0; s0 = s1; s1 = s2; p *= rt; }
      out[i] += amp * (v + air[i] * e * 0.25);
    }
  };
  blow(0, 0.35, 1.5, 0.5, 146.83, 0.75); blow(2.05, 0.4, 2.6, 1.4, 220, 1);
  return set(out, 0.9);
}
/** Stone that has not moved since the frost came, moving: a great weight turned over, heard through the ground. */
function groan() {
  const sec = 7, n = N(sec), rnd = rng(59), out = new Float32Array(n), rum = filter(filter(white(n, rnd), 'lp', 260, 0.8), 'lp', 520);
  set(rum, 0, 0.5);
  const env = (t) => swell(t, 1.8, 1.4, 3.6);
  for (let k = 0; k < 520; k++) {                                              // the grinding: a great many small heavy knocks
    const t0 = 0.4 + rnd() * 6, e = env(t0); if (rnd() > e) continue;
    const f = 170 + rnd() * rnd() * 800, tau = 0.005 + rnd() * 0.018, amp = e * (0.25 + rnd() * 0.75), at = N(t0), len = N(tau * 6);
    for (let i = 0; i < len && at + i < n; i++) { const t = i / SR; out[at + i] += amp * 0.5 * Math.sin(TAU * f * t) * Math.exp(-t / tau); }
  }
  const tones = [61.7, 92.5, 123.5, 185], ph = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = env(t), fall = 1 - 0.09 * t / sec; let v = 0;
    for (let k = 0; k < 4; k++) { ph[k] += TAU * tones[k] * fall / SR; v += (Math.sin(ph[k]) + 0.6 * Math.sin(2 * ph[k]) + 0.45 * Math.sin(3 * ph[k]) + 0.25 * Math.sin(5 * ph[k])) * (0.55 + 0.45 * Math.sin(TAU * (0.31 + k * 0.17) * t + k)) / (1 + k * 0.6); }
    out[i] += e * (rum[i] * 0.8 + v * 0.3);
  }
  return ends(set(out, 0.9), 0.01, 0.2);
}
/** One string of a lyre, D above middle C: a stack of overtones, the high ones gone first. */
function pluck() {
  const out = new Float32Array(N(3.2)), rnd = rng(71), tick = filter(white(N(0.004), rnd), 'bp', 2400, 1), f0 = 293.66;
  add(out, tick, 0, 0.25);
  for (let k = 1; k <= 10; k++) {
    const f = f0 * k * Math.sqrt(1 + 0.00035 * k * k), a = Math.abs(Math.sin(Math.PI * k * 0.21)) / Math.pow(k, 1.15), tau = 1.5 / Math.sqrt(1 + 0.45 * (k - 1) * (k - 1));
    for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] += a * Math.sin(TAU * f * t) * Math.exp(-t / tau); }
  }
  return ends(set(out, 0.9), 0.0005, 0.3);
}
/** A crew at the oars, heard through water: forty blades taken together, four strokes, and round again. */
function crew(sec = 9.2) {
  const rnd = rng(83), n = N(sec), out = new Float32Array(n), stroke = sec / 4;
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < 16; k++) {                                              // the oars come against their ports, never quite as one
      const at = N(s * stroke + 0.1 + rnd() * rnd() * 0.16), f = 120 + rnd() * 160, tau = 0.03 + rnd() * 0.04, amp = 0.3 + rnd() * 0.7;
      for (let i = 0; i < N(tau * 6); i++) { const t = i / SR; out[(at + i) % n] += amp * Math.sin(TAU * f * t) * Math.exp(-t / tau) * Math.min(1, t / 0.002); }
    }
    const pull = filter(white(N(1.3), rnd), 'bp', 300, 0.7);                    // and the water they shift
    for (let i = 0; i < pull.length; i++) { const t = i / SR; out[(N(s * stroke + 0.2) + i) % n] += pull[i] * swell(t, 0.25, 0.3, 0.7) * 2.2; }
  }
  return set(filter(out, 'lp', 700), 0.9);
}

/** One beat of a great wing: air pushed down, and let go. */
function flap(seed) {
  const rnd = rng(seed), out = new Float32Array(N(0.34)), air = filter(white(out.length, rnd), 'bp', 420 + rnd() * 120, 0.7), hush = filter(white(out.length, rnd), 'bp', 1500, 0.6);
  for (let i = 0; i < out.length; i++) { const t = i / SR, e = Math.min(1, t / 0.035) * Math.exp(-t / 0.07); out[i] = air[i] * e + hush[i] * e * e * 0.35; }
  return ends(set(out, 0.9), 0.002, 0.05);
}

/** A room for the sounds to be in: what a wooded valley gives back, left and right, the high sounds lost first. */
function valley(seed) {
  const rnd = rng(seed), n = N(3.0), out = new Float32Array(n), pre = N(0.018);
  const band = (kind, f, q, tau, k) => { const x = filter(white(n, rnd), kind, f, q); for (let i = pre; i < n; i++) out[i] += x[i] * Math.exp(-(i - pre) / SR / tau) * k; };
  band('lp', 380, 0.7, 0.66, 3.2); band('bp', 700, 0.6, 0.56, 1.4); band('bp', 1700, 0.6, 0.42, 0.8); band('hp', 3400, 0.7, 0.17, 0.22);
  for (let k = 0; k < 7; k++) out[N(0.004 + rnd() * 0.06)] += (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5) * 6;      // the near banks answer first
  let e = 0; for (let i = 0; i < n; i++) e += out[i] * out[i];
  const k = 1 / Math.sqrt(e); for (let i = 0; i < n; i++) out[i] *= k;      // (as much comes out as goes in)
  return out;
}

/**
 * Everything, by name. `pause` is awaited between the makers so that the page can draw while they work.
 * Those that go round end where they began; the rest are said once.
 */
export async function composeSounds(pause = async () => {}) {
  const S = {};
  const make = async (name, fn) => { S[name] = fn(); await pause(); };
  await make('pinkL', () => set(round(filter(pink(N(5.3), rng(101)), 'hp', 30)), 0, 0.2));
  await make('pinkR', () => set(round(filter(pink(N(6.1), rng(102)), 'hp', 30)), 0, 0.2));
  await make('trickle', () => set(babble(5.3, 111, { runs: 26, r0: 0.5, r1: 2.6 }), 0.9));
  await make('brook', () => set(babble(7.1, 112, { runs: 15, r0: 0.9, r1: 6 }), 0.9));
  await make('glug', () => set(babble(8.9, 113, { runs: 2.6, r0: 4, r1: 13, rise: 0.15, alpha: 1.3 }), 0.9));
  await make('lap', () => lapping(9.7, 121));
  for (let k = 0; k < 4; k++) await make('splash' + k, () => splash(130 + k));
  for (let k = 0; k < 4; k++) await make('drip' + k, () => drip(140 + k));
  for (let k = 0; k < 3; k++) await make('drop' + k, () => drip(150 + k, true));
  for (let k = 0; k < 3; k++) await make('thunk' + k, () => knock(160 + k, [[236, 0.05, 1], [528, 0.03, 0.7], [1180, 0.013, 0.4]], 0.3));
  await make('bump', () => knock(170, [[92, 0.12, 1], [158, 0.085, 0.9], [305, 0.05, 0.7], [640, 0.02, 0.35]], 0.7, 0.5));
  await make('plunge', plunge);
  await make('fire', () => crackle(6.1, 181));
  await make('goldL', () => goldLeaves(11.3, 191));
  await make('goldR', () => goldLeaves(9.1, 192));
  await make('owl', owl);
  for (let k = 0; k < 2; k++) await make('croak' + k, () => croak(200 + k));
  await make('horn', horn);
  await make('groan', groan);
  await make('pluck', pluck);
  await make('crew', crew);
  for (let k = 0; k < 2; k++) await make('flap' + k, () => flap(220 + k));
  await make('roomL', () => valley(211));
  await make('roomR', () => valley(212));
  return S;
}
