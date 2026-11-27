// Naust: the landing, at the blue hour. The first picture of the journey, and the place it is made to be left from.
//
// A boathouse with a turf roof and the prow of a bigger boat in its dark doorway; a fire somebody has kept in front
// of it; a jetty with a word cut in its end board; a standing stone and one birch across the water; and down the
// river, between the black walls of the wood, the last light lying in the notch of the fells with one star over it.
// Warm is kept to the fire and the lantern: everything else is blue.
import * as THREE from 'three';
import { Builder, col, mixCol, mulCol } from './build.js';
import { tube } from './flora.js';
import { river } from './river.js';
import { WOOD_U } from './art.js';
import { makePaint } from './paint.js';
import { rng, fbm2, smooth } from './noise.js';
import { face, beam, stemPost, buildHull } from './craft.js';
import { makeMist } from './fx.js';
import { spot, onBank, groundAt, frame, rock, menhir, runes, fire, TAU } from './kit.js';

/** Where the canoe lies when the journey begins: off the end of the jetty. */
export const START = { s: 2.3, d: -river.halfWidth(3.3) + 8.75, turn: -0.05 };

export function buildNaust(ctx) {
  const stone = new Builder(5000), wood = new Builder(5000), turf = new Builder(1200), cut = new Builder(64), rnd = rng(77);
  const grey = (k = 1) => { const v = (0.78 + rnd() * 0.3) * k; return [v, v, v * 0.98]; };

  // ------------------------------------------------------------------ the boathouse
  const S0 = 21, hc = onBank(S0, -1, 9.5); hc.y -= 0.12;
  const H = frame(hc, S0, -0.32), hs = new Builder(1600), hw = new Builder(1600), hp = new Builder(500);
  const Lh = 4.6, Wh = 2.7, eaveZ = 3.15, eaveY = 0.62, ridgeY = 3.8, roofY = (z) => ridgeY - (ridgeY - eaveY) * Math.abs(z) / eaveZ;
  // low walls of gathered stone down each side
  for (const sz of [-1, 1]) for (let i = 0; i < 9; i++) for (let c = 0; c < 2; c++) {
    const x = -Lh + (i + 0.5 + c * 0.5) * (2 * Lh / 9.5);
    rock(hs, x, 0.2 + c * 0.42, sz * Wh, 0.56 + rnd() * 0.12, 0.3 + rnd() * 0.08, 0.32 + rnd() * 0.08, 900 + i * 2 + c + (sz > 0 ? 40 : 0), 1, null, 0.2, 1);
  }
  // the roof: turf on birch bark, sagging a little, grown over
  const TURF = [col('#56652f'), col('#70703a'), col('#414e27'), col('#84744a')], EARTH = col('#2e241c');
  for (const sz of [-1, 1]) {
    const nx = 9, nz = 5, x0 = -Lh - 0.3, x1 = Lh + 0.55, grid = [], P = [];
    for (let i = 0; i <= nx; i++) {
      const row = [], prow = [];
      for (let j = 0; j <= nz; j++) {
        const x = x0 + (x1 - x0) * i / nx, v = j / nz, z = sz * eaveZ * v, n = fbm2(x * 0.9 + sz * 7, v * 3.1 + 2, 3);
        const y = roofY(z) + 0.26 + (n - 0.5) * 0.18 - 0.1 * Math.sin(Math.PI * i / nx) * (1 - v) + (j === 0 ? 0.05 : 0);
        const c = mixCol(mixCol(TURF[0], TURF[1], n), j === 0 ? TURF[3] : TURF[2], fbm2(x * 2.1, v * 5 + sz * 3, 2) * 0.8);
        row.push(hp.vert(x, y, z, 0, 1, sz * 0.5, c)); prow.push([x, y, z]);
      }
      grid.push(row); P.push(prow);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (sz > 0) hp.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]); else hp.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]); }
    // the cut edge of the turf along the eave and up each gable
    const lip = (a, b) => { const q = (p, dy) => hp.vert(p[0], p[1] + dy, p[2], 0, 0, sz, dy ? EARTH : mulCol(TURF[2], 0.8)); const i0 = q(a, 0), i1 = q(b, 0), i2 = q(b, -0.3), i3 = q(a, -0.3); hp.quad(i0, i1, i2, i3); };
    for (let i = 0; i < nx; i++) lip(P[i][nz], P[i + 1][nz]);
    for (let j = 0; j < nz; j++) { lip(P[0][j], P[0][j + 1]); lip(P[nx][j], P[nx][j + 1]); }
    // the roof from underneath, and the log that holds the turf at the eave
    face(hw, [x0, ridgeY - 0.06, 0], [x1, ridgeY - 0.06, 0], [x1, eaveY - 0.06, sz * eaveZ], [x0, eaveY - 0.06, sz * eaveZ], WOOD_U.tar, 0, 3, [0.16, 0.14, 0.13]);
    tube(hw, [[x0 - 0.1, eaveY + 0.12, sz * (eaveZ + 0.04), 0.1], [0, eaveY + 0.1, sz * (eaveZ + 0.04), 0.1], [x1 + 0.1, eaveY + 0.12, sz * (eaveZ + 0.04), 0.095]], 6, () => grey(0.9), null, true, WOOD_U.grey, 1.2);
    // the dark inside of the wall
    face(hw, [-Lh, -0.3, sz * (Wh - 0.34)], [Lh - 0.05, -0.3, sz * (Wh - 0.34)], [Lh - 0.05, roofY(Wh - 0.34), sz * (Wh - 0.34)], [-Lh, roofY(Wh - 0.34), sz * (Wh - 0.34)], WOOD_U.tar, 0, 1, [0.1, 0.09, 0.09]);
  }
  face(hw, [-Lh, 0.03, -Wh], [Lh, 0.03, -Wh], [Lh, 0.03, Wh], [-Lh, 0.03, Wh], WOOD_U.tar, 0, 2, [0.1, 0.08, 0.07]);         // the floor
  // the gables: upright boards black with tar, the one toward the water open
  const gable = (x, door, dark) => {
    for (let z = -Wh; z < Wh - 0.01; z += 0.3) {
      const z1 = Math.min(Wh, z + 0.3), zc = (z + z1) / 2, y0 = door && Math.abs(zc) < 1.32 ? 2.5 : -0.3, yt0 = roofY(z) - 0.05, yt1 = roofY(z1) - 0.05;
      if (Math.min(yt0, yt1) <= y0 + 0.02) continue;
      const k = dark ? 0.1 : 0.5 + rnd() * 0.42;
      face(hw, [x, y0, z], [x, y0, z1], [x, yt1, z1], [x, yt0, z], WOOD_U.tar, rnd(), rnd() + (yt0 - y0) / 1.3, [k, k * 0.96, k * 0.93]);
    }
  };
  gable(Lh, true, false); gable(-Lh, false, false); gable(-Lh + 0.06, false, true);
  // door posts and lintel, and the barge boards that cross above the ridge
  for (const sz of [-1, 1]) beam(hw, [Lh + 0.04, -0.3, sz * 1.36], [Lh + 0.04, 2.56, sz * 1.36], 0.2, 0.16, [1, 0, 0], WOOD_U.carved, [0.8, 0.78, 0.74], 0.84);
  beam(hw, [Lh + 0.05, 2.62, -1.62], [Lh + 0.05, 2.62, 1.62], 0.22, 0.18, [1, 0, 0], WOOD_U.carved, [0.82, 0.8, 0.76], 0.84);
  for (const x of [Lh + 0.62, -Lh - 0.36]) for (const sz of [-1, 1]) {
    const a = [x, eaveY + 0.05, sz * (eaveZ + 0.12)], dy = ridgeY + 0.42 - a[1], dz = -a[2], l = Math.hypot(dy, dz), e = 1 + 1.05 / l;
    beam(hw, a, [x + (sz > 0 ? 0.035 : -0.035), a[1] + dy * e, a[2] + dz * e], 0.27, 0.05, [1, 0, 0], WOOD_U.grey, grey(0.6), 1.6);
  }
  // within, the bigger boat on her rollers: only her stem is in the light of the door
  { const big = buildHull({ L: 7.6, beam: 1.9, draft: 0.28, sheerMid: 0.78, sheerEnd: 1.22, inside: false, floor: false, N: 12, lap: 0.02, tintOut: [0.5, 0.47, 0.45], grain: 2.2 });
    stemPost(big.b, -3.8, -1, -0.1, 1.22, 0.55, 0.3, 0.08, 1.3, WOOD_U.carved, [0.84, 0.8, 0.76]);
    hw.add(big.b, new THREE.Matrix4().makeTranslation(Lh - 0.75 - 3.8, 0.34, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))); }
  // the slip: two rails and the rollers a keel runs down on
  const yEnd = -hc.y - 0.22;
  for (const sz of [-1, 1]) tube(hw, [[Lh - 0.4, 0.14, sz * 0.78, 0.085], [Lh + 2.6, (0.14 + yEnd) * 0.55, sz * 0.8, 0.085], [Lh + 6.4, yEnd, sz * 0.82, 0.08]], 6, () => grey(0.8), null, true, WOOD_U.grey, 1.2);
  for (let k = 0; k < 5; k++) { const x = Lh + 0.7 + k * 1.2, y = 0.26 + (yEnd - 0.14) * Math.min(1, (x - Lh) / 6.4); tube(hw, [[x, y, -1.15, 0.07], [x + 0.03, y, 1.15, 0.07]], 6, () => grey(0.85), null, true, WOOD_U.pale, 0.8); }
  stone.add(hs, H); wood.add(hw, H); hp.smoothNormals(); turf.add(hp, H);

  // ------------------------------------------------------------------ the kept fire, and the log somebody sat on
  const fp = new THREE.Vector3(Lh + 3.0, 0, -4.4).applyMatrix4(H); fp.y = groundAt(fp.x, fp.z, S0) - 0.03;
  const hearth = fire(ctx, stone, wood, fp, S0, 1.0);
  { const a = new THREE.Vector3(Lh + 1.4, 0, -5.5).applyMatrix4(H), b2 = new THREE.Vector3(Lh + 3.3, 0, -6.2).applyMatrix4(H);
    tube(wood, [[a.x, groundAt(a.x, a.z, S0) + 0.17, a.z, 0.2], [b2.x, groundAt(b2.x, b2.z, S0) + 0.16, b2.z, 0.18]], 7, () => grey(0.6), null, grey(1.1), WOOD_U.grey, 1.2); }

  // ------------------------------------------------------------------ the jetty
  const SJ = 3.3, J = frame(spot(SJ, -river.halfWidth(SJ), 0), SJ), jw = new Builder(1500), jr = new Builder(40), deck = 0.42, endX = 7.3;
  for (const sz of [-1, 1]) beam(jw, [-0.9, deck - 0.1, sz * 0.4], [endX, deck - 0.1, sz * 0.4], 0.12, 0.14, [0, 0, 1], WOOD_U.grey, grey(0.6), 1.3);
  for (let x = -0.8; x < endX + 0.05; x += 0.236) { const sk = (rnd() - 0.5) * 0.03, lift = rnd() < 0.08 ? 0.012 : 0; beam(jw, [x + sk, deck + lift, -0.56 - rnd() * 0.04], [x - sk, deck + lift, 0.56 + rnd() * 0.04], 0.215, 0.045, [1, 0, 0], WOOD_U.grey, grey(), 1.1); }
  for (const x of [0.5, 2.3, 4.1, 5.9, endX - 0.08]) for (const sz of [-1, 1]) {
    const tall = x > 7 ? 1.28 : 0.6 + rnd() * 0.12;
    tube(jw, [[x, -0.8, sz * 0.63, 0.08], [x, 0.1, sz * 0.63, 0.075], [x + (rnd() - 0.5) * 0.03, tall, sz * 0.63, 0.068]], 7, (i) => grey(i === 0 ? 0.45 : 0.9), null, grey(1.05), WOOD_U.grey, 0.9);
  }
  // the board across its end, and what is cut in it: far wel
  beam(jw, [endX + 0.01, 1.0, 0.7], [endX + 0.01, 1.0, -0.7], 0.24, 0.035, [1, 0, 0], WOOD_U.pale, [0.72, 0.66, 0.58], 1.4);
  runes(jr, 'far wel', [endX + 0.032, 0.92, 0.36], [0, 0, -1], [0, 1, 0], 0.16, [0.12, 0.09, 0.08]);
  // a line made fast to the downstream post, hanging to the water
  tube(jw, [[endX - 0.08, 1.05, -0.63, 0.012], [endX + 0.2, 0.7, -0.5, 0.012], [endX + 0.55, 0.2, -0.25, 0.012], [endX + 0.7, -0.1, 0.0, 0.012]], 4, (i, j) => mulCol([0.9, 0.8, 0.58], 0.6 + 0.4 * ((i + j) % 2)), null, false, WOOD_U.pale, 0.3);
  wood.add(jw, J); cut.add(jr, J);

  // ------------------------------------------------------------------ across the water: a stone, set up for someone
  { const m = frame(onBank(27, 1, 1.1, -0.1), 27, -0.93);
    menhir(stone, 1.05, 2.7, 0.38, 311, m);
    runes(cut, 'raido', [-0.42, 1.35, 0.2], [1, 0, 0], [0, 1, 0], 0.27, [0.16, 0.15, 0.15], m); }
  menhir(stone, 0.6, 1.5, 0.3, 312, frame(onBank(30.5, 1, 1.6, -0.1), 30, -0.7)); menhir(stone, 0.5, 1.15, 0.28, 313, frame(onBank(23.4, 1, 2.2, -0.1), 23, -1.2));
  for (let k = 0; k < 5; k++) { const p = onBank(24 + rnd() * 7, 1, 0.3 + rnd() * 2.6, 0.05); rock(stone, p.x, p.y, p.z, 0.3 + rnd() * 0.4, 0.2 + rnd() * 0.2, 0.3 + rnd() * 0.4, 330 + k, 1); }

  ctx.mesh(stone, ctx.mats.stone, S0, true, { uv: false, name: 'naust stone' });
  ctx.mesh(turf, ctx.mats.plain, S0, true, { uv: false, name: 'naust turf' });
  ctx.mesh(wood, ctx.mats.wood, S0, true, { name: 'naust wood' });
  ctx.mesh(cut, ctx.mats.runes, S0, false, { name: 'naust runes' });
  ctx.clearings.push({ s0: -16, s1: 38, side: -1, out0: -2, out1: 19 }, { s0: -20, s1: 36, side: 1, out0: -2, out1: 5.5 }, { s0: 37, s1: 47, side: 1, out0: -2, out1: 7 });

  // ------------------------------------------------------------------ the one birch, leaning out over the water
  ctx.planters.push((forest) => {
    const tpl = forest.T.birch[1][0], c = new Builder(800), bk = new Builder(400), so = new Builder(200);
    const pos = onBank(42, 1, 0.5, -0.3), hd = river.at(42, {}).heading;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hd + 0.5).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)), 0.36));
    const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1.55, 1.55, 1.55));
    c.add(tpl.cut, m, [0.62, 0.6, 0.36]); bk.add(tpl.bark, m); so.add(tpl.solid, m);
    ctx.world.add(new THREE.Mesh(c.build(), forest.cutMat), 42, true); ctx.world.add(new THREE.Mesh(bk.build({ bend: false }), forest.barkMat), 42, true); ctx.world.add(new THREE.Mesh(so.build({ uv: false }), forest.solidMat), 42, true);
  });

  // ------------------------------------------------------------------ the fells, the star, the far beacon
  // Two ranges, drawn as a painter draws far hills: a single edge each, darker and sharper the nearer, standing
  // either side of the river's line so that the last of the light lies in the gap between them.
  const c0 = river.at(0, {}), fells = new THREE.Group(); fells.name = 'fells';
  for (const [R, base, rise, gap, seed, fogScale, tintc] of [[2300, 150, 420, 13, 3.1, 0.0016, [0.34, 0.42, 0.62]], [1500, 60, 250, 9, 8.7, 0.0045, [0.2, 0.27, 0.42]]]) {
    const fb = new Builder(400), seg = 150;
    for (let i = 0; i <= seg; i++) {
      const deg = -84 + 168 * i / seg, a = deg * Math.PI / 180, x = c0.x + Math.sin(a) * R, z = c0.z - Math.cos(a) * R;
      const shoulder = 1 - Math.exp(-Math.pow((deg + 2) / gap, 2)), peaks = fbm2(deg * 0.07 + seed, seed * 2.3, 4), crags = fbm2(deg * 0.5 + seed * 5, 1.7, 3);
      const y = base * (0.35 + 0.65 * shoulder) + rise * shoulder * (0.25 + 1.3 * peaks * peaks) + (crags - 0.5) * rise * 0.14;
      fb.vert(x, y, z, -Math.sin(a), 0.5, Math.cos(a), tintc); fb.vert(x, -40, z, -Math.sin(a), 0.5, Math.cos(a), mulCol(tintc, 1.5));
    }
    for (let i = 0; i < seg; i++) fb.quad(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1);
    const m = new THREE.Mesh(fb.build({ uv: false, bend: false }), makePaint({ vertexLit: true, brush: 0, fogScale, side: THREE.DoubleSide, inside: 1 })); m.frustumCulled = false; fells.add(m);
  }
  const fellsTwin = ctx.world.add(fells, null, true);
  const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const stars = [
    [dir(-0.045, 0.3, -1), 26, '#fff1c8', 2.2, 0.35],                                                            // Aurvandil's toe, over the notch
    [dir(0.5, 0.62, -1), 14, '#dfe8ff', 1.1, 0.5], [dir(0.545, 0.665, -1), 16, '#e8eeff', 1.3, 0.5], [dir(0.59, 0.71, -1), 14, '#dfe8ff', 1.1, 0.5],   // Frigg's distaff
    [dir(-0.62, 0.8, -1), 13, '#ffe6d0', 0.9, 0.5], [dir(0.2, 1.1, -1), 12, '#e6ecff', 0.8, 0.5],
  ].map(([d, size, color, power, flicker]) => ({ d, base: power, g: ctx.glows.add({ position: new THREE.Vector3(), size, color: new THREE.Color(color), power, flicker, star: true }) }));
  const beacon = ctx.glows.add({ position: new THREE.Vector3(c0.x - 520, 150, c0.z - 1380), size: 12, color: new THREE.Color('#ff9440'), power: 0.7, flicker: 0.7, star: true });

  // ------------------------------------------------------------------ mist beginning to lie on the water, further down
  const puffs = [];
  for (let s = 40; s < 118; s += 5.5) { const hwd = river.halfWidth(s), p = spot(s, (rnd() - 0.5) * hwd * 1.5, 0.4 + rnd() * 0.25); puffs.push({ x: p.x, y: p.y, z: p.z, width: 7 + rnd() * 8, height: 1.0 + rnd() * 1.0, opacity: 0.16 + 0.3 * smooth(40, 110, s), drift: 0.6 + rnd() }); }
  ctx.world.add(makeMist(puffs), 70, false);

  ctx.ticks.push((dt, time, boat, look, eye) => {
    const near = 1 - smooth(84, 124, boat.s);
    fells.visible = fellsTwin.visible = near > 0;
    for (const st of stars) { st.g.position.copy(eye).addScaledVector(st.d, 2600); st.g.power = st.base * near; }
    beacon.power = 0.7 * near;
  });
  return { hearth };
}
