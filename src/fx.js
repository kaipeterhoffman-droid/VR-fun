// Particles, impact ripples and motion trails. All additive, all pooled, nothing allocated per frame.
import * as THREE from 'three';
import { fixAdditive } from './blend.js';

const MAX_P = 900;

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.82, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    // --- particles ---
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pVel = new Float32Array(MAX_P * 3);
    this.pBase = new Float32Array(MAX_P * 3);
    this.pLife = new Float32Array(MAX_P);
    this.pMax = new Float32Array(MAX_P);
    this.pDrag = new Float32Array(MAX_P);
    this.pGrav = new Float32Array(MAX_P);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.022, map: softDotTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);

    // --- ripples (rings that spread along the surface that was hit) ---
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    const ringTex = ringTexture();
    this.rings = [];
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
      }));
      m.visible = false;
      m.userData = { life: 0, max: 1, size: 0.3 };
      scene.add(m);
      this.rings.push(m);
    }
    this.ringNext = 0;
    fixAdditive(scene);
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1);
  }

  burst(pos, color, { count = 24, speed = 1.6, normal = null, spread = 1, life = 0.6, gravity = -3, drag = 2.5 } = {}) {
    const c = this._c.set(color);
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAX_P;
      const v = this._v.randomDirection();
      if (normal) {
        if (v.dot(normal) < 0) v.reflect(normal);
        v.lerp(normal, 1 - spread).normalize();
      }
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.pPos[k * 3] = pos.x; this.pPos[k * 3 + 1] = pos.y; this.pPos[k * 3 + 2] = pos.z;
      this.pVel[k * 3] = v.x * sp; this.pVel[k * 3 + 1] = v.y * sp; this.pVel[k * 3 + 2] = v.z * sp;
      const tint = 0.75 + Math.random() * 0.5;
      this.pBase[k * 3] = Math.min(1, c.r * tint + 0.15);
      this.pBase[k * 3 + 1] = Math.min(1, c.g * tint + 0.15);
      this.pBase[k * 3 + 2] = Math.min(1, c.b * tint + 0.15);
      this.pLife[k] = this.pMax[k] = life * (0.6 + Math.random() * 0.8);
      this.pDrag[k] = drag;
      this.pGrav[k] = gravity;
    }
  }

  ripple(pos, normal, color, size = 0.35, life = 0.6) {
    const m = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    m.position.copy(pos).addScaledVector(normal, 0.004);
    m.quaternion.setFromUnitVectors(this._z, normal);
    m.material.color.set(color);
    m.userData.life = m.userData.max = life;
    m.userData.size = size;
    m.scale.setScalar(0.01);
    m.visible = true;
  }

  update(dt) {
    for (let k = 0; k < MAX_P; k++) {
      if (this.pLife[k] <= 0) {
        if (this.pCol[k * 3] !== 0 || this.pCol[k * 3 + 1] !== 0 || this.pCol[k * 3 + 2] !== 0) {
          this.pCol[k * 3] = this.pCol[k * 3 + 1] = this.pCol[k * 3 + 2] = 0;
        }
        continue;
      }
      this.pLife[k] -= dt;
      const f = Math.max(0, this.pLife[k] / this.pMax[k]);
      const d = 1 - Math.min(1, this.pDrag[k] * dt);
      this.pVel[k * 3] *= d; this.pVel[k * 3 + 1] = this.pVel[k * 3 + 1] * d + this.pGrav[k] * dt; this.pVel[k * 3 + 2] *= d;
      this.pPos[k * 3] += this.pVel[k * 3] * dt;
      this.pPos[k * 3 + 1] += this.pVel[k * 3 + 1] * dt;
      this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
      const a = f * f;
      this.pCol[k * 3] = this.pBase[k * 3] * a;
      this.pCol[k * 3 + 1] = this.pBase[k * 3 + 1] * a;
      this.pCol[k * 3 + 2] = this.pBase[k * 3 + 2] * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { m.visible = false; continue; }
      const t = 1 - u.life / u.max;
      m.scale.setScalar(u.size * (0.15 + Math.sqrt(t)));
      m.material.opacity = (1 - t) * (1 - t);
    }
  }
}

// A fading ribbon-ish line behind each shot.
export class Trail {
  constructor(scene, color, n = 22) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.base = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.line.frustumCulled = false;
    this.filled = 0;
    this.scene = scene;
    fixAdditive(this.line);
    scene.add(this.line);
  }
  reset(p) {
    for (let i = 0; i < this.n; i++) { this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z; }
  }
  push(p, strength = 1) {
    this.pos.copyWithin(3, 0, (this.n - 1) * 3);
    this.pos[0] = p.x; this.pos[1] = p.y; this.pos[2] = p.z;
    for (let i = 0; i < this.n; i++) {
      const a = (1 - i / (this.n - 1)) ** 1.6 * 0.9 * strength;
      this.col[i * 3] = this.base.r * a; this.col[i * 3 + 1] = this.base.g * a; this.col[i * 3 + 2] = this.base.b * a;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.geometry.attributes.color.needsUpdate = true;
  }
  dispose() {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
