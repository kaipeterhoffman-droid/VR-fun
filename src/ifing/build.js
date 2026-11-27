// Builder: gathers many small pieces of geometry into one, so that a whole stretch of forest is a single drawing.
// It is used twice over: to model each kind of tree, stone and fern once (corner by corner), and then to stamp
// hundreds of them, turned and scaled and tinted, into each 40 m section of the river.
import * as THREE from 'three';

export class Builder {
  constructor(cap = 1024) {
    this.nv = 0; this.ni = 0;
    this.pos = new Float32Array(cap * 3); this.nor = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.uv = new Float32Array(cap * 2); this.bend = new Float32Array(cap); this.idx = new Uint32Array(cap * 3);
  }

  room(nv, ni) {
    if (this.nv + nv > this.bend.length) {
      const cap = Math.max(this.bend.length * 2, this.nv + nv);
      const grow = (a, k) => { const b = new Float32Array(cap * k); b.set(a.subarray(0, this.nv * k)); return b; };
      this.pos = grow(this.pos, 3); this.nor = grow(this.nor, 3); this.col = grow(this.col, 3); this.uv = grow(this.uv, 2); this.bend = grow(this.bend, 1);
    }
    if (this.ni + ni > this.idx.length) { const b = new Uint32Array(Math.max(this.idx.length * 2, this.ni + ni)); b.set(this.idx.subarray(0, this.ni)); this.idx = b; }
  }

  /** One corner: where, which way it faces, its colour [r, g, b] (linear), its place on the picture, how free it is in the wind. */
  vert(x, y, z, nx, ny, nz, c, u = 0, v = 0, bend = 0) {
    this.room(1, 0);
    const i = this.nv++, l = Math.hypot(nx, ny, nz) || 1;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nor[i * 3] = nx / l; this.nor[i * 3 + 1] = ny / l; this.nor[i * 3 + 2] = nz / l;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v; this.bend[i] = bend;
    return i;
  }
  tri(a, b, c) { this.room(0, 3); this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c; }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }

  /** Stamp another builder's (or a geometry's) contents here, moved by a matrix and multiplied by a tint [r, g, b]. */
  add(src, m, tint = null, bendScale = 1) {
    if (src.isBufferGeometry) src = Builder.from(src);
    const n = src.nv, e = m ? m.elements : null, base = this.nv;
    this.room(n, src.ni);
    const P = this.pos, N = this.nor, Cc = this.col, sp = src.pos, sn = src.nor, sc = src.col;
    const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
    for (let i = 0; i < n; i++) {
      const x = sp[i * 3], y = sp[i * 3 + 1], z = sp[i * 3 + 2], a = sn[i * 3], b = sn[i * 3 + 1], c = sn[i * 3 + 2], o = (base + i) * 3;
      if (e) {
        P[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = e[0] * a + e[4] * b + e[8] * c, ny = e[1] * a + e[5] * b + e[9] * c, nz = e[2] * a + e[6] * b + e[10] * c, l = Math.hypot(nx, ny, nz) || 1;
        N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
      } else { P[o] = x; P[o + 1] = y; P[o + 2] = z; N[o] = a; N[o + 1] = b; N[o + 2] = c; }
      Cc[o] = sc[i * 3] * tr; Cc[o + 1] = sc[i * 3 + 1] * tg; Cc[o + 2] = sc[i * 3 + 2] * tb;
    }
    this.uv.set(src.uv.subarray(0, n * 2), base * 2);
    if (bendScale === 1) this.bend.set(src.bend.subarray(0, n), base);
    else for (let i = 0; i < n; i++) this.bend[base + i] = src.bend[i] * bendScale;
    const I = this.idx, si = src.idx;
    for (let i = 0; i < src.ni; i++) I[this.ni + i] = si[i] + base;
    this.nv += n; this.ni += src.ni;
    return this;
  }

  static from(geo) {
    const b = new Builder(geo.attributes.position.count), n = geo.attributes.position.count;
    b.pos.set(geo.attributes.position.array.subarray(0, n * 3));
    if (geo.attributes.normal) b.nor.set(geo.attributes.normal.array.subarray(0, n * 3));
    if (geo.attributes.color) b.col.set(geo.attributes.color.array.subarray(0, n * 3)); else b.col.fill(1);
    if (geo.attributes.uv) b.uv.set(geo.attributes.uv.array.subarray(0, n * 2));
    b.nv = n;
    if (geo.index) { b.room(0, geo.index.count); b.idx.set(geo.index.array); b.ni = geo.index.count; }
    else { b.room(0, n); for (let i = 0; i < n; i++) b.idx[i] = i; b.ni = n; }
    return b;
  }

  /** Give every corner the normal of the surface round it (for things modelled without thinking about normals). */
  smoothNormals() {
    const P = this.pos, N = this.nor; N.fill(0, 0, this.nv * 3);
    for (let i = 0; i < this.ni; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let i = 0; i < this.nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    return this;
  }

  get triangles() { return this.ni / 3; }

  /** The finished geometry. Colours and normals are packed small: a forest is mostly these. */
  build({ uv = true, bend = true } = {}) {
    const g = new THREE.BufferGeometry(), n = this.nv;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    const nor = new Int8Array(n * 3), col = new Uint8Array(n * 3);
    for (let i = 0; i < n * 3; i++) { nor[i] = Math.round(this.nor[i] * 127); col[i] = Math.min(255, Math.round(Math.sqrt(Math.max(0, this.col[i])) * 255)); }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));          // kept as square roots: finer steps in the darks
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    if (bend) { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.min(255, Math.round(this.bend[i] * 255)); g.setAttribute('aBend', new THREE.BufferAttribute(b, 1, true)); }
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.idx.slice(0, this.ni) : new Uint16Array(this.idx.subarray(0, this.ni)), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** A colour as the builder wants it: linear [r, g, b] from '#rrggbb', times k. */
const _c = new THREE.Color();
export function col(hex, k = 1) { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; }
export const mixCol = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulCol = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
