// The world's two halves, and what is shown of each.
//
// THE MIRROR. A headset draws every picture twice already (once for each eye); drawing the scene a third and fourth
// time into a texture for the water to reflect is the one thing it cannot spare. So the reflection here is not a
// picture of the world: it is the world, built a second time upside down under the water (`mirror`, a group scaled
// by -1 in height), and the water's surface is a sheet of dark glass laid over it. Each eye then sees a true
// reflection, with true depth, for the price of drawing some things twice; the copies share their geometry and
// their places with the originals. Whatever is put only in the mirror exists only in the water: that is how the
// river keeps what the land has lost (src/ifing/moments.js).
//
// SECTIONS. The river is cut into 40 m sections. Everything that stands still belongs to one, and only the sections
// that the air lets the rider see are in the scene at all.
import * as THREE from 'three';
import { mirrorOf } from './paint.js';
import { LENGTH } from './river.js';

export const SECTION = 40;
export const S_MIN = -160;                                   // the bay behind the landing
export const SECTIONS = Math.ceil((LENGTH + 240 - S_MIN) / SECTION);

export class World {
  constructor(scene) {
    this.scene = scene;
    this.direct = new THREE.Group(); this.direct.name = 'direct';
    this.mirror = new THREE.Group(); this.mirror.name = 'mirror'; this.mirror.scale.y = -1;
    scene.add(this.direct, this.mirror);
    this.sections = [];
    for (let i = 0; i < SECTIONS; i++) {
      const d = new THREE.Group(), m = new THREE.Group();
      d.visible = m.visible = false; d.name = 'section ' + i;
      this.direct.add(d); this.mirror.add(m);
      this.sections.push({ index: i, direct: d, mirror: m, s0: S_MIN + i * SECTION, s1: S_MIN + (i + 1) * SECTION, near: [], far: [] });
    }
    this.followers = [];       // copies in the mirror of things that move
    this.detail = 1;           // 1 = everything; the governor lowers it on a headset that cannot keep up
    this.mirrorOn = true;
    this.nearRange = 80;       // metres ahead within which a section is drawn in full
  }

  sectionAt(s) { return this.sections[Math.max(0, Math.min(SECTIONS - 1, Math.floor((s - S_MIN) / SECTION)))]; }

  /**
   * Put a thing that stands still into the world, in the section at s (or always shown, with s = null).
   * mirror: true (as it is), false (not in the water), 'only' (in the water and nowhere else),
   *         or an object: a different thing to show in the water in its place (a lighter copy, or a memory).
   */
  add(obj, s = null, mirror = true) {
    const sec = s === null ? null : this.sectionAt(s);
    if (mirror !== 'only') (sec ? sec.direct : this.direct).add(obj);
    if (mirror) {
      const src = mirror === true || mirror === 'only' ? obj : mirror;
      if (mirror === 'only') { obj.updateMatrixWorld(true); }
      const twin = this.twinOf(src);
      (sec ? sec.mirror : this.mirror).add(twin);
      return twin;
    }
    return null;
  }

  /** The upside-down copy of an object and everything under it: same geometry, same places, the water's paint. */
  twinOf(src) {
    const make = (o) => {
      let t;
      if (o.isInstancedMesh) {
        t = new THREE.InstancedMesh(o.geometry, mirrorOf(o.material), o.count);
        t.instanceMatrix = o.instanceMatrix; if (o.instanceColor) t.instanceColor = o.instanceColor;
        t.count = o.count;
        if (o.boundingSphere) t.boundingSphere = o.boundingSphere.clone();
      } else if (o.isMesh) t = new THREE.Mesh(o.geometry, mirrorOf(o.material));
      else if (o.isPoints) t = new THREE.Points(o.geometry, mirrorOf(o.material));
      else t = new THREE.Group();
      t.position.copy(o.position); t.quaternion.copy(o.quaternion); t.scale.copy(o.scale);
      t.renderOrder = o.userData.mirrorOrder ?? o.renderOrder; t.frustumCulled = o.frustumCulled; t.visible = o.visible;
      t.userData.src = o;
      for (const c of o.children) if (!c.userData.noMirror) t.add(make(c));
      return t;
    };
    return make(src);
  }

  /** A thing that moves (the boat, a bird): its copy in the water is made to follow it every frame. */
  addMoving(obj, parent = null) {
    (parent || this.direct).add(obj);
    const twin = this.twinOf(obj);
    this.mirror.add(twin);
    const pairs = [];
    const walk = (t) => { t.matrixAutoUpdate = false; pairs.push(t); for (const c of t.children) walk(c); };
    walk(twin);
    this.followers.push({ twin, pairs });
    return twin;
  }

  /** Before each frame: show the sections the air lets through, and bring the moving copies to their originals. */
  update(s, ahead, behind) {
    const lo = s - behind, hi = s + ahead;
    for (const sec of this.sections) {
      const on = sec.s1 > lo && sec.s0 < hi;
      sec.direct.visible = on;
      sec.mirror.visible = on && this.mirrorOn && sec.s1 > lo + 10 && sec.s0 < s + ahead * 0.85;
      if (!on) continue;
      // close sections show their full detail; far ones a lighter copy of themselves
      const close = sec.s1 > s - this.nearRange * 0.6 && sec.s0 < s + this.nearRange;
      for (const o of sec.near) o.visible = close;
      for (const o of sec.far) o.visible = !close;
    }
    this.mirror.visible = this.mirrorOn;
    for (const f of this.followers) for (const t of f.pairs) {
      const src = t.userData.src;
      t.visible = src.visible;
      if (t === f.twin) { src.updateWorldMatrix(true, false); t.matrix.copy(src.matrixWorld); } else t.matrix.copy(src.matrix);
      if (t.isInstancedMesh) t.count = src.count;
    }
  }
}
