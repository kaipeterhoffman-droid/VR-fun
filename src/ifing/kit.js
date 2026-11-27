// Kit: what the set pieces are made of. Placing things by the river's own measure, stone (boulders, standing stones,
// words cut in runes), fire.
import * as THREE from 'three';
import { Builder, col, mulCol, mixCol } from './build.js';
import { lump, tube, ico } from './flora.js';
import { river, landHeight, LENGTH } from './river.js';
import { runeRegion, WOOD_U } from './art.js';
import { rng, fbm2, noise2, clamp } from './noise.js';
import { makeFlames, makeMotes } from './fx.js';
import { makePaint } from './paint.js';
import { buildLantern } from './craft.js';

export const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0), _p = [0, 0], _a = {}, _l = {};

/** A place given the river's way: s metres down it, d metres right of its middle, y above the water. */
export function spot(s, d = 0, y = 0, out = new THREE.Vector3()) { const p = river.point(s, d, _p); return out.set(p[0], y, p[1]); }
/** The height of the ground at a place in the world (0 on the water). */
export function groundAt(x, z, hint = null) {
  const l = river.locate(x, z, hint, _l), out = Math.abs(l.d) - l.halfWidth;
  return out > 0 ? landHeight(l.s, Math.sign(l.d) || 1, out) : 0;
}
/** A place on a bank: side -1 (left) or 1, `out` metres back from the water's edge, `lift` above the ground there. */
export function onBank(s, side, out, lift = 0, v = new THREE.Vector3()) {
  const p = river.point(s, side * (river.halfWidth(s) + out), _p);
  return v.set(p[0], (out > 0 ? landHeight(s, side, out) : 0) + lift, p[1]);
}
/** A frame standing at `pos`: its -z looks down the river as the river runs at s, turned by yaw; +x is to the right. */
export function frame(pos, s, yaw = 0, scale = 1) {
  const h = river.at(clamp(s, 0, LENGTH), _a).heading;
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(UP, h + yaw), new THREE.Vector3(scale, scale, scale));
}

// ------------------------------------------------------------------------------------------------ stone
const ROCK = col('#7a766e'), ROCK_DARK = col('#4c4a46'), LICHEN = col('#a9ad98');
const tinted = (c, t) => (t ? [c[0] * t[0], c[1] * t[1], c[2] * t[2]] : c);
/** A boulder of any size, grey with pale lichen where the noise is high. (The moss on its back is the material's.) */
export function rock(b, x, y, z, sx, sy, sz, seed, detail = 1, tint = null, rough = 0.28, flat = 0.6) {
  lump(b, x, y, z, sx, sy, sz, detail, seed, rough, (nx, ny, nz, w) => {
    let c = mulCol(mixCol(ROCK_DARK, ROCK, w * 1.3), 0.8 + 0.3 * ny);
    if (w > 0.6) c = mixCol(c, LICHEN, Math.min(1, (w - 0.6) * 1.8));
    return tinted(c, tint);
  }, flat, 0, 0.05);
}
/**
 * A crag: living rock, in planes. Unlike rock() nothing is smoothed: every face is flat and takes the light whole, and
 * the stone is bedded in ledges `bed` metres thick, so that a cliff of it reads as a cliff from across a lake.
 */
export function crag(b, x, y, z, sx, sy, sz, seed, detail = 2, tint = null, rough = 0.3, bed = 1.5, flat = 1) {
  const { v, f } = ico(detail), n = v.length, P = new Float32Array(n * 3), C = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = v[i], w = fbm2(p[0] * 1.5 + seed * 3.1 + p[1] * 1.2, p[2] * 1.5 + seed * 1.7 - p[1] * 0.8, 3), w2 = noise2(p[0] * 4.1 + seed, p[2] * 4.1 + p[1] * 3.3);
    const k = 1 + (w - 0.5) * 2 * rough + (w2 - 0.5) * rough * 0.6;
    let X = p[0] * k * sx, Y = p[1] * k * sy, Z = p[2] * k * sz; if (Y < 0) Y *= flat;
    let band = 0;
    if (bed > 0) {
      band = Math.floor((y + Y) / bed + (w2 - 0.5) * 0.7); const yq = (band + 0.5) * bed - y, step = 1 + ((band & 1) ? 0.055 : -0.045);
      Y += (yq - Y) * 0.72; X *= step; Z *= step;
    }
    P[i * 3] = x + X; P[i * 3 + 1] = y + Y; P[i * 3 + 2] = z + Z;
    let c = mixCol(ROCK_DARK, ROCK, clamp(w * 1.5 - 0.15 + ((band & 1) ? 0.14 : -0.08)));
    if (w > 0.64) c = mixCol(c, LICHEN, Math.min(1, (w - 0.64) * 2.4));
    C[i] = tinted(c, tint);
  }
  for (const [ia, ib, ic] of f) {
    const a = ia * 3, bb = ib * 3, c = ic * 3;
    const ux = P[bb] - P[a], uy = P[bb + 1] - P[a + 1], uz = P[bb + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    const out = nx * ((P[a] + P[bb] + P[c]) / 3 - x) + ny * ((P[a + 1] + P[bb + 1] + P[c + 1]) / 3 - y) + nz * ((P[a + 2] + P[bb + 2] + P[c + 2]) / 3 - z) >= 0 ? 1 : -1;
    const k = 0.86 + 0.2 * ny * out;
    const i0 = b.vert(P[a], P[a + 1], P[a + 2], nx * out, ny * out, nz * out, mulCol(C[ia], k)), i1 = b.vert(P[bb], P[bb + 1], P[bb + 2], nx * out, ny * out, nz * out, mulCol(C[ib], k)), i2 = b.vert(P[c], P[c + 1], P[c + 2], nx * out, ny * out, nz * out, mulCol(C[ic], k));
    if (out > 0) b.tri(i0, i1, i2); else b.tri(i0, i2, i1);
  }
}
/** The same shape with nothing smoothed: every face flat, as split stone is. (For tubes and lumps that should be rock.) */
export function facet(src) {
  const out = new Builder(src.ni), P = src.pos, N = src.nor, C = src.col;
  for (let i = 0; i < src.ni; i += 3) {
    const a = src.idx[i] * 3, b = src.idx[i + 1] * 3, c = src.idx[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    const o = nx * (N[a] + N[b] + N[c]) + ny * (N[a + 1] + N[b + 1] + N[c + 1]) + nz * (N[a + 2] + N[b + 2] + N[c + 2]) >= 0 ? 1 : -1, k = 0.9 + 0.16 * ny * o;
    const q = (j) => out.vert(P[j], P[j + 1], P[j + 2], nx * o, ny * o, nz * o, [C[j] * k, C[j + 1] * k, C[j + 2] * k]);
    const i0 = q(a), i1 = q(b), i2 = q(c);
    if (o > 0) out.tri(i0, i1, i2); else out.tri(i0, i2, i1);
  }
  return out;
}
/** The colour of a place on a rock, for shapes that are not made by rock() or crag(). */
export function stoneAt(u, v, tint = null) {
  const w = fbm2(u * 1.7 + 3.1, v * 1.7 + 1.3, 3); let c = mixCol(ROCK_DARK, ROCK, clamp(w * 1.5 - 0.15));
  if (w > 0.64) c = mixCol(c, LICHEN, Math.min(1, (w - 0.64) * 2.4));
  return tinted(c, tint);
}
/** A standing stone: a slab set on end, a little out of true, its foot at the origin (and 0.5 m under it). */
export function menhir(b, w, h, t, seed, m = null, tint = null) {
  const rnd = rng(seed), tmp = new Builder(120), rings = 7, sides = 8, lx = (rnd() - 0.5) * 0.13, lz = (rnd() - 0.5) * 0.13, rows = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, y = -0.5 + (h + 0.5) * v, taper = 1 - 0.4 * Math.pow(v, 1.7) + 0.08 * Math.sin(v * 5 + seed), row = [];
    for (let j = 0; j < sides; j++) {
      const a = j / sides * TAU, cs = Math.cos(a), sn = Math.sin(a), k = 1 / Math.pow(Math.pow(Math.abs(cs), 4) + Math.pow(Math.abs(sn), 4), 0.25);
      const n = 0.84 + 0.32 * fbm2(cs * 1.3 + seed * 3.7 + v * 2.2, sn * 1.3 + v * 1.7 + seed, 3), wv = fbm2(a * 2 + seed, v * 6 + seed * 2, 2);
      let c = mulCol(mixCol(ROCK_DARK, ROCK, wv * 1.3), 0.72 + 0.38 * v); if (wv > 0.6) c = mixCol(c, LICHEN, Math.min(1, (wv - 0.6) * 1.8));
      row.push(tmp.vert(cs * k * w / 2 * taper * n + lx * y, y, sn * k * t / 2 * taper * n + lz * y, cs, 0, sn, tinted(c, tint)));
    }
    rows.push(row);
  }
  const top = tmp.vert(lx * h, h + 0.1 * w, lz * h, 0, 1, 0, tinted(mulCol(ROCK, 0.95), tint));
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) { const j1 = (j + 1) % sides; tmp.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j1], rows[i][j1]); }
  for (let j = 0; j < sides; j++) tmp.tri(top, rows[rings][(j + 1) % sides], rows[rings][j]);
  tmp.smoothNormals(); b.add(tmp, m);
}

/**
 * A stone set on end as it came off the hill: split faces, a head that is not level, no two sides alike. Its foot is
 * at the origin (and 0.6 m under it). o: { sides, a0, even } for a slab with a known face (a stone to be written on).
 * Returns its corners ring by ring, [[x, y, z], ...] in its own frame.
 */
export function monolith(b, w, h, t, seed, m = null, tint = null, o = {}) {
  const rnd = rng(seed), tmp = new Builder(80), sides = o.sides || 5 + Math.floor(rnd() * 2), rings = h > 4.5 ? 6 : 4, rows = [], at = [];
  const lx = (rnd() - 0.5) * 0.1, lz = (rnd() - 0.5) * 0.1, tiltA = rnd() * TAU, tilt = 0.07 + rnd() * 0.16, a0 = o.a0 ?? rnd() * TAU, rad = [], ang = [], jit = o.even ? 0.12 : 0.5;
  for (let j = 0; j < sides; j++) { rad.push(0.8 + rnd() * 0.42); ang.push(a0 + (j + (rnd() - 0.5) * jit) / sides * TAU); }
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, taper = 1 - 0.4 * Math.pow(v, 1.5) + 0.07 * Math.sin(v * 4 + seed), row = [], pr = [];
    for (let j = 0; j < sides; j++) {
      const a = ang[j] + (rnd() - 0.5) * 0.14, cs = Math.cos(a), sn = Math.sin(a), k = rad[j] * taper * (0.92 + rnd() * 0.16);
      const y = -0.6 + (h + 0.6) * v * (i === rings ? 1 + tilt * Math.cos(a - tiltA) : 1), x = cs * k * w / 2 + lx * y, z = sn * k * t / 2 + lz * y;
      row.push(tmp.vert(x, y, z, cs, 0.1, sn, mulCol(stoneAt(a * 1.3 + seed, v * 3 + seed * 0.7, tint), 0.66 + 0.44 * v))); pr.push([x, y, z]);
    }
    rows.push(row); at.push(pr);
  }
  const top = tmp.vert(lx * h, h * (1 + tilt * 0.25), lz * h, 0, 1, 0, stoneAt(seed, seed * 2.3, tint));
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) { const j1 = (j + 1) % sides; tmp.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j1], rows[i][j1]); }
  for (let j = 0; j < sides; j++) tmp.tri(top, rows[rings][(j + 1) % sides], rows[rings][j]);
  b.add(facet(tmp), m);
  return at;
}

/**
 * Cut a word in runes: `o` the lower left of the first rune, `right` and `up` the directions of the line and of the
 * staves ([x, y, z], unit), h the height of a rune. Letters the futhark has not got leave a space. Returns the length.
 */
export function runes(b, text, o, right, up, h, c = [1, 1, 1], m = null, pitch = 0.62) {
  const tmp = new Builder(text.length * 4), w = h * 0.5; let x = 0;
  for (const ch of text) {
    const reg = runeRegion(ch);
    if (reg) {
      const P = (dx, dy) => [o[0] + right[0] * (x + dx) + up[0] * dy, o[1] + right[1] * (x + dx) + up[1] * dy, o[2] + right[2] * (x + dx) + up[2] * dy];
      const p0 = P(0, h), p1 = P(w, h), p2 = P(w, 0), p3 = P(0, 0);
      const a = tmp.vert(p0[0], p0[1], p0[2], 0, 0, 1, c, reg[0], reg[1]), d = tmp.vert(p1[0], p1[1], p1[2], 0, 0, 1, c, reg[2], reg[1]);
      const e = tmp.vert(p2[0], p2[1], p2[2], 0, 0, 1, c, reg[2], reg[3]), f = tmp.vert(p3[0], p3[1], p3[2], 0, 0, 1, c, reg[0], reg[3]);
      tmp.quad(a, d, e, f);
    }
    x += h * pitch;
  }
  tmp.smoothNormals(); b.add(tmp, m);
  return x;
}

// ------------------------------------------------------------------------------------------------ fire
const CHAR = [0.16, 0.13, 0.12];
/**
 * A kept fire: a ring of stones and a stack of logs (into the builders given), tongues of flame, sparks, a light
 * that breathes. `ctx` is the stage; pos the middle of the hearth on the ground. Returns its handle:
 * { light, power } where power (0..1) may be turned down.
 */
export function fire(ctx, stone, wood, pos, s, size = 1, mirror = true) {
  const rnd = rng(Math.round(pos.x * 7 + pos.z * 13));
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + rnd() * 0.3, r = 0.55 * size; rock(stone, pos.x + Math.cos(a) * r, pos.y + 0.04, pos.z + Math.sin(a) * r, (0.14 + rnd() * 0.08) * size, (0.11 + rnd() * 0.06) * size, (0.14 + rnd() * 0.08) * size, 800 + k, 0, [0.8, 0.76, 0.74]); }
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.4, r = 0.34 * size; tube(wood, [[pos.x + Math.cos(a) * r, pos.y + 0.02, pos.z + Math.sin(a) * r, 0.055 * size], [pos.x - Math.cos(a) * 0.05, pos.y + 0.5 * size, pos.z - Math.sin(a) * 0.05, 0.04 * size]], 5, () => CHAR, null, true, WOOD_U.tar); }
  const flames = [];
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU, r = (k === 0 ? 0 : 0.16) * size; flames.push({ x: pos.x + Math.cos(a) * r, y: pos.y + 0.08, z: pos.z + Math.sin(a) * r, height: (k === 0 ? 1.25 : 0.7 + rnd() * 0.35) * size, width: (k === 0 ? 0.62 : 0.42) * size, power: 1.5 }); }
  const fl = makeFlames(flames); ctx.world.add(fl, s, mirror);
  const sparks = [];
  for (let k = 0; k < 16; k++) sparks.push({ x: pos.x + (rnd() - 0.5) * 0.3 * size, y: pos.y + 0.5 * size, z: pos.z + (rnd() - 0.5) * 0.3 * size, roam: (1.6 + rnd() * 2.2) * size, size: 0.012 + rnd() * 0.012, speed: 0.6 + rnd() * 0.9, kind: 1, color: [2.2, 0.9, 0.25] });
  const sp = makeMotes(sparks); ctx.world.add(sp, s, mirror);
  const at = new THREE.Vector3(pos.x, pos.y + 0.55 * size, pos.z), ph = rnd() * 10;
  const light = { position: at, color: new THREE.Color('#ff8a34'), radius: 13 * size, intensity: 1.5 };
  ctx.lights.push(light);
  const core = ctx.glows.add({ position: at, size: 0.75 * size, color: new THREE.Color('#ffc070'), power: 1.0, flicker: 0.5 });
  const halo = ctx.glows.add({ position: new THREE.Vector3(pos.x, pos.y + 0.9 * size, pos.z), size: 3.4 * size, color: new THREE.Color('#ff7a2a'), power: 0.32, flicker: 0.3 });
  const h = { light, power: 1, flames: fl, sparks: sp, at }, voice = ctx.voice('fire', at, 34 * size);
  ctx.ticks.push((dt, time) => {
    voice.level = h.power;
    const f = (0.84 + 0.1 * Math.sin(time * 9.1 + ph) * Math.sin(time * 5.7 + ph * 2) + 0.06 * Math.sin(time * 17.3 + ph)) * h.power;
    light.intensity = 1.5 * f; core.power = 1.0 * f; halo.power = 0.32 * f; fl.visible = sp.visible = h.power > 0.02;
  });
  return h;
}

// ------------------------------------------------------------------------------------------------ growth
/** A card of cut-out painting hanging from a point: its top edge fixed, its bottom free in the wind. */
export function hang(cut, x, y, z, w, len, yaw, reg, tint = [1, 1, 1], m = null) {
  const cs = Math.cos(yaw) * w / 2, sn = Math.sin(yaw) * w / 2, tmp = m ? new Builder(4) : cut, n = [-Math.sin(yaw), 0.5, Math.cos(yaw)];
  const a = tmp.vert(x - cs, y, z - sn, n[0], n[1], n[2], tint, reg[0], reg[1], 0.05), d = tmp.vert(x + cs, y, z + sn, n[0], n[1], n[2], tint, reg[2], reg[1], 0.05);
  const e = tmp.vert(x + cs, y - len, z + sn, n[0], n[1], n[2], mulCol(tint, 0.8), reg[2], reg[3], 1), f = tmp.vert(x - cs, y - len, z - sn, n[0], n[1], n[2], mulCol(tint, 0.8), reg[0], reg[3], 1);
  tmp.quad(a, d, e, f); if (m) cut.add(tmp, m);
}
/** A cut-out lying flat (a bracket fungus on a trunk): middle c, half width w along t, half depth d along n, [x, y, z] each. */
export function shelfCard(cut, c, t, n, w, d, reg, tint = [1, 1, 1], m = null) {
  const tmp = m ? new Builder(4) : cut, P = (i, j) => [c[0] + t[0] * w * i + n[0] * d * j, c[1] + t[1] * w * i + n[1] * d * j, c[2] + t[2] * w * i + n[2] * d * j];
  const p0 = P(-1, -1), p1 = P(1, -1), p2 = P(1, 1), p3 = P(-1, 1);
  const a = tmp.vert(p0[0], p0[1], p0[2], 0, 1, 0, tint, reg[0], reg[1], 0), b2 = tmp.vert(p1[0], p1[1], p1[2], 0, 1, 0, tint, reg[2], reg[1], 0);
  const e = tmp.vert(p2[0], p2[1], p2[2], 0, 1, 0, tint, reg[2], reg[3], 0), f = tmp.vert(p3[0], p3[1], p3[2], 0, 1, 0, tint, reg[0], reg[3], 0);
  tmp.quad(a, b2, e, f); if (m) cut.add(tmp, m);
}
/** Somewhere to gather trees of the forest's own kinds into: see stamp() and groveMeshes(). */
export const grove = () => ({ solid: new Builder(1500), cut: new Builder(3000), bark: new Builder(800) });
/** Stamp one of the forest's models (a template at one weight) where a matrix puts it. */
export function stamp(g, tpl, m, tint = null, leafTint = null) {
  if (tpl.solid) g.solid.add(tpl.solid, m, tint);
  if (tpl.cut) g.cut.add(tpl.cut, m, leafTint || tint);
  if (tpl.bark) g.bark.add(tpl.bark, m);
}
/** What was gathered, as drawings in the forest's own paint. */
export function groveMeshes(ctx, g, name = 'grove') {
  const f = ctx.forest, grp = new THREE.Group(); grp.name = name;
  if (g.solid.nv) grp.add(new THREE.Mesh(g.solid.build({ uv: false }), f.solidMat));
  if (g.cut.nv) grp.add(new THREE.Mesh(g.cut.build(), f.cutMat));
  if (g.bark.nv) grp.add(new THREE.Mesh(g.bark.build({ bend: false }), f.barkMat));
  return grp;
}

// ------------------------------------------------------------------------------------------------ a lamp left alight
/**
 * A lantern like the canoe's own, standing where somebody has left it burning: the keeper's mark, all down the river.
 * pos: what it stands on. Returns { light, power (0..1, may be turned), at }.
 */
export function lamp(ctx, pos, s, scale = 1.5, power = 1, mirror = true, hung = false) {
  const lan = buildLantern();
  if (!ctx.mats.lamp) ctx.mats.lamp = makePaint({ color: '#5a3a1c', emissive: '#ffae52', emissiveIntensity: 2.0, brush: 0, side: THREE.DoubleSide, inside: 1, vertexColors: true });
  const g = new THREE.Group(); g.name = 'lamp'; g.add(new THREE.Mesh(lan.iron, ctx.mats.wood), new THREE.Mesh(lan.panes, ctx.mats.lamp));
  const ring = hung ? pos.y : pos.y + 0.212 * scale;                       // hung: pos is the ring it hangs by, not what it stands on
  g.position.set(pos.x, ring, pos.z); g.scale.setScalar(scale);
  ctx.world.add(g, s, mirror);
  const at = new THREE.Vector3(pos.x, ring - 0.145 * scale, pos.z), ph = pos.x * 3.1 + pos.z;
  const light = { position: at, color: new THREE.Color('#ffa040'), radius: 6.5 * Math.sqrt(scale), intensity: 1.2 * power };
  ctx.lights.push(light);
  const core = ctx.glows.add({ position: at, size: 0.22 * scale, color: new THREE.Color('#ffb860'), power: 1.1 * power, flicker: 0.3 });
  const halo = ctx.glows.add({ position: at, size: 1.1 * scale, color: new THREE.Color('#ff8a30'), power: 0.22 * power, flicker: 0.2 });
  const h = { light, core, halo, at, group: g, power };
  ctx.ticks.push((dt, time) => { const f = (0.9 + 0.07 * Math.sin(time * 7.3 + ph) * Math.sin(time * 4.1 + ph * 2)) * h.power; light.intensity = 1.2 * f; core.power = 1.1 * f; halo.power = 0.22 * f; });
  return h;
}

// ------------------------------------------------------------------------------------------------ a raven
/** A raven, perched: its feet at the origin, looking along +z, k times life size (life is 0.6 m from beak to tail). */
export function raven(b, m = null, k = 1) {
  const tmp = new Builder(260), body = new Builder(120), BLACK = [0.045, 0.05, 0.065], SHEEN = [0.085, 0.1, 0.15], HORN = [0.03, 0.03, 0.035];
  lump(body, 0, 0, 0, 0.1, 0.105, 0.21, 1, 7, 0.04, (x, y) => (y > 0.3 ? SHEEN : BLACK));
  tube(body, [[0, 0.0, -0.14, 0.07], [0, -0.03, -0.3, 0.05], [0, -0.05, -0.44, 0.018]], 4, () => BLACK, null, true);                 // the tail, a wedge
  tmp.add(body, new THREE.Matrix4().makeTranslation(0, 0.21, -0.02).multiply(new THREE.Matrix4().makeRotationX(-0.62)));
  lump(tmp, 0, 0.37, 0.12, 0.062, 0.066, 0.078, 1, 8, 0.02, () => SHEEN);                                                          // the head
  tube(tmp, [[0, 0.372, 0.17, 0.034], [0, 0.36, 0.25, 0.022], [0, 0.34, 0.315, 0.005]], 4, () => HORN, null, true);                       // the bill, heavy
  tube(tmp, [[0, 0.33, 0.13, 0.05], [0, 0.27, 0.17, 0.035], [0, 0.22, 0.17, 0.01]], 4, () => BLACK, null, true);                           // the beard of hackles under it
  for (const sx of [-1, 1]) tube(tmp, [[sx * 0.04, 0.13, 0.0, 0.012], [sx * 0.045, 0, 0.02, 0.01]], 3, () => HORN, null, false);
  b.add(tmp, m ? m.clone().multiply(new THREE.Matrix4().makeScale(k, k, k)) : new THREE.Matrix4().makeScale(k, k, k));
}

