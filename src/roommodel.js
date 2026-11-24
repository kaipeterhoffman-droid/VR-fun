// Turns the raw depth voxels into a clean, playable room:
//  - planes for floor, ceiling and walls, fitted from near and far (noisy) points alike;
//    big ones are treated as infinite and only cut where sensor rays have actually passed
//    through (doorways, openings), so a wall hidden behind a couch is still a wall
//  - furniture voxels squashed into a height map and merged into solid boxes
// Everything is fitted from the depth map's own data; nothing comes from Quest's room scan.
import * as THREE from 'three';
import { VOX, OCC, COARSE } from './depthmap.js';

const MIN_WALL_AREA = 0.9; // m² of evidence before a vertical surface counts as a wall
const MIN_FLOOR_AREA = 0.25;
const MIN_CEIL_AREA = 0.4;
const FURNITURE_MAX_H = 2.2;
const MAX_BOXES = 500;

export class RoomModel {
  constructor(scene) {
    this.scene = scene;
    this.planes = []; // { n, d, kind, center, u, v, uMin, uMax, vMin, vMax }
    this.boxes = []; // THREE.Box3
    this.baked = false;
    this.floorY = 0;
    this.viz = new THREE.Group();
    this.viz.visible = false;
    scene.add(this.viz);
    this.vizUntil = 0;
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
  }

  reset() {
    this.planes = [];
    this.boxes = [];
    this.baked = false;
    this.clearViz();
  }

  // ---------- samples ----------
  samples(map) {
    const out = [];
    for (const c of map.vox.values()) {
      if (c.h < OCC) continue;
      const L = Math.hypot(c.nx, c.ny, c.nz);
      if (L < 1e-6) continue;
      out.push({
        x: (c.x + 0.5) * VOX, y: (c.y + 0.5) * VOX, z: (c.z + 0.5) * VOX,
        nx: c.nx / L, ny: c.ny / L, nz: c.nz / L, w: VOX * VOX,
      });
    }
    for (const c of map.coarse.values()) {
      if (c.w < 2) continue;
      const L = Math.hypot(c.nx, c.ny, c.nz);
      if (L < 1e-6 || L / c.w < 0.6) continue; // normals disagree: not a flat patch
      out.push({
        x: c.sx / c.w, y: c.sy / c.w, z: c.sz / c.w,
        nx: c.nx / L, ny: c.ny / L, nz: c.nz / L, w: COARSE * COARSE,
      });
    }
    return out;
  }

  // ---------- plane fitting ----------
  fitPlanes(map) {
    const S = this.samples(map);
    const planes = [];

    // horizontal: histogram heights of up-facing and down-facing patches
    const up = new Map(), down = new Map();
    const BIN = 0.04;
    for (const s of S) {
      if (s.ny > 0.85) up.set(Math.round(s.y / BIN), (up.get(Math.round(s.y / BIN)) || 0) + s.w);
      else if (s.ny < -0.85) down.set(Math.round(s.y / BIN), (down.get(Math.round(s.y / BIN)) || 0) + s.w);
    }
    const peak = (hist, test) => {
      let best = null, bw = 0;
      for (const [b, w] of hist) {
        const y = b * BIN;
        if (!test(y)) continue;
        const ww = w + (hist.get(b - 1) || 0) + (hist.get(b + 1) || 0);
        if (ww > bw) { bw = ww; best = y; }
      }
      return { y: best, area: bw };
    };
    const refineY = (y0, sign) => {
      let sw = 0, sy = 0;
      for (const s of S) if (s.ny * sign > 0.85 && Math.abs(s.y - y0) < 0.07) { sw += s.w; sy += s.y * s.w; }
      return sw ? sy / sw : y0;
    };
    const f = peak(up, (y) => y < 0.45 && y > -0.6);
    this.floorY = f.y !== null && f.area > MIN_FLOOR_AREA ? refineY(f.y, 1) : 0;
    planes.push(this.makePlane(new THREE.Vector3(0, 1, 0), this.floorY, 'floor', S));
    const c = peak(down, (y) => y > this.floorY + 1.7);
    if (c.y !== null && c.area > MIN_CEIL_AREA) {
      const cy = refineY(c.y, -1);
      planes.push(this.makePlane(new THREE.Vector3(0, -1, 0), -cy, 'ceiling', S));
    }

    // vertical: Hough-style vote over (facing direction, offset)
    const TH = 3 * Math.PI / 180, DB = 0.04;
    const votes = new Map();
    const vert = [];
    for (const s of S) {
      if (Math.abs(s.ny) > 0.25) continue;
      const L = Math.hypot(s.nx, s.nz);
      const nx = s.nx / L, nz = s.nz / L;
      const th = Math.atan2(nz, nx);
      const d = nx * s.x + nz * s.z;
      const tb = Math.round(th / TH), db = Math.round(d / DB);
      const k = tb * 100000 + db;
      votes.set(k, (votes.get(k) || 0) + s.w);
      vert.push({ s, nx, nz, th, d });
    }
    const nT = Math.round((2 * Math.PI) / TH);
    const smooth = [];
    for (const [k, w] of votes) {
      const tb = Math.round(k / 100000), db = k - tb * 100000;
      let sum = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        let t = tb + a;
        if (t > nT / 2) t -= nT; else if (t < -nT / 2) t += nT;
        sum += votes.get(t * 100000 + db + b) || 0;
      }
      smooth.push({ tb, db, w: sum });
    }
    smooth.sort((a, b) => b.w - a.w);
    const walls = [];
    for (const cand of smooth) {
      if (cand.w < MIN_WALL_AREA || walls.length >= 14) break;
      const th = cand.tb * TH, d = cand.db * DB;
      if (walls.some((w) => angDiff(w.th, th) < 10 * Math.PI / 180 && Math.abs(w.d - d) < 0.25)) continue;
      // refine with the samples that agree
      let sw = 0, snx = 0, snz = 0, sd = 0;
      for (const v of vert) {
        if (angDiff(v.th, th) < 8 * Math.PI / 180 && Math.abs(v.d - d) < 0.07) {
          sw += v.s.w; snx += v.nx * v.s.w; snz += v.nz * v.s.w; sd += v.d * v.s.w;
        }
      }
      if (sw < MIN_WALL_AREA * 0.8) continue;
      const L = Math.hypot(snx, snz);
      const n = new THREE.Vector3(snx / L, 0, snz / L);
      const dd = sd / sw;
      walls.push({ th: Math.atan2(n.z, n.x), d: dd });
      // a real wall has (almost) nothing behind it; a couch back or counter front has the room behind it.
      // Only real walls get extended into space you haven't seen.
      let front = 0, behind = 0;
      for (const q of S) {
        const t = n.x * q.x + n.z * q.z - dd;
        if (t > 0.3) front += q.w; else if (t < -0.3) behind += q.w;
      }
      const shell = behind < 0.15 * front || behind < 0.3;
      const pl = this.makePlane(n, dd, shell ? 'wall' : 'face', S);
      if (!shell) { pl.uMin -= 0.08; pl.uMax += 0.08; pl.vMin -= 0.08; pl.vMax += 0.08; }
      planes.push(pl);
    }
    return planes;
  }

  makePlane(n, d, kind, S) {
    // an in-plane basis and the extent of the evidence, for drawing
    const u = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, cnt = 0;
    const p = this._p;
    for (const s of S) {
      const dist = n.x * s.x + n.y * s.y + n.z * s.z - d;
      if (Math.abs(dist) > 0.08 || n.x * s.nx + n.y * s.ny + n.z * s.nz < 0.8) continue;
      p.set(s.x, s.y, s.z);
      const a = p.dot(u), b = p.dot(v);
      uMin = Math.min(uMin, a); uMax = Math.max(uMax, a); vMin = Math.min(vMin, b); vMax = Math.max(vMax, b);
      cnt++;
    }
    if (!cnt) { uMin = vMin = -1; uMax = vMax = 1; }
    return { n, d, kind, u, v, uMin, uMax, vMin, vMax };
  }

  // ---------- furniture boxes ----------
  buildBoxes(map) {
    const fy = this.floorY;
    const ceil = this.planes.find((p) => p.kind === 'ceiling');
    const topLimit = Math.min(fy + FURNITURE_MAX_H, ceil ? -ceil.d - 0.25 : Infinity);
    const cols = new Map(); // 12 cm column x,z -> top y index
    const cnt = new Map();
    const bots = new Map(); // bottom voxel index of each column, -1e6 = sits on the floor
    const CELL = 2; // voxels per column side
    const near = (x, y, z) => this.nearPlane(x, y, z, 0.15); // depth noise makes walls ~10 cm thick
    const walls = this.planes.filter((p) => p.kind === 'wall');
    // only furniture inside the room: anything seen through/behind a wall is noise or the neighbours'
    const inside = (x, z) => walls.every((p) => p.n.x * x + p.n.z * z - p.d > 0.15);
    for (const c of map.vox.values()) {
      if (c.h < OCC + 1) continue; // furniture needs repeat sightings
      const y = (c.y + 0.5) * VOX;
      if (y < fy + VOX * 1.2 || y > topLimit) continue;
      const x = (c.x + 0.5) * VOX, z = (c.z + 0.5) * VOX;
      if (near(x, y, z) || !inside(x, z)) continue;
      const k = Math.floor(c.x / CELL) * 4096 + Math.floor(c.z / CELL);
      let list = cnt.get(k);
      if (!list) cnt.set(k, (list = []));
      list.push(c.y);
    }
    // column top = highest voxel with company: a lone floater (lamp cord, sensor speckle) shouldn't
    // turn a coffee table into a pillar
    for (const [k, ys] of cnt) {
      if (ys.length < 3) continue;
      ys.sort((a, b) => b - a);
      for (let i = 0; i < ys.length - 2; i++) {
        if (ys[i] - ys[i + 2] <= 3) {
          // walk down the stack; a gap means the thing floats (table top, shelf, hanging lamp)
          let j = i;
          while (j + 1 < ys.length && ys[j] - ys[j + 1] <= 4) j++;
          let bot = ys[j];
          if ((bot + 0.5) * VOX < fy + 0.3) bot = -1e6; // reaches the floor
          cols.set(k, ys[i]);
          bots.set(k, bot);
          break;
        }
      }
    }
    const kx = (k) => Math.round(k / 4096), kz = (k, x) => k - x * 4096;
    // drop speckle, fill pinholes
    const nb = (x, z) => {
      let n = 0, top = 0, bot = 1e6;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const kk = (x + a) * 4096 + z + b;
        const t = cols.get(kk);
        if (t !== undefined) { n++; top = Math.max(top, t); bot = Math.min(bot, bots.get(kk)); }
      }
      return { n, top, bot };
    };
    const clean = new Map();
    for (const [k, t] of cols) {
      const x = kx(k), z = kz(k, x);
      if (nb(x, z).n >= 2) clean.set(k, t);
    }
    for (const [k] of cols) {
      const x = kx(k), z = kz(k, x);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const kk = (x + a) * 4096 + z + b;
        if (clean.has(kk)) continue;
        const r = nb(x + a, z + b);
        if (r.n >= 5) { clean.set(kk, r.top); bots.set(kk, r.bot); }
      }
    }
    // greedy merge columns of similar height into boxes
    const done = new Set();
    const keys = [...clean.keys()].sort((a, b) => a - b);
    const boxes = [];
    const fyIdx = fy;
    for (const k of keys) {
      if (done.has(k) || boxes.length >= MAX_BOXES) continue;
      const x0 = kx(k), z0 = kz(k, x0), t0 = clean.get(k), b0 = bots.get(k);
      const ok = (x, z) => {
        const kk = x * 4096 + z;
        const t = clean.get(kk);
        const bb = bots.get(kk);
        return t !== undefined && !done.has(kk) && Math.abs(t - t0) <= 2 &&
          (bb === b0 || (bb > -1e5 && b0 > -1e5 && Math.abs(bb - b0) <= 2));
      };
      let x1 = x0;
      while (ok(x1 + 1, z0)) x1++;
      let z1 = z0;
      for (;;) {
        let row = true;
        for (let x = x0; x <= x1; x++) if (!ok(x, z1 + 1)) { row = false; break; }
        if (!row) break;
        z1++;
      }
      let top = t0, bot = b0;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const kk = x * 4096 + z;
        done.add(kk);
        top = Math.max(top, clean.get(kk));
        bot = Math.min(bot, bots.get(kk));
      }
      const minY = bot < -1e5 ? fyIdx : Math.max(fyIdx, bot * VOX);
      const box = new THREE.Box3(
        new THREE.Vector3(x0 * CELL * VOX, minY, z0 * CELL * VOX),
        new THREE.Vector3((x1 + 1) * CELL * VOX, (top + 1) * VOX, (z1 + 1) * CELL * VOX),
      );
      box.floats = minY > fy + 0.01;
      boxes.push(box);
    }
    return boxes;
  }

  inFace(p, x, y, z) {
    const a = p.u.x * x + p.u.y * y + p.u.z * z, b = p.v.x * x + p.v.y * y + p.v.z * z;
    return a > p.uMin && a < p.uMax && b > p.vMin && b < p.vMax;
  }

  nearPlane(x, y, z, tol) {
    for (const p of this.planes) {
      const s = p.n.x * x + p.n.y * y + p.n.z * z - p.d;
      if (Math.abs(s) < tol && (p.kind !== 'face' || this.inFace(p, x, y, z))) return true;
    }
    return false;
  }

  inBox(x, y, z, pad) {
    for (const b of this.boxes) {
      if (x > b.min.x - pad && x < b.max.x + pad && y > b.min.y - pad && y < b.max.y + pad && z > b.min.z - pad && z < b.max.z + pad) return true;
    }
    return false;
  }

  // ---------- bake ----------
  preview(map) {
    this.planes = this.fitPlanes(map);
    return this.planes.length;
  }

  get counts() {
    const c = { wall: 0, face: 0, floor: 0, ceiling: 0 };
    for (const p of this.planes) c[p.kind]++;
    return { ...c, boxes: this.boxes.length };
  }

  bake(map, now) {
    // flicker: weakly-seen voxels in space the sensor has also looked straight through
    let pruned = 0;
    for (const [k, c] of map.vox) {
      if (c.h < 4 && map.isSeenFree((c.x + 0.5) * VOX, (c.y + 0.5) * VOX, (c.z + 0.5) * VOX)) { if (c.h >= OCC) map.solid--; map.vox.delete(k); pruned++; }
    }
    this.pruned = pruned;
    this.planes = this.fitPlanes(map);
    this.boxes = this.buildBoxes(map);
    this.baked = true;
    // raw voxels that the model now covers stop colliding on their own (smoother bounces)
    const explain = (x, y, z) => this.nearPlane(x, y, z, 0.13) || this.inBox(x, y, z, VOX);
    for (const c of map.vox.values()) c.explained = explain((c.x + 0.5) * VOX, (c.y + 0.5) * VOX, (c.z + 0.5) * VOX);
    map.explain = explain;
    this.map = map;
    this.buildViz();
    this.showViz(true, now, 6);
  }

  // ---------- collision ----------
  collide(pos, r, contact) {
    if (!this.baked) return;
    const n = this._q;
    for (const p of this.planes) {
      const s = p.n.x * pos.x + p.n.y * pos.y + p.n.z * pos.z - p.d;
      if (s >= r || s < -0.3) continue;
      if (p.kind === 'face' && !this.inFace(p, pos.x, pos.y, pos.z)) continue;
      // openings: if sensor rays have passed through this spot of the plane, it's not solid there
      if (p.kind === 'wall' && this.map) {
        const qx = pos.x - p.n.x * s, qy = pos.y - p.n.y * s, qz = pos.z - p.n.z * s;
        if (this.map.isSeenFree(qx, qy, qz)) continue;
      }
      contact(n.copy(p.n), r - s, p.kind);
    }
    for (const b of this.boxes) {
      if (pos.x < b.min.x - r || pos.x > b.max.x + r || pos.y < b.min.y - r || pos.y > b.max.y + r || pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
      const cx = Math.min(Math.max(pos.x, b.min.x), b.max.x);
      const cy = Math.min(Math.max(pos.y, b.min.y), b.max.y);
      const cz = Math.min(Math.max(pos.z, b.min.z), b.max.z);
      let dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d >= r) continue;
      if (d > 1e-6) { n.set(dx / d, dy / d, dz / d); contact(n, r - d, 'box'); continue; }
      // inside: out through the top or the nearest side
      const faces = [
        [pos.y - b.min.y + (b.floats ? 0 : 99), 0, -1, 0], [b.max.y - pos.y, 0, 1, 0],
        [pos.x - b.min.x, -1, 0, 0], [b.max.x - pos.x, 1, 0, 0],
        [pos.z - b.min.z, 0, 0, -1], [b.max.z - pos.z, 0, 0, 1],
      ];
      let best = faces[0];
      for (const f of faces) if (f[0] < best[0]) best = f;
      contact(n.set(best[1], best[2], best[3]), best[0] + r, 'box');
    }
  }

  // ---------- visualisation ----------
  clearViz() {
    for (const c of [...this.viz.children]) {
      this.viz.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
  }

  buildViz() {
    this.clearViz();
    const grid = gridTexture();
    for (const p of this.planes) {
      const pad = p.kind === 'wall' ? 0.6 : p.kind === 'face' ? 0 : 0.3;
      const w = p.uMax - p.uMin + pad * 2, h = p.vMax - p.vMin + pad * 2;
      const tex = grid.clone();
      tex.needsUpdate = true;
      tex.repeat.set(w / 0.5, h / 0.5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        color: p.kind === 'wall' ? 0x66e0ff : p.kind === 'floor' ? 0x7dff9a : p.kind === 'face' ? 0xff7bd5 : 0xffc66b,
      }));
      const cu = (p.uMin + p.uMax) / 2, cv = (p.vMin + p.vMax) / 2;
      const c = new THREE.Vector3().addScaledVector(p.u, cu).addScaledVector(p.v, cv);
      // project onto the plane
      c.addScaledVector(p.n, p.d - c.dot(p.n));
      m.position.copy(c).addScaledVector(p.n, 0.005);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(p.u, p.v, p.n));
      this.viz.add(m);
    }
    if (this.boxes.length) {
      const pos = [];
      for (const b of this.boxes) {
        const { min: a, max: z } = b;
        const c = [
          [a.x, a.y, a.z], [z.x, a.y, a.z], [z.x, a.y, z.z], [a.x, a.y, z.z],
          [a.x, z.y, a.z], [z.x, z.y, a.z], [z.x, z.y, z.z], [a.x, z.y, z.z],
        ];
        for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pos.push(...c[i], ...c[j]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.viz.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: 0xff7bd5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }
  }

  showViz(on, now = 0, seconds = 0) {
    this.viz.visible = on;
    this.vizUntil = seconds ? now + seconds : 0;
  }

  tick(now) {
    if (this.vizUntil && now > this.vizUntil) { this.vizUntil = 0; this.viz.visible = false; }
    if (this.viz.visible) {
      const k = 0.35 + 0.2 * Math.sin(now * 3);
      for (const c of this.viz.children) if (c.isMesh) c.material.opacity = k;
    }
  }
}

function angDiff(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

let _grid = null;
function gridTexture() {
  if (_grid) return _grid;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  _grid = new THREE.CanvasTexture(c);
  _grid.wrapS = _grid.wrapT = THREE.RepeatWrapping;
  return _grid;
}
