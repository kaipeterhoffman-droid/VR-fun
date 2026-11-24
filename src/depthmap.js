// Our own room model, built live from the Quest 3 depth sensor.
//
// Several times a second we read a small (64x64) copy of the depth image back from the GPU,
// turn every pixel into a 3D point, and drop it into a sparse voxel grid (6 cm cells) that also
// remembers the surface normal there. Rays from the eye to each point carve away voxels that
// turned out to be empty, so things that move (people, chairs, doors) fade out of the map.
// Shots then collide with the voxels directly: any shape the sensor can see is solid.
import * as THREE from 'three';

const N = 64; // readback grid
const VOX = 0.06;
const MAX_RANGE = 8; // anything the sensor reports at all
const NEAR = 4.5; // fine voxels only up close, where depth is accurate
export const COARSE = 0.12; // far points feed a coarse grid used for plane fitting
const SAMPLE_HZ = 8;
const OCC = 2; // hits before a voxel counts as solid
const MAX_H = 12;

const VIEW_MAX = 12000; // voxels drawn at once (nearest the head)
const VIEW_R = 4.5;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const OFF = 512;
const key = (x, y, z) => ((x + OFF) * 1024 + (y + OFF)) * 1024 + (z + OFF);

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = (array) => `#version 300 es
precision highp float;
precision highp int;
${array ? 'precision highp sampler2DArray; uniform sampler2DArray uTex;' : 'uniform sampler2D uTex;'}
uniform int uLayer; uniform vec2 uSize; uniform float uNear; uniform float uRaw; uniform int uGpu;
uniform mat4 uXf;
in vec2 vUv; out vec4 o;
void main(){
  vec2 uv = (uXf * vec4(vUv, 0.0, 1.0)).xy;
  ivec2 c = ivec2(clamp(uv, vec2(0.0), vec2(0.9999)) * uSize);
  float t = ${array ? 'texelFetch(uTex, ivec3(c, uLayer), 0).r' : 'texelFetch(uTex, c, 0).r'};
  float m = uGpu == 1 ? uRaw * uNear / max(1e-4, 1.0 - t) : t * uRaw;
  if (!(m > 0.05 && m < 8.0)) { o = vec4(0.0); return; }
  float mm = floor(m * 1000.0 + 0.5);
  o = vec4(floor(mm / 256.0) / 255.0, mod(mm, 256.0) / 255.0, 1.0, 1.0);
}`;

export { VOX, OCC, key };

export class DepthMap {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.vox = new Map(); // key -> { h, nx, ny, nz, x, y, z, explained }
    this.coarse = new Map(); // key -> { w, sx, sy, sz, nx, ny, nz }  (12 cm cells, out to 8 m)
    this.free = new Map(); // key -> times a sensor ray passed through this 12 cm cell
    this.explain = null; // (worldX, worldY, worldZ) => true when a baked plane/box already covers it
    this.bounds = new THREE.Box3();
    this.solid = 0;
    this.mode = 'waiting'; // waiting | gpu | cpu | unavailable
    this.rate = SAMPLE_HZ; // samples per second; 0 pauses (each sample is a GPU readback plus a few ms of CPU)
    this.lastSample = -1;
    this.pixels = new Uint8Array(N * N * 4);
    this.depth = new Float32Array(N * N);
    this.pts = new Float32Array(N * N * 3);
    this.invProj = new THREE.Matrix4();
    this.camM = new THREE.Matrix4();
    this.camPos = new THREE.Vector3();
    this.failures = 0;
    this.showUntil = 0;
    this.show = false;
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    // debug / "scanning" view
    const geo = new THREE.BoxGeometry(VOX * 0.82, VOX * 0.82, VOX * 0.82);
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      color: 0x5ff2ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
    }), VIEW_MAX);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.inst.visible = false;
    scene.add(this.inst);
    this._m = new THREE.Matrix4();
  }

  get active() {
    return this.solid > 150;
  }

  reset() {
    this.vox.clear();
    this.coarse.clear();
    this.free.clear();
    this.bounds.makeEmpty();
    this.solid = 0;
    this.explain = null;
  }

  // ---------- GPU readback ----------
  initGL(gl) {
    if (this.gl === gl) return;
    this.gl = gl;
    const mk = (array) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS(array)]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
      }
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (const n of ['uTex', 'uLayer', 'uSize', 'uNear', 'uRaw', 'uGpu', 'uXf']) u[n] = gl.getUniformLocation(p, n);
      return { p, u };
    };
    this.progArray = mk(true);
    this.prog2D = mk(false);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.rt = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.rt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rt, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  readGPU(info) {
    const gl = this.renderer.getContext();
    this.initGL(gl);
    const isArray = info.textureType === 'texture-array';
    const prog = isArray ? this.progArray : this.prog2D;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, N, N);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(isArray ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D, info.texture);
    gl.uniform1i(prog.u.uTex, 0);
    gl.uniform1i(prog.u.uLayer, info.imageIndex ?? 0);
    gl.uniform2f(prog.u.uSize, info.width, info.height);
    gl.uniform1f(prog.u.uNear, info.depthNear ?? 0.1);
    gl.uniform1f(prog.u.uRaw, info.rawValueToMeters ?? 1);
    gl.uniform1i(prog.u.uGpu, 1);
    // Quest's GPU depth lines up with screen UVs (three.js and IWSDK occlusion both sample it that way)
    gl.uniformMatrix4fv(prog.u.uXf, false, IDENTITY);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.renderer.resetState(); // hand GL back to three.js untouched
    const px = this.pixels;
    for (let i = 0; i < N * N; i++) {
      this.depth[i] = px[i * 4 + 2] > 0 ? (px[i * 4] * 256 + px[i * 4 + 1]) / 1000 : 0;
    }
  }

  readCPU(info) {
    // rows of our grid go bottom-up; normalized view coords go top-down
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        let m = 0;
        try { m = info.getDepthInMeters((i + 0.5) / N, 1 - (j + 0.5) / N); } catch { m = 0; }
        this.depth[j * N + i] = m > 0.05 && m < 8 ? m : 0;
      }
    }
  }

  // ---------- map update ----------
  update(time) {
    if (this.mode === 'unavailable' || !this.rate) return;
    const xr = this.renderer.xr;
    const frame = xr.getFrame?.();
    const ref = xr.getReferenceSpace?.();
    const session = xr.getSession?.();
    if (!frame || !ref || !session) return;
    if (session.enabledFeatures && !session.enabledFeatures.includes('depth-sensing')) {
      this.mode = 'unavailable';
      return;
    }
    const pose = frame.getViewerPose(ref);
    const view = pose?.views?.[0];
    if (!view) return;
    // fast head motion smears depth against pose (ghost walls): wait for the head to settle
    const t = pose.transform, o = t.orientation, pp = t.position;
    const prev = this._prevPose;
    if (prev) {
      const dt = Math.max(1e-3, time - prev.time);
      const dot = Math.min(1, Math.abs(o.x * prev.x + o.y * prev.y + o.z * prev.z + o.w * prev.w));
      const ang = (2 * Math.acos(dot)) / dt; // rad/s
      const lin = Math.hypot(pp.x - prev.px, pp.y - prev.py, pp.z - prev.pz) / dt;
      if (ang > 1.6 || lin > 1.2) this.settleUntil = time + 0.2;
    }
    this._prevPose = { time, x: o.x, y: o.y, z: o.z, w: o.w, px: pp.x, py: pp.y, pz: pp.z };
    if (time < (this.settleUntil || 0)) return;
    if (time - this.lastSample < 1 / this.rate) return;
    this.lastSample = time;
    try {
      if (session.depthUsage === 'gpu-optimized') {
        const info = xr.getBinding().getDepthInformation(view);
        if (!info || !info.texture) return this.fail();
        this.readGPU(info);
        this.mode = 'gpu';
      } else {
        const info = frame.getDepthInformation(view);
        if (!info) return this.fail();
        this.readCPU(info);
        this.mode = 'cpu';
      }
    } catch (e) {
      this.renderer.resetState();
      return this.fail(e);
    }
    this.failures = 0;
    this.integrate(view);
  }

  fail(e) {
    if (++this.failures > 120) this.mode = 'unavailable';
    if (e && this.failures === 1) console.warn('[depthmap]', e);
  }

  integrate(view) {
    this.invProj.fromArray(view.projectionMatrix).invert();
    this.camM.fromArray(view.transform.matrix);
    this.camPos.setFromMatrixPosition(this.camM);
    const { depth, pts } = this;
    const v = this._v;
    // unproject every pixel to world space
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const d = depth[k];
        if (!d || d > MAX_RANGE) { pts[k * 3] = NaN; continue; }
        v.set(((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1, -1).applyMatrix4(this.invProj);
        v.multiplyScalar(d / -v.z).applyMatrix4(this.camM);
        pts[k * 3] = v.x; pts[k * 3 + 1] = v.y; pts[k * 3 + 2] = v.z;
      }
    }
    const a = this._a, b = this._b, n = this._n, dir = this._dir;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const k = j * N + i;
        if (Number.isNaN(pts[k * 3])) continue;
        const kx = k + 1, ky = k + N;
        v.set(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]);
        // surface normal from neighbouring samples, skipped across depth edges
        let haveN = false;
        if (!Number.isNaN(pts[kx * 3]) && !Number.isNaN(pts[ky * 3]) &&
            Math.abs(depth[kx] - depth[k]) < 0.08 * depth[k] && Math.abs(depth[ky] - depth[k]) < 0.08 * depth[k]) {
          a.set(pts[kx * 3], pts[kx * 3 + 1], pts[kx * 3 + 2]).sub(v);
          b.set(pts[ky * 3], pts[ky * 3 + 1], pts[ky * 3 + 2]).sub(v);
          n.crossVectors(a, b);
          const L = n.length();
          if (L > 1e-8) {
            n.divideScalar(L);
            dir.subVectors(this.camPos, v);
            if (n.dot(dir) < 0) n.negate(); // face the side the sensor saw
            haveN = true;
          }
        }
        const dk = depth[k];
        this.bounds.expandByPoint(v);
        // flying pixels: at a silhouette the sensor blends near and far into a point in mid-air.
        // Such a pixel still proves the space in front of it is empty, but it is not a surface.
        const tol = 0.06 * dk + 0.03;
        const edge = (i > 0 && Math.abs(depth[k - 1] - dk) > tol) || Math.abs(depth[k + 1] - dk) > tol ||
          (j > 0 && Math.abs(depth[k - N] - dk) > tol) || Math.abs(depth[k + N] - dk) > tol;
        if (edge) {
          if ((i + j) % 2 === 0) this.carveFree(v, 0.15);
          continue;
        }
        if (dk <= NEAR) {
          this.hit(v, haveN ? n : null);
          if ((i + j * 3) % 3 === 0) this.carve(v, dk);
        } else if (haveN) {
          this.hitCoarse(v, n);
        }
        if ((i + j) % 2 === 0) this.carveFree(v);
      }
    }
    // redraw the scan view twice a second, not on every sample: in a big house this was the lag
    const now = performance.now();
    if (this.inst.visible && now - (this._viewAt || 0) > 500) { this._viewAt = now; this.rebuildView(); }
  }

  hit(p, n) {
    const x = Math.floor(p.x / VOX), y = Math.floor(p.y / VOX), z = Math.floor(p.z / VOX);
    const kk = key(x, y, z);
    let c = this.vox.get(kk);
    if (!c) {
      c = { h: 0, nx: 0, ny: 0, nz: 0, x, y, z, explained: false };
      if (this.explain) c.explained = this.explain((x + 0.5) * VOX, (y + 0.5) * VOX, (z + 0.5) * VOX);
      this.vox.set(kk, c);
    }
    const was = c.h >= OCC;
    c.h = Math.min(MAX_H, c.h + 1);
    if (!was && c.h >= OCC) this.solid++;
    if (n) { c.nx += n.x; c.ny += n.y; c.nz += n.z; }
  }

  hitCoarse(p, n) {
    const x = Math.floor(p.x / COARSE), y = Math.floor(p.y / COARSE), z = Math.floor(p.z / COARSE);
    const kk = key(x, y, z);
    let c = this.coarse.get(kk);
    if (!c) { c = { w: 0, sx: 0, sy: 0, sz: 0, nx: 0, ny: 0, nz: 0 }; this.coarse.set(kk, c); }
    c.w++; c.sx += p.x; c.sy += p.y; c.sz += p.z; c.nx += n.x; c.ny += n.y; c.nz += n.z;
  }

  // coarse free-space memory: where have sensor rays actually passed through?
  carveFree(p, short = 0) {
    const dir = this._dir.subVectors(p, this.camPos);
    const dist = dir.length();
    const steps = Math.floor((dist - COARSE * 2 - short) / COARSE);
    if (steps <= 0) return;
    dir.multiplyScalar(1 / dist);
    let lastKey = -1;
    for (let s = 1; s < steps; s++) {
      const t = s * COARSE;
      const kk = key(
        Math.floor((this.camPos.x + dir.x * t) / COARSE),
        Math.floor((this.camPos.y + dir.y * t) / COARSE),
        Math.floor((this.camPos.z + dir.z * t) / COARSE),
      );
      if (kk === lastKey) continue;
      lastKey = kk;
      this.free.set(kk, Math.min(255, (this.free.get(kk) || 0) + 1));
    }
  }

  freeCount(x, y, z) {
    return this.free.get(key(Math.floor(x / COARSE), Math.floor(y / COARSE), Math.floor(z / COARSE))) || 0;
  }

  isSeenFree(x, y, z) {
    return (this.free.get(key(Math.floor(x / COARSE), Math.floor(y / COARSE), Math.floor(z / COARSE))) || 0) >= 3;
  }

  // walk from the eye toward the measured point; anything in between is empty space
  carve(p, dist) {
    const dir = this._dir.subVectors(p, this.camPos);
    const steps = Math.floor((dist - VOX * 2.5) / VOX);
    if (steps <= 0) return;
    dir.multiplyScalar(1 / dist);
    let lastKey = -1;
    for (let s = 2; s < steps; s++) {
      const t = s * VOX;
      const x = Math.floor((this.camPos.x + dir.x * t) / VOX);
      const y = Math.floor((this.camPos.y + dir.y * t) / VOX);
      const z = Math.floor((this.camPos.z + dir.z * t) / VOX);
      const kk = key(x, y, z);
      if (kk === lastKey) continue;
      lastKey = kk;
      const c = this.vox.get(kk);
      if (!c) continue;
      const was = c.h >= OCC;
      c.h -= 1;
      if (was && c.h < OCC) this.solid--;
      if (c.h <= 0) this.vox.delete(kk);
    }
  }

  // ---------- collision ----------
  // contact(normal, penetration) for the surface nearest the sphere, using the stored normals
  collide(pos, r, contact) {
    const reach = r + VOX * 0.5;
    const x0 = Math.floor((pos.x - reach) / VOX), x1 = Math.floor((pos.x + reach) / VOX);
    const y0 = Math.floor((pos.y - reach) / VOX), y1 = Math.floor((pos.y + reach) / VOX);
    const z0 = Math.floor((pos.z - reach) / VOX), z1 = Math.floor((pos.z + reach) / VOX);
    let best = null, bestD = Infinity;
    let sx = 0, sy = 0, sz = 0;
    const n = this._n;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const c = this.vox.get(key(x, y, z));
      if (!c || c.h < OCC || c.explained) continue;
      const cx = (x + 0.5) * VOX, cy = (y + 0.5) * VOX, cz = (z + 0.5) * VOX;
      const d = Math.hypot(pos.x - cx, pos.y - cy, pos.z - cz);
      if (d > reach) continue;
      const w = 1 - d / reach + 0.05;
      const L = Math.hypot(c.nx, c.ny, c.nz);
      if (L > 1e-6) { sx += (c.nx / L) * w; sy += (c.ny / L) * w; sz += (c.nz / L) * w; }
      else { sx += ((pos.x - cx) / (d || 1)) * w; sy += ((pos.y - cy) / (d || 1)) * w; sz += ((pos.z - cz) / (d || 1)) * w; }
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return false;
    n.set(sx, sy, sz);
    if (n.lengthSq() < 1e-8) return false;
    n.normalize();
    const cx = (best.x + 0.5) * VOX, cy = (best.y + 0.5) * VOX, cz = (best.z + 0.5) * VOX;
    const along = (pos.x - cx) * n.x + (pos.y - cy) * n.y + (pos.z - cz) * n.z;
    const pen = Math.min(r, reach - along);
    if (pen <= 0) return false;
    contact(n, pen, 'depth');
    return true;
  }

  // ---------- view ----------
  setVisible(on, seconds = 0, now = 0) {
    this.show = on;
    this.showUntil = seconds ? now + seconds : 0;
    this.inst.visible = on;
    if (on) this.rebuildView();
  }

  tick(now) {
    if (this.showUntil && now > this.showUntil) { this.showUntil = 0; this.setVisible(false); }
  }

  rebuildView() {
    let i = 0;
    const m = this._m;
    const cx = this.camPos.x / VOX, cy = this.camPos.y / VOX, cz = this.camPos.z / VOX;
    const R2 = (VIEW_R / VOX) ** 2;
    for (const c of this.vox.values()) {
      if (c.h < OCC) continue;
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
      if (dx * dx + dy * dy + dz * dz > R2) continue;
      if (i >= VIEW_MAX) break;
      m.makeTranslation((c.x + 0.5) * VOX, (c.y + 0.5) * VOX, (c.z + 0.5) * VOX);
      this.inst.setMatrixAt(i++, m);
    }
    this.inst.count = i;
    this.inst.instanceMatrix.needsUpdate = true;
  }
}
