// Each law: how one object misbehaves.
// accel(b, ctx, out) -> acceleration for the default integrator (fields from others are added after).
// Optional: step (custom integrator), stepState (non-free custom states), field (force on others),
// onRelease/onGrab/onHit/onReset hooks, kinematicNow, effMass, applyImpulse, visual.

const G = 9.81;

function ball(THREE, color, r, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.35,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    flatShading: !!opts.flat,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  const geo = opts.geo ?? new THREE.SphereGeometry(r, 32, 20);
  return { mat, mesh: new THREE.Mesh(geo, mat) };
}

// A stripe so you can actually see it spin.
function striped(THREE, color, stripe, r) {
  const { mat, mesh } = ball(THREE, color, r);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(r * 1.0, r * 0.12, 8, 32),
    new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.5 }),
  );
  mesh.add(band);
  return { mat, mesh };
}

const gravity = (out) => out.set(0, -G, 0);

export const LAWS = [
  {
    key: 'newton',
    name: 'NEWTON',
    blurb: 'The control group. Falls down like a sucker.',
    color: '#d8d4cc',
    radius: 0.085,
    make(THREE) {
      const { mat, mesh } = striped(THREE, 0xd8d4cc, 0x555a66, this.radius);
      return { root: mesh, mat };
    },
    accel: (b, ctx, out) => gravity(out),
  },

  {
    key: 'rebel',
    name: 'REBEL',
    blurb: 'Gravity points up. Mind the ceiling.',
    color: '#ff6b4a',
    radius: 0.085,
    make(THREE) {
      const { mat, mesh } = striped(THREE, 0xff6b4a, 0x2a1210, this.radius);
      return { root: mesh, mat };
    },
    accel: (b, ctx, out) => out.set(0, G * 0.7, 0),
  },

  {
    key: 'runaway',
    name: 'RUNAWAY',
    blurb: 'Pushed away from you, harder the farther it gets.',
    color: '#f2c14e',
    radius: 0.085,
    patience: 5,
    make(THREE) {
      const { mat, mesh } = ball(THREE, 0xf2c14e, this.radius, {
        geo: new THREE.IcosahedronGeometry(this.radius, 1),
        flat: true,
      });
      return { root: mesh, mat };
    },
    accel(b, ctx, out) {
      const dx = b.pos.x - ctx.headPos.x;
      const dz = b.pos.z - ctx.headPos.z;
      return out.set(dx * 3, -G, dz * 3);
    },
  },

  {
    key: 'shy',
    name: 'SHY',
    blurb: 'Inverse-square repulsion from your hands and everything else.',
    color: '#7fe0c4',
    radius: 0.08,
    drag: 0.9,
    make(THREE) {
      const { mat, mesh } = ball(THREE, 0x7fe0c4, this.radius, { emissive: 0x0b2a22 });
      return { root: mesh, mat };
    },
    accel(b, ctx, out) {
      out.set(0, -G, 0);
      const v = ctx.tmpA;
      const push = (src, k) => {
        v.subVectors(b.pos, src);
        const d2 = Math.max(v.lengthSq(), 0.012);
        out.addScaledVector(v.normalize(), k / d2);
      };
      ctx.handPos.forEach((h, i) => ctx.handOk[i] && push(h, 0.3));
      push(ctx.headPos, 0.15);
      for (const o of ctx.bodies) if (o !== b) push(o.pos, 0.06);
      return out;
    },
    field(src, b, ctx, out) {
      const v = ctx.tmpC.subVectors(b.pos, src.pos);
      const d2 = Math.max(v.lengthSq(), 0.012);
      return out.addScaledVector(v.normalize(), 0.06 / d2);
    },
  },

  {
    key: 'palindrome',
    name: 'PALINDROME',
    blurb: 'Hits something, then plays its whole flight backwards. Forever.',
    color: '#e86bd8',
    radius: 0.085,
    make(THREE) {
      const { mat, mesh } = striped(THREE, 0xe86bd8, 0x2b0f28, this.radius);
      return { root: mesh, mat };
    },
    onRelease(b) {
      b.data.path = [b.pos.clone()];
    },
    accel(b, ctx, out) {
      const path = b.data.path;
      if (path && path.length < 2400) path.push(b.pos.clone());
      return gravity(out);
    },
    onHit(b) {
      const path = b.data.path;
      if (b.state !== 'free' || !path || path.length < 8 || path.length >= 2400) return;
      path.push(b.pos.clone());
      b.state = 'replay';
      b.data.idx = path.length - 1;
      b.data.dir = -1;
      b.data.wait = 0;
      b.vel.set(0, 0, 0);
    },
    stepState(b, ctx) {
      if (b.state !== 'replay') return;
      const d = b.data;
      if (d.wait > 0) { d.wait -= ctx.dt; return; }
      const prev = d.idx;
      d.idx += d.dir;
      if (d.idx <= 0 || d.idx >= d.path.length - 1) {
        d.idx = Math.max(0, Math.min(d.path.length - 1, d.idx));
        d.dir *= -1;
        d.wait = 0.35;
      }
      b.pos.copy(d.path[d.idx]);
      b.vel.subVectors(d.path[d.idx], d.path[prev]).divideScalar(ctx.dt || 1 / 180);
    },
    onReset(b) {
      if (b.data.line) b.data.line.visible = false;
    },
    visual(b, ctx) {
      const d = b.data;
      if (!d.line && ctx.scene) {
        const geo = new ctx.THREE.BufferGeometry();
        geo.setAttribute('position', new ctx.THREE.BufferAttribute(new Float32Array(2400 * 3), 3));
        d.line = new ctx.THREE.Line(geo, new ctx.THREE.LineBasicMaterial({ color: 0xe86bd8, transparent: true, opacity: 0.35 }));
        d.line.frustumCulled = false;
        ctx.scene.add(d.line);
        b.lineRef = d.line;
      }
      const line = d.line || b.lineRef;
      if (line) {
        if (b.state === 'replay' && d.path) {
          const arr = line.geometry.attributes.position.array;
          d.path.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
          line.geometry.setDrawRange(0, d.path.length);
          line.geometry.attributes.position.needsUpdate = true;
          line.visible = true;
        } else line.visible = false;
      }
      b.mat.emissive.setHex(b.state === 'replay' ? (d.dir < 0 ? 0x1d4a5a : 0x4a1d44) : 0x000000);
    },
  },

  {
    key: 'slowlight',
    name: 'SLOWLIGHT',
    blurb: 'Light speed here is 2.2 m/s. Mass grows with speed; it squashes and shifts color.',
    color: '#6fa8ff',
    radius: 0.085,
    c: 2.2,
    make(THREE) {
      const root = new THREE.Group();
      const { mat, mesh } = ball(THREE, 0xeeeeff, this.radius, { emissive: 0x111122 });
      root.add(mesh);
      root.userData.core = mesh;
      return { root, mat };
    },
    gamma(v, c) {
      const beta2 = Math.min(v.lengthSq() / (c * c), 0.9975);
      return 1 / Math.sqrt(1 - beta2);
    },
    effMass(b) {
      return b.m * this.gamma(b.vel, this.c);
    },
    // momentum p = gamma m v  ->  v = p / sqrt(m^2 + p^2/c^2)
    setFromMomentum(b, p) {
      const c = this.c;
      const denom = Math.sqrt(b.m * b.m + p.lengthSq() / (c * c));
      b.vel.copy(p).divideScalar(denom);
    },
    onRelease(b) {
      // relativistic velocity addition of your throw: rapidity, not speed
      const u = b.vel.length();
      if (u > 1e-4) b.vel.setLength(this.c * Math.tanh(u / this.c));
      b.obj.quaternion.identity();
      b.angVel.set(0, 0, 0);
    },
    applyImpulse(b, n, dvNewton) {
      const g = this.gamma(b.vel, this.c);
      const p = b.vel.clone().multiplyScalar(g * b.m).addScaledVector(n, dvNewton * g * b.m);
      this.setFromMomentum(b, p);
    },
    step(b, ctx) {
      const g = this.gamma(b.vel, this.c);
      const p = ctx.tmpA.copy(b.vel).multiplyScalar(g * b.m);
      const f = ctx.fieldsOn(b, ctx.tmpB.set(0, -G * b.m, 0));
      p.addScaledVector(f, ctx.dt);
      this.setFromMomentum(b, p);
      b.vel.multiplyScalar(1 - 0.02 * ctx.dt);
      b.pos.addScaledVector(b.vel, ctx.dt);
      b.angVel.set(0, 0, 0);
    },
    visual(b, ctx) {
      const core = b.obj.userData.core;
      const THREE = ctx.THREE;
      if (b.state === 'free') {
        b.obj.quaternion.identity();
        const sp = b.vel.length();
        const g = this.gamma(b.vel, this.c);
        if (sp > 0.05) {
          const dir = ctx.tmpA.copy(b.vel).divideScalar(sp);
          core.quaternion.setFromUnitVectors(ctx.xAxis, dir);
          core.scale.set(1 / g, 1, 1);
        } else core.scale.set(1, 1, 1);
        // doppler: approaching -> blue, receding -> red
        const toHead = ctx.tmpB.subVectors(ctx.headPos, b.pos).normalize();
        const beta = b.vel.dot(toHead) / this.c; // + approaching
        const hue = THREE.MathUtils.clamp(0.62 * (0.5 + beta * 0.6) + 0.0, 0, 0.75);
        b.mat.color.setHSL(hue, Math.min(1, Math.abs(beta) * 1.6), 0.55 + (1 - Math.min(1, Math.abs(beta))) * 0.25);
        b.mat.emissive.setHSL(hue, 1, Math.min(0.35, Math.abs(beta) * 0.4));
      } else {
        core.scale.set(1, 1, 1);
        core.quaternion.identity();
        b.mat.color.setHex(0xeeeeff);
        b.mat.emissive.setHex(0x111122);
      }
    },
  },

  {
    key: 'tide',
    name: 'TIDE',
    blurb: 'A gravity well with a wobble. Pulls, then shoves. Carry it around.',
    color: '#4a8cff',
    radius: 0.1,
    mass: 3,
    drag: 2.5,
    make(THREE) {
      const root = new THREE.Group();
      const { mat, mesh } = ball(THREE, 0x0a0f22, this.radius * 0.55, { emissive: 0x1a3cff, roughness: 0.2 });
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(this.radius, 32, 20),
        new THREE.MeshStandardMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false }),
      );
      root.add(mesh, shell);
      root.userData.core = mesh;
      root.userData.shell = shell;
      return { root, mat };
    },
    strength(t) {
      return 3.2 * Math.sin(t * 1.1) + 1.8 * Math.sin(t * 2.9 + 1.0) + 1.2;
    },
    accel: (b, ctx, out) => out.set(0, 0, 0),
    field(src, b, ctx, out) {
      const v = ctx.tmpC.subVectors(src.pos, b.pos);
      const d2 = v.lengthSq();
      if (d2 > 16 || d2 < 1e-6) return out;
      return out.addScaledVector(v.normalize(), (this.strength(ctx.time) * 2.0) / (d2 + 0.04));
    },
    visual(b, ctx) {
      const s = this.strength(ctx.time);
      const live = b.state === 'free' || b.state === 'held';
      const k = live ? s : 0;
      b.obj.userData.core.scale.setScalar(1 + Math.max(-0.4, k * 0.08));
      const shell = b.obj.userData.shell;
      shell.scale.setScalar(1 + Math.abs(k) * 0.06 + Math.sin(ctx.time * 9) * 0.02 * (live ? 1 : 0));
      if (!live) { shell.material.color.setHex(0x4a8cff); b.mat.emissive.setHex(0x1a3cff); return; }
      shell.material.color.setHex(k >= 0 ? 0x4a8cff : 0xff8a3c);
      b.mat.emissive.setHex(k >= 0 ? 0x1a3cff : 0xff5a10);
    },
  },

  {
    key: 'bashful',
    name: 'BASHFUL',
    blurb: 'Only moves when nobody is looking at it.',
    color: '#ff9ec7',
    radius: 0.085,
    make(THREE) {
      const { mat, mesh } = striped(THREE, 0xffb7d3, 0x5a2038, this.radius);
      return { root: mesh, mat };
    },
    watched(b, ctx) {
      const v = ctx.tmpB.subVectors(b.pos, ctx.headPos);
      const d = v.length();
      if (d < 0.25) return false;
      return v.divideScalar(d).dot(ctx.headFwd) > Math.cos((32 * Math.PI) / 180);
    },
    kinematicNow(b) { return !!b.data.frozen; },
    step(b, ctx) {
      b.data.frozen = this.watched(b, ctx);
      if (b.data.frozen) return; // keeps its velocity for later, the creep
      const a = ctx.fieldsOn(b, ctx.tmpA.set(0, -G, 0));
      b.vel.addScaledVector(a, ctx.dt);
      b.pos.addScaledVector(b.vel, ctx.dt);
    },
    visual(b) {
      const frozen = b.state === 'free' && b.data.frozen;
      b.mat.emissive.setHex(frozen ? 0x7a1840 : 0x000000);
      if (frozen) b.angVel.set(0, 0, 0);
    },
  },

  {
    key: 'contrarian',
    name: 'CONTRARIAN',
    blurb: 'Negative inertia. Throw it away and it comes at you.',
    color: '#9be15d',
    radius: 0.085,
    make(THREE) {
      const { mat, mesh } = ball(THREE, 0x9be15d, this.radius, {
        geo: new THREE.OctahedronGeometry(this.radius * 1.15, 0),
        flat: true,
      });
      return { root: mesh, mat };
    },
    onRelease(b) {
      b.vel.negate();
      b.angVel.negate();
    },
    accel: (b, ctx, out) => gravity(out),
  },

  {
    key: 'cyclotron',
    name: 'CYCLOTRON',
    blurb: 'Charged, in a vertical magnetic field. Throw flat and it comes back around.',
    color: '#b48cff',
    radius: 0.085,
    drag: 0.05,
    make(THREE) {
      const { mat, mesh } = striped(THREE, 0xb48cff, 0x22183a, this.radius);
      return { root: mesh, mat };
    },
    accel(b, ctx, out) {
      const w = 3.0; // qB/m, rad/s
      // a = w (v x up)
      return out.set(-b.vel.z * w, -G, b.vel.x * w);
    },
  },
];
