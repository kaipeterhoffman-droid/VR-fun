// Match ammunition. The sandbox keeps its ten broken laws; a match gets balls built around the course.
// Each one answers a kind of gadget and loses to another, and the good ones cost money, which is the
// same money you build with. Same shape as an entry in laws.js, plus:
//   cost        dollars per shot, charged when fired
//   speed       muzzle speed (default 9 m/s)
//   fieldScale  how hard orbs, fans, black holes and mines push it (1 = normal)
//   smash       breaks glass without slowing
//   phase       ignores the first solid gadget it reaches
//   shield      survives one thing that would have destroyed it
//   split       becomes three after a moment
//   bank        bonus for scoring off the real room (default 50)
import * as THREE from 'three';

const G = 9.81;
export const steer = new THREE.Vector3(); // set by the game every frame from the right stick

const _a = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: o.roughness ?? 0.3, metalness: o.metalness ?? 0.15,
    emissive: o.emissive ?? color, emissiveIntensity: o.glow ?? 0.25,
    transparent: !!o.opacity, opacity: o.opacity ?? 1, depthWrite: !o.opacity, flatShading: !!o.flat,
  });
}
const sphere = (r) => new THREE.SphereGeometry(r, 24, 16);
function banded(r, color, band) {
  const mat = std(color);
  const mesh = new THREE.Mesh(sphere(r), mat);
  mesh.add(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 8, 28), std(band, { metalness: 0.6, glow: 0.1 })));
  return { root: mesh, mat };
}
function bounce(b, n, vn, e, grip = 0.92) {
  b.vel.addScaledVector(n, -vn);
  b.vel.multiplyScalar(grip);
  b.vel.addScaledVector(n, -vn * e);
}
const gravity = (k = 1) => (b, ctx, out) => out.set(0, -G * k, 0);

export const BALLS = [
  {
    key: 'standard', name: 'STANDARD', cost: 0, color: '#e8e6e1', radius: 0.085,
    blurb: "Free. Honest arc, honest bounce.",
    make() { return banded(this.radius, 0xe8e6e1, 0x555a66); },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.62),
  },
  {
    key: 'bouncer', name: 'SUPERBALL', cost: 5, color: '#ff5fa2', radius: 0.08, bank: 150,
    blurb: "Keeps its speed off walls. Bank shots pay 150, not 50.",
    make() { return banded(this.radius, 0xff5fa2, 0xffffff); },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.93, 0.99),
  },
  {
    key: 'heavy', name: 'CANNONBALL', cost: 10, color: '#8d96a8', radius: 0.1, speed: 7.5, fieldScale: 0.2, smash: true, mass: 4,
    blurb: "Shrugs off orbs, fans and mines. Smashes glass. Slow, and it drops.",
    make() {
      const mat = std(0x4a505c, { metalness: 0.9, roughness: 0.45, glow: 0.05, flat: true });
      return { root: new THREE.Mesh(new THREE.IcosahedronGeometry(this.radius, 1), mat), mat };
    },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.22, 0.8),
  },
  {
    key: 'floater', name: 'FLOATER', cost: 10, color: '#9fe8ff', radius: 0.1, speed: 5.5, fieldScale: 2.2, drag: 0.25,
    blurb: "Quarter gravity, flies straight. Fields throw it twice as hard.",
    make() {
      const mat = std(0x9fe8ff, { opacity: 0.55, roughness: 0.05, glow: 0.35 });
      const root = new THREE.Mesh(sphere(this.radius), mat);
      root.add(new THREE.Mesh(sphere(this.radius * 0.35), std(0xffffff, { glow: 0.9 })));
      return { root, mat };
    },
    accel: gravity(0.25),
    surface: (b, n, vn) => bounce(b, n, vn, 0.5),
  },
  {
    key: 'curve', name: 'CURVEBALL', cost: 10, color: '#ffd24a', radius: 0.085,
    blurb: "Bends toward the gun's top. Held level it flies flat; rolled, it goes round.",
    make() {
      const mat = std(0xffd24a);
      const root = new THREE.Mesh(sphere(this.radius), mat);
      const half = new THREE.Mesh(new THREE.SphereGeometry(this.radius * 1.01, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x20232b, { glow: 0.02 }));
      root.add(half);
      return { root, mat };
    },
    // Magnus force: spin axis is fixed at launch (the gun's right-hand side), so the swerve is toward the gun's top
    accel(b, ctx, out) {
      out.set(0, -G, 0);
      const ax = b.data.axis;
      if (ax) out.addScaledVector(_a.crossVectors(ax, b.vel), 1.25); // at 9 m/s that is a little over 1 g
      return out;
    },
    surface(b, n, vn) { bounce(b, n, vn, 0.6); b.data.axis = null; }, // a bounce kills the spin
  },
  {
    key: 'shield', name: 'SHIELDED', cost: 15, color: '#59f0d0', radius: 0.085, shield: true,
    blurb: "Survives one laser or one antimatter round.",
    make() {
      const mat = std(0xdff9f3);
      const root = new THREE.Mesh(sphere(this.radius), mat);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(this.radius * 1.45, 1), new THREE.MeshBasicMaterial({ color: 0x59f0d0, wireframe: true, transparent: true, opacity: 0.8 }));
      root.add(shell);
      root.userData.shell = shell;
      return { root, mat };
    },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.62),
    visual(b) { b.obj.userData.shell.visible = !b.gx?.popped; },
  },
  {
    key: 'split', name: 'SCATTER', cost: 20, color: '#ff9a3c', radius: 0.07, split: true,
    blurb: "Splits in three mid-air. Any one scoring counts.",
    make() {
      const mat = std(0xff9a3c);
      const root = new THREE.Mesh(sphere(this.radius), mat);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(sphere(this.radius * 0.45), std(0xffe0b0, { glow: 0.5 }));
        m.position.set(Math.cos(i * 2.094) * this.radius * 0.8, Math.sin(i * 2.094) * this.radius * 0.8, 0);
        root.add(m);
      }
      return { root, mat };
    },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.6),
  },
  {
    key: 'ghost', name: 'PHASE', cost: 25, color: '#b48cff', radius: 0.085, phase: true,
    blurb: "Passes through the first solid gadget it meets. Solid after that.",
    make() {
      const mat = std(0xb48cff, { opacity: 0.4, glow: 0.6 });
      return { root: new THREE.Mesh(sphere(this.radius), mat), mat };
    },
    accel: gravity(),
    surface: (b, n, vn) => bounce(b, n, vn, 0.62),
    visual(b) { const solid = !!b.gx?.phased; b.mat.opacity = solid ? 1 : 0.4; b.mat.transparent = !solid; b.mat.depthWrite = solid; },
  },
  {
    key: 'guided', name: 'GUIDED', cost: 30, color: '#7dff7a', radius: 0.075, speed: 4.5, drag: 0.6, fieldScale: 1,
    blurb: "Steer with the right stick for 3 s. Slow: turrets love it.",
    FUEL: 3,
    make() {
      const mat = std(0x7dff7a);
      const root = new THREE.Group();
      const body = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(this.radius * 0.55, this.radius * 1.2, 4, 12), mat);
      hull.rotation.z = Math.PI / 2;
      body.add(hull);
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.006), std(0x20232b, { glow: 0.02 }));
        fin.position.x = -0.06;
        const h = new THREE.Group(); h.rotation.x = i * 2.094; fin.position.y = 0.04; h.add(fin); body.add(h);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0xcaffc8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.rotation.z = Math.PI / 2; flame.position.x = -0.14;
      body.add(flame);
      root.add(body);
      root.userData = { body, flame };
      return { root, mat };
    },
    accel(b, ctx, out) {
      const live = b.age < this.FUEL;
      out.set(0, live ? -G * 0.12 : -G, 0);
      if (live) out.addScaledVector(steer, 16);
      return out;
    },
    surface: (b, n, vn) => bounce(b, n, vn, 0.4),
    visual(b) {
      const u = b.obj.userData;
      b.obj.quaternion.identity();
      b.angVel.set(0, 0, 0);
      const sp = b.vel.length();
      if (sp > 0.05) u.body.quaternion.setFromUnitVectors(X, _a.copy(b.vel).divideScalar(sp));
      u.flame.visible = b.age < this.FUEL;
      u.flame.scale.x = 0.7 + Math.random() * 0.6;
    },
  },
];
for (const b of BALLS) b.note = b.cost ? `$${b.cost} a shot` : 'free';
