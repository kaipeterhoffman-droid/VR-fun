// Ve, the sanctuary: the gate, the mere, and the ship the mere remembers.
//
// The Ironwood ends in a bank of mist, and in the mist stands a gate as high as the trees: four posts in the river
// carrying a steep shingled roof, a smaller roof astride its ridge, dragons on every gable and two more reaching
// out of the corner posts toward whoever comes; a lantern hung under it by whoever keeps the lights, and runes
// down each post that take light as the canoe comes up. It is built the way the North built what it meant to last,
// in staves, tarred. Through it the river opens into a mere under the moon. That is the reach's picture: from
// under the gate, the whole width of bright water, the moon's road down it, and standing in the road a row of
// black teeth.
//
// The teeth are a stone ship: standing stones set in the shallows in the lines of a hull, the tallest at stem and
// stern, as they were set over the dead who had been seafarers. Stones cast no reflection here. Under each one
// the water shows what it was set up for: a longship lying to the stones' outline, sail set, shields out, a
// lantern at her stem. The land has stones. The water has kept the ship. (This is the one place where the two
// halves of the world are made to differ: see world.js.)
import * as THREE from 'three';
import { Builder, mulCol } from './build.js';
import { tube, lump } from './flora.js';
import { river } from './river.js';
import { WOOD_U, woodSheet } from './art.js';
import { makePaint } from './paint.js';
import { rng, smooth } from './noise.js';
import { makeMist, makeMotes, Glows } from './fx.js';
import { beam, face, buildHull, stemPost } from './craft.js';
import { spot, onBank, groundAt, frame, rock, menhir, monolith, facet, runes, lamp, raven, TAU } from './kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const GATE = 384, SHIP = { s: 482, d: -6.5, L: 34, beam: 7.4 };

export function buildVe(ctx) {
  ctx.clearings.push({ s0: GATE - 9, s1: GATE + 9, side: 0, out0: -2, out1: 6.5 });
  gate(ctx); stoneShip(ctx); shores(ctx);
}

/** A beam with its ends closed (craft.js leaves a beam's ends open, to be buried in something). */
function balk(b, A, B, wide, thick, up, U, c, vScale = 1.6) {
  beam(b, A, B, wide, thick, up, U, c, vScale);
  const t = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l = Math.hypot(t[0], t[1], t[2]) || 1; t[0] /= l; t[1] /= l; t[2] /= l;
  let s = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]; const sl = Math.hypot(s[0], s[1], s[2]) || 1; s = s.map((v) => v / sl * wide / 2);
  let u = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]]; const ul = Math.hypot(u[0], u[1], u[2]) || 1; u = u.map((v) => v / ul * thick / 2);
  const P = (o, i, j) => [o[0] + s[0] * i + u[0] * j, o[1] + s[1] * i + u[1] * j, o[2] + s[2] * i + u[2] * j];
  face(b, P(B, -1, 1), P(B, 1, 1), P(B, 1, -1), P(B, -1, -1), U, 0, 0.12, c);
  face(b, P(A, -1, -1), P(A, 1, -1), P(A, 1, 1), P(A, -1, 1), U, 0, 0.12, c);
}

// ------------------------------------------------------------------------------------------------ the gate
function gate(ctx) {
  // Its own frame: +x is the river's right, +z is upstream (the way the canoe comes from), the water is y = 0.
  const S = GATE, F = frame(spot(S, 0, 0), S), rnd = rng(3841), wood = new Builder(9000), flat = new Builder(5000), stone = new Builder(1500);
  const X = 5.0, ZF = 1.7, PL = 7.6;                                                          // four posts at (+-X, +-ZF); their heads at PL
  const EAVE = 6.6, PITCH = 1.2, EY = PL + 0.25, RIDGE = EY + EAVE * PITCH, ZR = ZF + 0.75;      // the great roof: its ridge runs with the river
  const TX = 1.8, TE = 2.5, TP = 1.4, TEY = RIDGE + 0.75, TOP = TEY + TE * TP, TZ = 1.5, TZR = TZ + 0.42;      // and the small one astride it
  const roofY = (x) => EY + (EAVE - Math.abs(x)) * PITCH, roof2Y = (x) => TEY + (TE - Math.abs(x)) * TP;
  const tar = (k = 1) => { const v = (0.5 + rnd() * 0.2) * k; return [v, v * 0.97, v * 0.94]; };
  const cuts = [new Builder(40), new Builder(40)];

  // ---- the posts: a foot black with tar and green with the river, an iron collar, the shaft, a head under the beam
  for (const sd of [-1, 1]) for (const fz of [1, -1]) {
    const x = sd * X, z = fz * ZF;
    tube(wood, [[x, -1.2, z, 0.6], [x, 0.3, z, 0.57], [x, 1.4, z, 0.53]], 10, (i) => tar(i === 0 ? 0.5 : 0.8), null, false, WOOD_U.tar, 1.2);
    tube(wood, [[x, 1.34, z, 0.61], [x, 1.62, z, 0.61]], 10, () => tar(1.1), null, true, WOOD_U.grey, 1.2);
    tube(wood, [[x, 1.6, z, 0.51], [x, 4.8, z, 0.47], [x, PL, z, 0.43]], 10, () => [0.74, 0.7, 0.66], null, false, fz > 0 ? WOOD_U.carved : WOOD_U.tar, 2.1);
    tube(wood, [[x, PL - 0.62, z, 0.5], [x, PL - 0.3, z, 0.54]], 10, () => tar(1.1), null, true, WOOD_U.grey, 1.2);
  }
  // ---- out of each of the two that face upstream, a dragon: the neck leaves the post below the beam and rises in
  // front of the gable like the stem of a ship, the jaws apart, a tongue
  const heads = [];
  for (const sd of [-1, 1]) {
    const x = sd * X, z = ZF, lx = sd * 0.55;
    const neck = [[x, 5.9, z + 0.1, 0.3], [x, 6.3, z + 0.75, 0.3], [x + lx * 0.2, 6.9, z + 1.4, 0.27], [x + lx * 0.5, 7.7, z + 1.9, 0.24], [x + lx * 0.8, 8.5, z + 2.25, 0.23],
      [x + lx, 9.15, z + 2.8, 0.27], [x + lx * 1.05, 9.25, z + 3.35, 0.31], [x + lx * 1.08, 9.15, z + 3.9, 0.24], [x + lx * 1.1, 9.1, z + 4.4, 0.13], [x + lx * 1.11, 9.17, z + 4.74, 0.075], [x + lx * 1.11, 9.38, z + 4.93, 0.035], [x + lx * 1.11, 9.55, z + 4.86, 0.008]];
    tube(wood, neck, 7, (i, j) => { const v = 0.6 + 0.2 * (j % 2); return [v, v * 0.95, v * 0.9]; }, null, [0.5, 0.46, 0.42], WOOD_U.carved, 1.4);
    tube(wood, [[x + lx * 1.03, 9.02, z + 3.25, 0.2], [x + lx * 1.07, 8.78, z + 3.8, 0.15], [x + lx * 1.1, 8.64, z + 4.25, 0.075], [x + lx * 1.11, 8.56, z + 4.56, 0.03], [x + lx * 1.11, 8.5, z + 4.7, 0.006]], 5, () => [0.55, 0.5, 0.46], null, true, WOOD_U.tar, 1);
    // an eye either side, a boss of pale wood; fangs; and behind the head the lappet that every such beast wears, curled
    const hx = x + lx * 1.05, U2 = (WOOD_U.pale[0] + WOOD_U.pale[1]) / 2;
    for (const e of [-1, 1]) {
      const n0 = wood.nv; lump(wood, hx + e * 0.26, 9.36, z + 3.42, 0.085, 0.1, 0.11, 1, 31 + e, 0.02, () => [1, 0.96, 0.86]); for (let q = n0; q < wood.nv; q++) { wood.uv[q * 2] = U2; wood.uv[q * 2 + 1] = 0.5; }
      for (const [fz2, len] of [[3.95, 0.2], [4.25, 0.15]]) tube(wood, [[x + lx * 1.09 + e * 0.12, 9.0, z + fz2, 0.035], [x + lx * 1.09 + e * 0.12, 9.0 - len, z + fz2 + 0.03, 0.006]], 4, () => [1, 0.97, 0.9], null, false, WOOD_U.pale, 1);
    }
    { const pts = [], cy = 9.72, cz = z + 2.72; for (let i = 0; i <= 10; i++) { const a = -0.6 + i / 10 * 4.6, R = 0.34 * (1 - 0.07 * i); pts.push([x + lx * 0.97, cy + Math.sin(a) * R - 0.12, cz - Math.cos(a) * R, 0.09 * (1 - 0.07 * i)]); } tube(wood, pts, 5, () => [0.62, 0.58, 0.54], null, true, WOOD_U.carved, 1.2); }
    tube(wood, [[x + lx * 1.06, 8.95, z + 3.8, 0.045], [x + lx * 1.1, 8.9, z + 4.45, 0.04], [x + lx * 1.12, 9.05, z + 4.75, 0.03], [x + lx * 1.12, 9.26, z + 4.78, 0.015]], 4, () => [0.62, 0.2, 0.14], null, true, WOOD_U.pale, 1);
    // the crest down the neck, cut in steps
    for (let k = 0; k < 6; k++) { const f = 1 + k * 0.72, a = neck[Math.floor(f)], b = neck[Math.floor(f) + 1], t = f % 1, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t, pz = a[2] + (b[2] - a[2]) * t; balk(flat, [px, py + 0.12, pz - 0.16], [px, py + 0.52 + (k % 2) * 0.14, pz - 0.44], 0.22, 0.05, [1, 0, 0], WOOD_U.grey, tar(0.9), 1); }
    heads.push([x + lx * 1.05, 9.25 + 0.3, z + 3.3]);
    // what is cut in the post, on the face that meets the canoe: one rune under another
    const word = sd > 0 ? 'laukaz' : 'wihaz', h = 0.5, top = 6.2, pi = sd > 0 ? 1 : 0;
    [...word].forEach((ch, k) => { const yy = top - k * 0.62; runes(cuts[pi], ch, [x - h * 0.25, yy - h, ZF + 0.525 - (yy - 1.6) * 0.0125], [1, 0, 0], [0, 1, 0], h, [1, 1, 1]); });
  }
  // ---- the beams: one across each pair of posts, carved; a tie between for the lantern; a plate along each side;
  // and under each end of the cross beams a knee, bent the way the root grew, that rounds the corner of the door
  for (const z of [ZF, -ZF]) {
    balk(flat, [-X - 1.0, PL, z], [X + 1.0, PL, z], 0.62, 0.38, [0, 0, 1], WOOD_U.carved, [0.72, 0.68, 0.64], 2.2);
    for (const sd of [-1, 1]) { const pts = []; for (let i = 0; i <= 5; i++) { const a = i / 5 * Math.PI / 2; pts.push([sd * (X - 2.75 + 2.35 * Math.cos(a)), 5.1 + 2.2 * Math.sin(a), z, 0.14]); } tube(wood, pts, 6, () => tar(1.05), null, false, WOOD_U.grey, 1.2); }
  }
  balk(flat, [-X, PL + 0.1, 0], [X, PL + 0.1, 0], 0.3, 0.26, [0, 0, 1], WOOD_U.grey, tar(1), 1.6);
  for (const sd of [-1, 1]) balk(flat, [sd * X, PL + 0.34, -ZR + 0.12], [sd * X, PL + 0.34, ZR - 0.12], 0.32, 0.3, [0, 1, 0], WOOD_U.grey, tar(1), 1.6);
  // ---- a roof of shingles: strips of the shingle sheet laid side by side from eave to ridge
  const shingles = (eave, ey, pitch, z0, z1, n) => {
    const len = eave * Math.hypot(1, pitch) / 2.24, ry = ey + eave * pitch;
    for (const sd of [-1, 1]) for (let k = 0; k < n; k++) {
      const a = z0 + (z1 - z0) * k / n, b = z0 + (z1 - z0) * (k + 1) / n, c = tar(1.3);
      if (sd > 0) face(flat, [eave, ey, b], [eave, ey, a], [0, ry, a], [0, ry, b], WOOD_U.shingle, len, 0, c); else face(flat, [-eave, ey, a], [-eave, ey, b], [0, ry, b], [0, ry, a], WOOD_U.shingle, len, 0, c);      // (the sheet's round ends point the way its v grows: down the roof)
    }
    for (const sd of [-1, 1]) balk(flat, [sd * (eave - 0.02), ey - 0.07, z0], [sd * (eave - 0.02), ey - 0.07, z1], 0.1, 0.16, [0, 1, 0], WOOD_U.grey, tar(0.9), 1.6);       // the eaves board
    balk(flat, [0, ry + 0.04, z0 - 0.06], [0, ry + 0.04, z1 + 0.06], 0.22, 0.24, [0, 1, 0], WOOD_U.grey, tar(0.9), 1.6);                                                   // the ridge
  };
  // a wall of upright staves between a floor line and a roof line, facing fz along the river
  const staves = (z, fz, x0, x1, n, bot, top, k0) => {
    for (let k = 0; k < n; k++) {
      const a = x0 + (x1 - x0) * k / n, b = x0 + (x1 - x0) * (k + 1) / n, c = tar(k0 * (k % 2 ? 0.86 : 1.04)), v0 = rnd(), v1 = v0 + (Math.max(top(a), top(b)) - Math.min(bot(a), bot(b))) / 1.3;
      if (fz > 0) face(flat, [a, bot(a), z], [b, bot(b), z], [b, top(b), z], [a, top(a), z], WOOD_U.grey, v0, v1, c); else face(flat, [b, bot(b), z], [a, bot(a), z], [a, top(a), z], [b, top(b), z], WOOD_U.grey, v0, v1, c);
    }
  };
  // the barge boards of a gable: they cross above the ridge, and each ends in a beast that looks out along the eaves
  const barge = (zb, fz, eave, ey, pitch, wide, ex, beasts = true) => {
    for (const sd of [-1, 1]) {
      const z = zb + fz * (sd > 0 ? 0.02 : 0.13), A = [sd * (eave + 0.3), ey - 0.3 * pitch - 0.06, z], B = [-sd * ex, ey + (eave + ex) * pitch - 0.06, z];
      balk(flat, A, B, wide, 0.09, [0, 0, 1], WOOD_U.carved, [0.95, 0.91, 0.87], 2.0);
      const r = wide * 0.42; if (!beasts) continue;
      tube(wood, [[B[0] + sd * 0.14, B[1] - 0.17, z, r * 0.9], [B[0] - sd * 0.22, B[1] + 0.32, z, r], [B[0] - sd * 0.7, B[1] + 0.6, z, r * 0.92], [B[0] - sd * 1.18, B[1] + 0.52, z, r * 0.7], [B[0] - sd * 1.5, B[1] + 0.34, z, r * 0.3]], 6, () => tar(1.1), null, true, WOOD_U.carved, 1.4);
      tube(wood, [[B[0] - sd * 0.62, B[1] + 0.42, z, r * 0.6], [B[0] - sd * 1.05, B[1] + 0.26, z, r * 0.42], [B[0] - sd * 1.36, B[1] + 0.12, z, r * 0.2]], 5, () => tar(0.95), null, true, WOOD_U.tar, 1);
    }
  };
  // ---- the great roof, its two gables, its rafters
  shingles(EAVE, EY, PITCH, -ZR, ZR, 6);
  for (const fz of [1, -1]) {
    staves(fz * ZF, fz, -EAVE + 0.3, EAVE - 0.3, 18, () => PL + 0.28, (x) => roofY(x) - 0.04, 1);
    barge(fz * ZR, fz, EAVE, EY, PITCH, 0.5, 1.2);
    // the gable's own timbers, pale against the tar: two rails and a king post
    for (const [y, U] of [[PL + 2.9, WOOD_U.carved], [PL + 5.6, WOOD_U.grey]]) { const hx = EAVE - (y - EY) / PITCH - 0.25; balk(flat, [-hx, y, fz * (ZF + 0.07)], [hx, y, fz * (ZF + 0.07)], 0.36, 0.12, [0, 0, 1], U, [1, 0.96, 0.92], 2.2); }
    balk(flat, [0, PL + 0.3, fz * (ZF + 0.1)], [0, RIDGE - 0.2, fz * (ZF + 0.1)], 0.32, 0.14, [0, 0, 1], WOOD_U.carved, [1, 0.96, 0.92], 2.2);
  }
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const z = -1.2 + k * 0.8; beam(flat, [sd * (EAVE - 0.4), roofY(EAVE - 0.4) - 0.12, z], [sd * 0.12, roofY(0.12) - 0.12, z], 0.17, 0.13, [0, 0, 1], WOOD_U.grey, tar(1), 1.6); }
  // ---- the small roof: four short walls standing on the great roof, a roof of their own, a dragon at each end of the ridge
  shingles(TE, TEY, TP, -TZR, TZR, 4);
  for (const fz of [1, -1]) {
    staves(fz * TZ, fz, -TX, TX, 8, (x) => roofY(x) - 0.06, (x) => Math.min(roof2Y(x) - 0.04, TOP), 0.95);
    barge(fz * TZR, fz, TE, TEY, TP, 0.34, 0.0, false);
    const z = fz * TZR, neck = [[0, TOP - 0.05, z - fz * 0.5, 0.2], [0, TOP + 0.5, z + fz * 0.2, 0.2], [0, TOP + 1.2, z + fz * 0.55, 0.18], [0, TOP + 1.9, z + fz * 1.0, 0.17], [0, TOP + 2.3, z + fz * 1.55, 0.2], [0, TOP + 2.34, z + fz * 2.0, 0.23], [0, TOP + 2.24, z + fz * 2.45, 0.17], [0, TOP + 2.18, z + fz * 2.85, 0.08], [0, TOP + 2.3, z + fz * 3.08, 0.035], [0, TOP + 2.46, z + fz * 3.06, 0.006]];
    tube(wood, neck, 6, (i, j) => { const v = 0.56 + 0.2 * (j % 2); return [v, v * 0.95, v * 0.9]; }, null, [0.5, 0.46, 0.42], WOOD_U.carved, 1.4);
    tube(wood, [[0, TOP + 2.14, z + fz * 1.95, 0.14], [0, TOP + 1.95, z + fz * 2.4, 0.1], [0, TOP + 1.84, z + fz * 2.72, 0.045], [0, TOP + 1.8, z + fz * 2.9, 0.006]], 5, () => [0.5, 0.46, 0.42], null, true, WOOD_U.tar, 1);
    for (let k = 0; k < 4; k++) { const f = 1 + k * 0.8, a = neck[Math.floor(f)], b = neck[Math.floor(f) + 1], t = f % 1, py = a[1] + (b[1] - a[1]) * t, pz = a[2] + (b[2] - a[2]) * t; balk(flat, [0, py + 0.08, pz - fz * 0.12], [0, py + 0.4 + (k % 2) * 0.1, pz - fz * 0.36], 0.16, 0.04, [1, 0, 0], WOOD_U.grey, tar(0.9), 1); }
  }
  for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) {
    const a = -TZ + 2 * TZ * k / 5, b = -TZ + 2 * TZ * (k + 1) / 5, y0 = roofY(TX) - 0.06, y1 = TEY + (TE - TX) * TP, c = tar(k % 2 ? 0.8 : 0.95);
    if (sd > 0) face(flat, [TX, y0, b], [TX, y0, a], [TX, y1, a], [TX, y1, b], WOOD_U.grey, 0, (y1 - y0) / 1.3, c); else face(flat, [-TX, y0, a], [-TX, y0, b], [-TX, y1, b], [-TX, y1, a], WOOD_U.grey, 0, (y1 - y0) / 1.3, c);
  }
  // the comb along the small roof's ridge
  for (let k = 0; k < 5; k++) { const z = -1.2 + k * 0.6; balk(flat, [0, TOP + 0.1, z - 0.2], [0, TOP + 0.42 + (k % 2 ? 0.14 : 0), z + 0.2], 0.4, 0.05, [1, 0, 0], WOOD_U.grey, tar(0.85), 1); }
  // ---- the chain the lantern hangs by
  tube(wood, [[0, PL, 0, 0.02], [0.02, 6.0, 0, 0.02], [0, 4.3, 0, 0.02]], 4, () => [0.2, 0.21, 0.24], null, false, WOOD_U.tar, 0.3);
  // ---- standing stones either side, where the banks come in to the gate
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
    const p = onBank(S - 5 + k * 3.6 + rnd() * 1.5, sd, 0.9 + rnd() * 2.6, -0.1), h = 1.3 + rnd() * 2.2 * (k === 1 ? 1.5 : 1);
    menhir(stone, 0.5 + h * 0.2, h, 0.3 + h * 0.06, 3850 + k + sd * 10, frame(p, S, rnd() * TAU));
    for (let q = 0; q < 2; q++) { const r = onBank(S - 6 + rnd() * 13, sd, 0.2 + rnd() * 3, 0.05); rock(stone, r.x, r.y, r.z, 0.3 + rnd() * 0.4, 0.2 + rnd() * 0.25, 0.3 + rnd() * 0.4, 3870 + k * 2 + q, 1); }
  }
  flat.smoothNormals(); wood.add(flat);
  const gateWood = makePaint({ map: woodSheet(), color: '#c6cfdd', brush: 0.16, brushScale: 0.5, side: THREE.DoubleSide, inside: 0.72, rim: { color: '#c4d6ff', strength: 0.55, power: 2.8 } });
  const w = new Builder(wood.nv); w.add(wood, F);
  ctx.mesh(w, gateWood, S, true, { name: 'gate' }); ctx.mesh(stone, ctx.mats.stone, S, true, { uv: false, name: 'gate stones' });
  const lit = cuts.map((c) => { const b = new Builder(c.nv); b.add(c, F); const m = ctx.litRunes('#b4dcff'); ctx.mesh(b, m, S, true, { name: 'gate runes' }); return m; });
  const at = (x, y, z) => V3(x, y, z).applyMatrix4(F);
  for (const sd of [-1, 1]) for (const fz of [-1, 1]) { const p = at(sd * X, 0, fz * ZF); ctx.obstacles.push({ x: p.x, z: p.z, r: 0.72 }); }
  lamp(ctx, at(0, 4.3, 0), S, 2.3, 1.1, true, true);
  const glows = [-1, 1].map((sd) => ctx.glows.add({ position: at(sd * X, 4.7, ZF + 0.7), size: 2.8, color: new THREE.Color('#7fb4e8'), power: 0 }));

  // ---- a raven on the left-hand dragon, that turns its head to keep the canoe in one eye. In the water there are two
  const yaw0 = Math.atan2(F.elements[8], F.elements[10]);
  const birds = heads.map((h, i) => {
    const b = new Builder(260); raven(b, null, 1.5);
    const m = new THREE.Mesh(b.build({ uv: false, bend: false }), ctx.mats.plain); m.name = 'raven'; m.position.copy(at(h[0], h[1], h[2])); m.rotation.y = yaw0 + (i ? -0.5 : 0.4);
    return { m, twin: ctx.world.add(m, S, i ? 'only' : true), yaw: m.rotation.y, want: m.rotation.y, next: 0 };
  });
  const mid = at(0, 1, 0);
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const d = Math.hypot(eye.x - mid.x, eye.z - mid.z);
    if (d > 150) return;
    // the runes take light as the lantern comes: first one post, then the other
    [smooth(46, 12, d), smooth(38, 9, d)].forEach((k, i) => { const v = 0.1 + 1.9 * k * (0.86 + 0.14 * Math.sin(time * 1.7 + i * 2)); lit[i].userData.set(v); glows[i].power = 0.26 * k; });
    for (const b of birds) {
      if (time > b.next) { b.next = time + 0.7 + Math.random() * 2.6; const to = Math.atan2(eye.x - b.m.position.x, eye.z - b.m.position.z); b.want = to + (Math.random() < 0.5 ? 0.9 : -0.9) + (Math.random() - 0.5) * 0.5; }      // a bird looks with one eye, then the other
      let dy = b.want - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); b.yaw += dy * Math.min(1, dt * 14);
      b.m.rotation.y = b.yaw; if (b.twin && b.twin.isObject3D) b.twin.rotation.y = b.yaw;
    }
  });

  // ---- the mist the gate stands in
  const puffs = [];
  for (let k = 0; k < 16; k++) { const s = S - 26 + k * 3.4, p = spot(s, (rnd() - 0.5) * river.halfWidth(s) * 1.8, 0.45 + rnd() * 0.5); puffs.push({ x: p.x, y: p.y, z: p.z, width: 7 + rnd() * 8, height: 1.3 + rnd() * 1.3, opacity: 0.34 + rnd() * 0.2, drift: 0.5 + rnd() }); }
  ctx.world.add(makeMist(puffs), S, false);
}

// ------------------------------------------------------------------------------------------------ the stone ship
function stoneShip(ctx) {
  const { s: S, d: D, L, beam: BM } = SHIP, F = frame(spot(S, D, 0), S), rnd = rng(4781), K = L / 21;
  const half = (t, bm) => bm / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.3)), 0.72);       // the same line the shipwright uses (craft.js)
  // ---- on the land's side of the water: the stones, hewn flat-faced, the tallest at stem and stern
  const stones = new Builder(6000), places = [], cut = new Builder(24);
  const set = (x, z, w, h, t, yaw, seed, dressed = false) => {
    const m = new THREE.Matrix4().makeTranslation(x, -0.05, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    if (dressed) { const one = new Builder(160); menhir(one, w, h, t, seed); stones.add(facet(one), m); } else monolith(stones, w, h, t, seed, m);      // the two great ones were worked; the rest stand as they were split
    places.push([x, z, Math.max(w, t) * 0.5 + 0.14]); return m;
  };
  set(0, -(L / 2 + 2.0), 2.0, 8.6, 0.9, 0.1, 4790, true);                                                          // the stem
  // the stern: the first the canoe comes to, and the one that is written on. A slab of four sides, one of them turned
  // upstream and a little toward the channel; the runes lie on that face wherever the split left it
  const stern = new THREE.Matrix4().makeTranslation(0, -0.05, L / 2 + 1.7).multiply(new THREE.Matrix4().makeRotationY(0.34));
  const sc = monolith(stones, 2.9, 7.2, 1.7, 4796, stern, null, { sides: 4, a0: Math.PI / 4, even: true }); places.push([0, L / 2 + 1.7, 1.2]);
  const faceZ = (y) => {                                                                                       // where that face is, at x = 0 and height y
    let i = 0; while (i < sc.length - 2 && sc[i + 1][0][1] < y) i++;
    const z = (r) => { const a = r[0], b = r[1]; return a[2] + (b[2] - a[2]) * (a[0] / (a[0] - b[0])); }, y0 = (sc[i][0][1] + sc[i][1][1]) / 2, y1 = (sc[i + 1][0][1] + sc[i + 1][1][1]) / 2, f = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    return z(sc[i]) + (z(sc[i + 1]) - z(sc[i])) * f;
  };
  [...'sigla'].forEach((ch, k) => { const y = 4.7 - k * 0.62; runes(cut, ch, [-0.13, y, faceZ(y + 0.25) + 0.035], [1, 0, 0], [0, 1, 0], 0.5, [1, 1, 1], stern); });
  const N = 15;
  for (const sd of [-1, 1]) for (let k = 0; k < N; k++) {
    const t = -0.9 + 1.8 * (k + 0.5) / N + (rnd() - 0.5) * 0.03, z = t * (L / 2 + 1.0), x = sd * (half(t, BM) * 1.2 + 0.7 + (rnd() - 0.5) * 0.3);
    const h = 1.5 + 4.3 * Math.pow(Math.abs(t), 1.7) + (rnd() - 0.5) * 0.5, w = 0.85 + rnd() * 0.5 + h * 0.09;
    const slope = (half(t + 0.02, BM) - half(t - 0.02, BM)) / (0.04 * (L / 2));                                // each stands with its broad face along the hull's line
    set(x, z, w, h, 0.42 + rnd() * 0.2 + h * 0.03, Math.atan2(-1, sd * slope) + (rnd() - 0.5) * 0.3, 4800 + k + (sd > 0 ? 20 : 0));
  }
  const st = new Builder(stones.nv); st.add(stones, F);
  const moonStone = makePaint({ brush: 0.4, brushScale: 0.3, wet: 0.5, top: { color: '#3c5230', from: 0.62, to: 0.95, amount: 0.55 }, rim: { color: '#cfe0ff', strength: 0.6, power: 2.4 }, side: THREE.DoubleSide, inside: 0.7 });
  ctx.mesh(st, moonStone, S, false, { uv: false, name: 'stone ship' });                                  // no reflection: the water has something else to show
  for (const [x, z, r] of places) { const p = V3(x, 0, z).applyMatrix4(F); ctx.obstacles.push({ x: p.x, z: p.z, r }); }
  const lit = ctx.litRunes('#b4dcff'); { const b = new Builder(cut.nv); b.add(cut, F); ctx.mesh(b, lit, S, false, { name: 'sigla' }); }

  // ---- on the water's side: the ship. She lies bows downstream, as the stones do
  const GLOW = new THREE.Color('#1a2638'), GLOW2 = new THREE.Color('#2e3a52');
  const shipWood = makePaint({ map: woodSheet(), brush: 0.1, brushScale: 0.5, side: THREE.DoubleSide, inside: 0.75, clipBelow: true, emissive: '#1c2c48', rim: { color: '#dfe8ff', strength: 0.7, power: 2.4 } });
  const cloth = makePaint({ brush: 0.3, brushScale: 0.35, side: THREE.DoubleSide, inside: 0.85, emissive: '#2e3a52', backlight: 0.35, backColor: '#dfe6ff' });
  const tint = [0.66, 0.6, 0.56];
  const hull = buildHull({ L, beam: BM, draft: 0.42 * K, sheerMid: 1.15 * K, sheerEnd: 2.9 * K, floorY: 0.2 * K, N: 18, K: 7, lap: 0.04 * K, inside: false, floor: false, out: WOOD_U.grey, tintOut: tint, grain: 4.4 });
  const hb = hull.b, zs = (t) => t * L / 2;
  stemPost(hb, -L / 2, -1, 0.1 * K, 2.9 * K, 1.5 * K, 0.85 * K, 0.2 * K, 1.3, WOOD_U.carved, [0.8, 0.76, 0.72]); stemPost(hb, L / 2, 1, 0.1 * K, 2.9 * K, 1.15 * K, 0.62 * K, 0.18 * K, 1.15, WOOD_U.carved, [0.8, 0.76, 0.72]);
  // the sheer strake's rail, the mast and its yard, the stays
  for (const sd of [-1, 1]) { const pts = []; for (let i = 0; i <= 14; i++) { const t = -0.96 + 1.92 * i / 14; pts.push([sd * (hull.half(t) + 0.03), hull.sheerY(t) + 0.04, zs(t), 0.09]); } tube(hb, pts, 5, () => [0.7, 0.66, 0.6], null, false, WOOD_U.pale, 2); }
  const MZ = 0.6 * K, MT = 12.2 * K, YD = 11.0 * K, YH = 4.5 * K;
  tube(hb, [[0, 0.3 * K, MZ, 0.19 * K], [0, 6 * K, MZ, 0.16 * K], [0, MT, MZ + 0.1, 0.1 * K]], 7, () => [0.74, 0.7, 0.62], null, true, WOOD_U.pale, 2.4);
  tube(hb, [[-YH, YD - 0.16, MZ - 0.24, 0.07 * K], [0, YD, MZ - 0.28, 0.1 * K], [YH, YD - 0.16, MZ - 0.24, 0.07 * K]], 6, () => [0.7, 0.66, 0.6], null, true, WOOD_U.pale, 2.4);
  for (const [x, y, z] of [[0, 4.2 * K, -L / 2 - 1.1], [0, 3.8 * K, L / 2 + 0.8], [2.1 * K, 1.2 * K, 1.6 * K], [-2.1 * K, 1.2 * K, 1.6 * K], [2.0 * K, 1.25 * K, -1.2 * K], [-2.0 * K, 1.25 * K, -1.2 * K]]) tube(hb, [[0, MT - 0.3, MZ + 0.04, 0.022], [x, y, z, 0.022]], 3, () => [0.7, 0.62, 0.46], null, false, WOOD_U.pale, 0.4);
  for (const sd of [-1, 1]) tube(hb, [[sd * (YH - 0.1), YD - 0.2, MZ - 0.24, 0.018], [sd * 2.3 * K, 1.3 * K, 6.2 * K, 0.018]], 3, () => [0.7, 0.62, 0.46], null, false, WOOD_U.pale, 0.4);     // the braces
  // the sail: wadmal in stripes, full of a wind that is not blowing here
  const sail = new Builder(900), RED = [0.56, 0.12, 0.09], PALE = [0.8, 0.76, 0.62], rows = 8, stripes = 10;
  for (let c = 0; c < stripes; c++) {
    const col = c % 2 ? RED : PALE, first = sail.nv;
    for (let r = 0; r <= rows; r++) for (const e of [0, 1]) {
      const u = (c + e) / stripes * 2 - 1, v = r / rows, wide = (4.35 - 0.45 * v) * K, belly = Math.sin(Math.PI * Math.min(1, v * 0.86 + 0.07)) * (1 - u * u * 0.8) * 1.15 * K;
      sail.vert(u * wide + (e ? -0.012 : 0.012), YD - 0.2 - v * 7.1 * K + 0.25 * K * v * u * u, MZ - 0.24 - belly, 0, 0, -1, mulCol(col, 0.82 + 0.22 * Math.sin(v * 9 + c)));
    }
    for (let r = 0; r < rows; r++) { const a = first + r * 2; sail.quad(a, a + 1, a + 3, a + 2); }
  }
  // the shields along her side, overlapping, as they were hung in harbour
  const SH = [[0.66, 0.5, 0.15], [0.5, 0.11, 0.08], [0.15, 0.2, 0.3], [0.76, 0.74, 0.66]], NS = 20;
  for (const sd of [-1, 1]) for (let k = 0; k < NS; k++) {
    const t = -0.76 + 1.52 * k / (NS - 1), cx = sd * (hull.half(t) + 0.12), cy = hull.sheerY(t) - 0.3, cz = zs(t), R = 0.5, c = SH[(k + (sd > 0 ? 1 : 0)) % 4];
    const mid = sail.vert(cx + sd * 0.1, cy, cz, sd, 0, 0, [0.44, 0.44, 0.47]), ring = [], boss = [];
    for (let j = 0; j < 10; j++) { const a = j / 10 * TAU; boss.push(sail.vert(cx + sd * 0.07, cy + Math.cos(a) * 0.12, cz + Math.sin(a) * 0.12, sd, 0, 0, [0.38, 0.38, 0.41])); ring.push(sail.vert(cx, cy + Math.cos(a) * R, cz + Math.sin(a) * R, sd, 0, 0, mulCol(c, j % 5 === 0 ? 0.7 : 1))); }
    for (let j = 0; j < 10; j++) { const j1 = (j + 1) % 10; sail.tri(mid, boss[j], boss[j1]); sail.quad(boss[j], ring[j], ring[j1], boss[j1]); }
  }
  sail.smoothNormals();
  const hm = new Builder(hb.nv); hm.add(hb, F); const sm = new Builder(sail.nv); sm.add(sail, F);
  const m1 = new THREE.Mesh(hm.build({ bend: false }), shipWood), m2 = new THREE.Mesh(sm.build({ uv: false, bend: false }), cloth); m1.name = 'the ship the mere keeps'; m2.name = 'her sail and shields';
  ctx.world.add(m1, S, 'only'); ctx.world.add(m2, S, 'only');
  // her lights burn only in the water
  const ghost = new Glows(8); ctx.world.mirror.add(ghost.twin);
  const lamps = [[0, 4.5 * K, -L / 2 - 1.2, 1.0], [0, 3.9 * K, L / 2 + 0.9, 0.8], [0, 1.9 * K, MZ + 0.5, 0.6]].map(([x, y, z, k]) => ({ k, core: ghost.add({ position: V3(x, y, z).applyMatrix4(F), size: 0.5, color: new THREE.Color('#ffb860'), power: 0, flicker: 0.35 }), halo: ghost.add({ position: V3(x, y, z).applyMatrix4(F), size: 2.4, color: new THREE.Color('#ff8a30'), power: 0, flicker: 0.3 }) }));
  // and something rises from inside the stones as the canoe comes alongside: dew, or what is left of a breath
  const motes = [];
  for (let k = 0; k < 48; k++) { const t = rnd() * 1.8 - 0.9, p = V3((rnd() * 2 - 1) * half(t, BM) * 0.9, 0.1, t * L / 2).applyMatrix4(F); motes.push({ x: p.x, y: p.y, z: p.z, roam: 3 + rnd() * 5, size: 0.018 + rnd() * 0.016, speed: 0.25 + rnd() * 0.3, kind: 1, color: [0.75, 0.9, 1.3] }); }
  const dew = makeMotes(motes, { mirror: false }); ctx.world.add(dew, S, false);
  // mist among the stones, low, so that they stand up out of it
  const puffs = [];
  for (let k = 0; k < 12; k++) { const t = -1.15 + 2.3 * k / 11, p = V3((rnd() - 0.5) * 9, 0.4 + rnd() * 0.3, t * L / 2).applyMatrix4(F); puffs.push({ x: p.x, y: p.y + 0.2, z: p.z, width: 12 + rnd() * 10, height: 1.3 + rnd() * 1.1, opacity: 0.4 + rnd() * 0.2, drift: 0.3 + rnd() * 0.5 }); }
  ctx.world.add(makeMist(puffs), S, false);
  const mid = V3(0, 0, 0).applyMatrix4(F), sternAt = V3(0.6, 3.4, L / 2 + 3.1).applyMatrix4(F);
  const cold = { position: sternAt, color: new THREE.Color('#8fc0ff'), radius: 7, intensity: 0 }; ctx.lights.push(cold);                   // what the runes give off falls on the stone they are cut in
  let wake = 0;
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const d = Math.hypot(eye.x - mid.x, eye.z - mid.z);
    if (d > 320) { for (const l of lamps) l.core.power = l.halo.power = 0; ghost.update(); return; }
    const to = smooth(86, 30, d); wake += (to - wake) * Math.min(1, dt * 0.6); if (boat.frozen) wake = to;
    for (const l of lamps) { l.core.power = (0.55 + 0.9 * wake) * l.k; l.halo.power = (0.12 + 0.3 * wake) * l.k; }
    shipWood.uniforms.uEmissive.value.copy(GLOW).multiplyScalar(0.35 + 1.1 * wake); cloth.uniforms.uEmissive.value.copy(GLOW2).multiplyScalar(0.35 + 1.1 * wake);     // she comes up in the water as one comes alongside
    dew.userData.uniforms.uMoteP.value.x = 0.2 + 0.9 * wake;
    const rk = smooth(64, 16, Math.hypot(eye.x - sternAt.x, eye.z - sternAt.z)); lit.userData.set(0.25 + 1.6 * rk); cold.intensity = 0.25 + 0.75 * rk;
    ghost.update();
  });
}

// ------------------------------------------------------------------------------------------------ the shores of the mere
function shores(ctx) {
  const rnd = rng(4401), stone = new Builder(3000), cut = new Builder(40);
  // a ring of doom on the right shore (where things were judged): nine stones, and the flat one in the middle
  { const c = onBank(446, 1, 9, 0), n = 9; for (let k = 0; k < n; k++) { const a = k / n * TAU, p = V3(c.x + Math.cos(a) * 4.6, 0, c.z + Math.sin(a) * 4.6), y = groundAt(p.x, p.z, 446); rock(stone, p.x, y + 0.25, p.z, 0.6 + rnd() * 0.3, 0.5 + rnd() * 0.35, 0.6 + rnd() * 0.3, 4460 + k, 1, null, 0.22, 0.6); } rock(stone, c.x, c.y + 0.12, c.z, 1.2, 0.3, 0.9, 4470, 1, null, 0.16, 0.5); }
  // the stone of remembrance on the left shore, beyond the ship: 'minni'
  { const m = frame(onBank(524, -1, 1.4, -0.1), 524, 1.05); menhir(stone, 1.25, 3.3, 0.42, 5241, m); runes(cut, 'minni', [-0.44, 1.7, 0.23], [1, 0, 0], [0, 1, 0], 0.3, [1, 1, 1], m); }
  for (let k = 0; k < 7; k++) { const sd = k % 2 ? 1 : -1, s = 404 + k * 24 + rnd() * 10, p = onBank(s, sd, 0.6 + rnd() * 3, -0.1), h = 0.9 + rnd() * 1.5; menhir(stone, 0.45 + h * 0.18, h, 0.28, 4480 + k, frame(p, s, rnd() * TAU)); }
  ctx.mesh(stone, ctx.mats.stone, 446, true, { uv: false, name: 'shore stones' });                            // one drawing for the whole mere: it is all in sight at once
  const lit = ctx.litRunes('#b4dcff'); lit.userData.set(0.5); ctx.mesh(cut, lit, 524, true, { name: 'minni' });
  const at = onBank(524, -1, 1.4, 1.8);
  ctx.ticks.push((dt, time, boat, look, eye) => { const d = Math.hypot(eye.x - at.x, eye.z - at.z); if (d < 120) lit.userData.set(0.25 + 1.5 * smooth(40, 12, d)); });
  // mist lying on the mere in long low pieces, where the moon can get at it
  const puffs = [];
  for (let k = 0; k < 26; k++) { const s = 404 + rnd() * 170, hw = river.halfWidth(s), p = spot(s, (rnd() * 2 - 1) * hw * 0.95, 0.3 + rnd() * 0.25); puffs.push({ x: p.x, y: p.y, z: p.z, width: 10 + rnd() * 12, height: 0.7 + rnd() * 0.6, opacity: 0.18 + rnd() * 0.16, drift: 0.4 + rnd() * 0.6 }); }
  const half = puffs.length >> 1; ctx.world.add(makeMist(puffs.slice(0, half)), 440, false); ctx.world.add(makeMist(puffs.slice(half)), 520, false);
}
