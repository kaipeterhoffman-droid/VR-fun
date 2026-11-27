// The land: the two banks of the river, section by section, and the wall of far forest that stands behind them.
import * as THREE from 'three';
import { Builder, col, mixCol } from './build.js';
import { makePaint } from './paint.js';
import { river, landHeight, wooded, LENGTH } from './river.js';
import { fbm2, noise2, smooth, clamp } from './noise.js';
import { treeWall } from './art.js';
import { SECTION } from './world.js';

// metres outside the water's edge at which the bank is sampled: close together by the water, where it is looked at
const OUT = [0, 0.35, 0.8, 1.5, 2.6, 4.2, 6.5, 9.5, 13.5, 19, 26, 35, 46, 62];
const ROW = 2;

// What the ground is made of, along the river: [s, at the waterline, the turf, the forest floor].
const GROUND = [
  [-160, '#5b616b', '#56683a', '#5a5046'], [70, '#565a62', '#52683a', '#57483c'],
  [120, '#2c2824', '#44682a', '#4c3a2c'], [340, '#2c2824', '#44682a', '#4c3a2c'],
  [400, '#474c56', '#5d6c58', '#565660'], [570, '#474c56', '#5d6c58', '#565660'],
  [630, '#1c1612', '#c49a36', '#94682a'], [780, '#1c1612', '#c49a36', '#94682a'],
  [830, '#8d8778', '#bdb6a2', '#a39c8a'], [LENGTH + 240, '#c9c2b0', '#d8d2c2', '#bcb5a4'],
].map(([s, a, b, c]) => [s, col(a), col(b), col(c)]);
function groundAt(s) {
  let i = 1; while (i < GROUND.length - 1 && s > GROUND[i][0]) i++;
  const A = GROUND[i - 1], B = GROUND[i], t = smooth(A[0], B[0], s);
  return [mixCol(A[1], B[1], t), mixCol(A[2], B[2], t), mixCol(A[3], B[3], t)];
}

/** Where the far wall of forest stands, metres behind the water's edge: close in the deep wood, far back round the open water. */
export function wallOut(s) { const w = wooded(s); return 30 + (1 - smooth(0.25, 0.8, w)) * 44; }

/** `gaps`: where the far wall is left out, because something bigger than a wood stands there: [{ s0, s1, side }]. */
export function buildLand(world, gaps = []) {
  const gapAt = (s, side) => { let k = 1; for (const g of gaps) if (g.side === side) k = Math.min(k, 1 - smooth(g.s0 - 6, g.s0 + 6, s) * (1 - smooth(g.s1 - 6, g.s1 + 6, s))); return k; };
  const landMat = makePaint({ brush: 0.3, brushScale: 0.21, wet: 0.32 });
  const wallTex = treeWall(3, 'spruce');
  const wallMat = makePaint({ map: wallTex, cutout: true, alphaTest: 0.5, vertexLit: true, brush: 0, side: THREE.DoubleSide, inside: 1, fogScale: 0.7 });
  const pt = [0, 0];
  for (const sec of world.sections) {
    const b = new Builder(1200), rows = Math.round(SECTION / ROW) + 1;
    for (const side of [-1, 1]) {
      const base = b.nv;
      for (let r = 0; r < rows; r++) {
        const s = sec.s0 + r * ROW, hw = river.halfWidth(s), [mud, turf, floor] = groundAt(s);
        for (let c = 0; c < OUT.length; c++) {
          const out = OUT[c];
          river.point(s, side * (hw + out), pt);
          const y = out === 0 ? -0.05 : landHeight(s, side, out);
          const patch = smooth(0.38, 0.62, fbm2(pt[0] * 0.09 + 11, pt[1] * 0.09 + 5, 3));
          const dry = smooth(0.15, 1.5, out + (noise2(pt[0] * 0.7, pt[1] * 0.7) - 0.5) * 0.8);
          let cc = mixCol(mud, mixCol(turf, floor, patch), dry);
          const v = 0.78 + 0.44 * fbm2(pt[0] * 0.31, pt[1] * 0.31, 2);
          cc = [cc[0] * v, cc[1] * v, cc[2] * v];
          b.vert(pt[0], y, pt[1], 0, 1, 0, cc);
        }
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < OUT.length - 1; c++) {
        const a = base + r * OUT.length + c, d = a + OUT.length;
        if (side > 0) b.quad(a, d, d + 1, a + 1); else b.quad(a, a + 1, d + 1, d);
      }
    }
    b.smoothNormals();
    const land = new THREE.Mesh(b.build({ uv: false, bend: false }), landMat); land.name = 'land';
    world.add(land, sec.s0 + 1, true);

    // the far wood: two painted walls of trees behind the last real ones, the farther one taller and paler
    const w = new Builder(200); let any = false;
    for (const side of [-1, 1]) for (let layer = 0; layer < 2; layer++) {
      const base = w.nv, n = Math.round(SECTION / 5) + 1;
      for (let r = 0; r < n; r++) {
        const s = sec.s0 + r * 5, wd = wooded(s), hw = river.halfWidth(s);
        const out = wallOut(s) + layer * 24 + (fbm2(s * 0.03 + side * 7 + layer * 3, 1.5, 2) - 0.5) * 9;
        river.point(s, side * (hw + out), pt);
        const p0 = river.at(clamp(s, 0, LENGTH), {});
        const ground = landHeight(s, side, Math.min(out, 60)) - 1.5;
        const tall = (19 + layer * 11) * (0.85 + 0.3 * fbm2(s * 0.017 + side * 3, layer * 5.1, 2)) * smooth(0.02, 0.2, wd) * gapAt(s, side);
        const u = s / 96 + layer * 0.37 + (side > 0 ? 0.5 : 0);
        const shadeK = layer ? 1.0 : 0.62, cc = [shadeK, shadeK, shadeK];
        const nx = -side * p0.rx, nz = -side * p0.rz;
        w.vert(pt[0], ground, pt[1], nx, 0.25, nz, cc, u, 1, 0);
        w.vert(pt[0], ground + tall, pt[1], nx, 0.6, nz, cc, u, 0.02, 0.15);
        if (tall > 1) any = true;
      }
      for (let r = 0; r < n - 1; r++) { const a = base + r * 2; w.quad(a, a + 2, a + 3, a + 1); }
    }
    if (any) { const wall = new THREE.Mesh(w.build({ bend: false }), wallMat); wall.name = 'far wood'; world.add(wall, sec.s0 + 1, true); }
  }
  return { landMat, wallMat };
}
