import {
  World,
  SessionMode,
  createSystem,
  createComponent,
  OneHandGrabbable,
  Grabbed,
  LocomotionEnvironment,
} from '@iwsdk/core';
import * as THREE from 'three';
import { LAWS } from './laws.js';
import { makeLabelTexture, makeGridTexture, makePanelTexture } from './textures.js';

// ---------- room ----------
export const ROOM = { half: 6, height: 4.5 };
const RING_R = 1.5;
const PED_R = 0.2;
const PED_H = 0.95;
const HOVER_Y = 1.18;
const SLOTS = LAWS.length + 1; // last slot is the reset button

const Weird = createComponent('Weird', {});

const world = await World.create(document.getElementById('scene-container'), {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { handTracking: true },
    offer: 'always',
  },
  render: { camera: { position: [0, 1.6, 0.01], lookAt: [0, 1.2, -1.5] } },
  features: {
    grabbing: { useHandPinchForGrab: true },
    locomotion: { enableJumping: false, initialPlayerPosition: [0, 0, 0] },
  },
});

const enterBtn = document.getElementById('enter');
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    enterBtn.disabled = !ok;
    if (!ok) enterBtn.textContent = 'VR not available here';
  });
} else {
  enterBtn.textContent = 'VR not available here';
}
enterBtn.addEventListener('click', () => world.launchXR());

const scene = world.scene;
scene.background = new THREE.Color(0x14161d);
scene.fog = new THREE.Fog(0x14161d, 9, 22);

scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2420, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
sun.position.set(2, 6, 3);
scene.add(sun);

// floor + walls + ceiling (walkable environment)
const env = new THREE.Group();
const S = ROOM.half * 2;
const floorTex = makeGridTexture('#23262f', '#3a3f4c', '#f2c14e');
floorTex.repeat.set(S / 2, S / 2);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(S, S),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
env.add(floor);

const wallTex = makeGridTexture('#1b1e26', '#2b2f3a', null);
wallTex.repeat.set(S / 2, ROOM.height / 2);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1, side: THREE.DoubleSide });
for (let i = 0; i < 4; i++) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(S, ROOM.height), wallMat);
  const a = (i * Math.PI) / 2;
  w.position.set(Math.sin(a) * ROOM.half, ROOM.height / 2, Math.cos(a) * ROOM.half);
  w.rotation.y = a + Math.PI;
  env.add(w);
}
const ceilTex = makeGridTexture('#16181f', '#252935', null);
ceilTex.repeat.set(S / 2, S / 2);
const ceil = new THREE.Mesh(
  new THREE.PlaneGeometry(S, S),
  new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 1 }),
);
ceil.rotation.x = Math.PI / 2;
ceil.position.y = ROOM.height;
env.add(ceil);
world.createTransformEntity(env).addComponent(LocomotionEnvironment);

// instruction panel on the far wall
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(3.2, 1.6),
  new THREE.MeshBasicMaterial({ map: makePanelTexture(), transparent: true }),
);
panel.position.set(0, 2.5, -ROOM.half + 0.02);
scene.add(panel);

// ---------- pedestals ----------
const pedestals = []; // {x, z} for collisions
const pedMat = new THREE.MeshStandardMaterial({ color: 0x2d313c, roughness: 0.6, metalness: 0.1 });
const pedGeo = new THREE.CylinderGeometry(PED_R, PED_R * 1.15, PED_H, 32);
function slotPos(i) {
  // slot 0 straight ahead (-z), going clockwise
  const a = Math.PI + (i / SLOTS) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R);
}
for (let i = 0; i < SLOTS; i++) {
  const p = slotPos(i);
  const ped = new THREE.Mesh(pedGeo, pedMat);
  ped.position.set(p.x, PED_H / 2, p.z);
  scene.add(ped);
  pedestals.push({ x: p.x, z: p.z });
}

// reset button on the last slot
const resetPos = slotPos(SLOTS - 1);
const resetBtn = new THREE.Mesh(
  new THREE.CylinderGeometry(0.11, 0.12, 0.06, 32),
  new THREE.MeshStandardMaterial({ color: 0xd9412b, emissive: 0x3a0b05, roughness: 0.4 }),
);
resetBtn.position.set(resetPos.x, PED_H + 0.03, resetPos.z);
scene.add(resetBtn);
addLabel(resetPos, 'RESET', 'press to send everything home', '#d9412b');

function addLabel(p, title, line, color) {
  const tex = makeLabelTexture(title, line, color);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.21),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  const dir = new THREE.Vector3(-p.x, 0, -p.z).normalize();
  m.position.set(p.x + dir.x * (PED_R + 0.012), 0.66, p.z + dir.z * (PED_R + 0.012));
  m.lookAt(0, 0.66, 0);
  scene.add(m);
}

// ---------- bodies ----------
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1);

export const bodies = [];
LAWS.forEach((law, i) => {
  const p = slotPos(i);
  const home = new THREE.Vector3(p.x, HOVER_Y, p.z);
  const { root, mat } = law.make(THREE);
  root.position.copy(home);
  const entity = world.createTransformEntity(root);
  entity.addComponent(OneHandGrabbable, { rotate: true, translate: true });
  entity.addComponent(Weird);

  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  addLabel(p, law.name, law.blurb, law.color);

  bodies.push({
    law,
    entity,
    obj: root,
    mat,
    shadow,
    r: law.radius,
    m: law.mass ?? 1,
    home,
    pos: home.clone(),
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
    state: 'hover', // hover | held | free | returning | (law-specific)
    idle: 0,
    phase: i * 0.7,
    hist: [],
    data: {},
  });
});

// ---------- simulation ----------
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const headPos = new THREE.Vector3();
const headFwd = new THREE.Vector3();
const handPos = [new THREE.Vector3(), new THREE.Vector3()];
const handOk = [false, false];
const tipPos = [new THREE.Vector3(), new THREE.Vector3()];

function sendHome(b) {
  if (b.state === 'held') return;
  b.state = 'returning';
  b.idle = 0;
  b.data = {};
  b.law.onReset?.(b);
}

let resetCooldown = 0;
function resetAll() {
  if (resetCooldown > 0) return;
  resetCooldown = 0.8;
  bodies.forEach(sendHome);
  resetBtn.position.y = PED_H + 0.01;
}

function collideStatic(b, onHit) {
  const { pos, vel, r } = b;
  const e = b.law.restitution ?? 0.6;
  let hit = false;
  // floor
  if (pos.y - r < 0) {
    pos.y = r;
    if (vel.y < 0) {
      if (vel.y < -0.4) hit = 'floor';
      vel.y = -vel.y * e;
      if (Math.abs(vel.y) < 0.25) vel.y = 0;
    }
    b.onFloor = true;
  } else b.onFloor = pos.y - r < 0.002;
  // ceiling
  if (pos.y + r > ROOM.height) {
    pos.y = ROOM.height - r;
    if (vel.y > 0) {
      if (vel.y > 0.4) hit = 'ceiling';
      vel.y = -vel.y * e;
      if (Math.abs(vel.y) < 0.25) vel.y = 0;
    }
    b.onCeiling = true;
  } else b.onCeiling = ROOM.height - pos.y - r < 0.002;
  // walls
  const lim = ROOM.half - r;
  for (const ax of ['x', 'z']) {
    if (pos[ax] > lim) {
      pos[ax] = lim;
      if (vel[ax] > 0) { if (vel[ax] > 0.4) hit = 'wall'; vel[ax] = -vel[ax] * e; }
    } else if (pos[ax] < -lim) {
      pos[ax] = -lim;
      if (vel[ax] < 0) { if (vel[ax] < -0.4) hit = 'wall'; vel[ax] = -vel[ax] * e; }
    }
  }
  // pedestals (vertical cylinders)
  for (const pd of pedestals) {
    const dx = pos.x - pd.x;
    const dz = pos.z - pd.z;
    const d = Math.hypot(dx, dz);
    if (d > PED_R + r || pos.y > PED_H + r) continue;
    let nx, ny, nz, pen;
    if (d < PED_R && pos.y > PED_H - 0.05) {
      nx = 0; ny = 1; nz = 0; pen = PED_H + r - pos.y;
    } else {
      const cy = Math.min(Math.max(pos.y, 0), PED_H);
      const k = d > 1e-6 ? Math.min(d, PED_R) / d : 0;
      const cx = pd.x + dx * k;
      const cz = pd.z + dz * k;
      tmpV.set(pos.x - cx, pos.y - cy, pos.z - cz);
      const L = tmpV.length();
      if (L >= r) continue;
      if (L < 1e-6) { tmpV.set(dx || 1, 0, dz); tmpV.normalize(); pen = r; }
      else { tmpV.divideScalar(L); pen = r - L; }
      nx = tmpV.x; ny = tmpV.y; nz = tmpV.z;
    }
    pos.x += nx * pen; pos.y += ny * pen; pos.z += nz * pen;
    const vn = vel.x * nx + vel.y * ny + vel.z * nz;
    if (vn < 0) {
      if (vn < -0.4) hit = 'pedestal';
      const j = -(1 + e) * vn;
      vel.x += j * nx; vel.y += j * ny; vel.z += j * nz;
    }
    if (ny > 0.7) b.onFloor = true;
  }
  if (hit && onHit) onHit(hit);
  return hit;
}

function kinematic(b) {
  return b.state !== 'free' || b.law.kinematicNow?.(b);
}

function collidePairs() {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const c = bodies[j];
      const ka = kinematic(a);
      const kc = kinematic(c);
      if (ka && kc) continue;
      tmpV.subVectors(c.pos, a.pos);
      const d = tmpV.length();
      const rr = a.r + c.r;
      if (d >= rr || d < 1e-6) continue;
      tmpV.divideScalar(d);
      const ma = ka ? Infinity : a.law.effMass?.(a) ?? a.m;
      const mc = kc ? Infinity : c.law.effMass?.(c) ?? c.m;
      const ia = ma === Infinity ? 0 : 1 / ma;
      const ic = mc === Infinity ? 0 : 1 / mc;
      const pen = rr - d;
      const sum = ia + ic;
      a.pos.addScaledVector(tmpV, (-pen * ia) / sum);
      c.pos.addScaledVector(tmpV, (pen * ic) / sum);
      const vrel = tmpV2.subVectors(c.vel, a.vel).dot(tmpV);
      if (vrel < 0) {
        const jimp = (-(1 + 0.8) * vrel) / sum;
        if (!ka) { a.law.applyImpulse ? a.law.applyImpulse(a, tmpV, -jimp * ia) : a.vel.addScaledVector(tmpV, -jimp * ia); }
        if (!kc) { c.law.applyImpulse ? c.law.applyImpulse(c, tmpV, jimp * ic) : c.vel.addScaledVector(tmpV, jimp * ic); }
        if (Math.abs(vrel) > 0.4) {
          if (!ka) a.law.onHit?.(a, 'body');
          if (!kc) c.law.onHit?.(c, 'body');
        }
      }
    }
  }
}

function releaseVelocity(b) {
  const h = b.hist;
  b.vel.set(0, 0, 0);
  b.angVel.set(0, 0, 0);
  if (h.length < 2) return;
  const last = h[h.length - 1];
  let first = h[0];
  for (const e of h) if (last.t - e.t <= 0.1) { first = e; break; }
  const dt = last.t - first.t;
  if (dt <= 1e-4) return;
  b.vel.subVectors(last.p, first.p).divideScalar(dt);
  if (b.vel.length() > 16) b.vel.setLength(16);
  tmpQ.copy(first.q).invert().premultiply(last.q);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(tmpQ.w)));
  if (ang > 1e-4) {
    const s = Math.sqrt(1 - tmpQ.w * tmpQ.w) || 1;
    b.angVel.set(tmpQ.x / s, tmpQ.y / s, tmpQ.z / s).multiplyScalar((Math.sign(tmpQ.w) * ang) / dt);
    if (b.angVel.length() > 25) b.angVel.setLength(25);
  }
}

const tmpAcc = new THREE.Vector3();
// forces that other objects exert (gravity well, repulsion) — sources must be armed: free or held
function fieldsOn(b, out, ctx) {
  for (const o of bodies) {
    if (o === b || !o.law.field) continue;
    if (o.state !== 'free' && o.state !== 'held' && o.state !== 'replay') continue;
    o.law.field(o, b, ctx, out);
  }
  return out;
}

class WeirdPhysicsSystem extends createSystem({ weird: { required: [Weird] } }) {
  update(delta, time) {
    const dt = Math.min(delta, 1 / 30);
    resetCooldown = Math.max(0, resetCooldown - dt);
    if (resetCooldown < 0.5) resetBtn.position.y = PED_H + 0.03;

    const player = world.player;
    player.head.getWorldPosition(headPos);
    player.head.getWorldDirection(headFwd).negate(); // camera looks down -z

    ['left', 'right'].forEach((side, k) => {
      const g = player.gripSpaces[side];
      const ray = player.raySpaces[side];
      g.getWorldPosition(handPos[k]);
      ray.getWorldPosition(tipPos[k]);
      handOk[k] = g.visible !== false && handPos[k].distanceToSquared(headPos) < 1.5 && handPos[k].y > 0.05;
      if (handOk[k] && (handPos[k].distanceTo(resetBtn.position) < 0.13 || tipPos[k].distanceTo(resetBtn.position) < 0.1)) resetAll();
    });
    const pads = world.input.xr.gamepads;
    if (pads.right?.getButtonDown('b-button') || pads.left?.getButtonDown('y-button')) resetAll();

    const ctx = {
      dt, time, headPos, headFwd, handPos, handOk, bodies, THREE, ROOM, scene,
      tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(), tmpC: new THREE.Vector3(), xAxis: new THREE.Vector3(1, 0, 0),
      fieldsOn: (b, out) => fieldsOn(b, out, ctx),
    };

    // grab bookkeeping
    for (const b of bodies) {
      const held = b.entity.hasComponent(Grabbed);
      if (held) {
        if (b.state !== 'held') { b.law.onGrab?.(b, ctx); b.hist.length = 0; }
        b.state = 'held';
        b.pos.copy(b.obj.position);
        b.hist.push({ t: time, p: b.obj.position.clone(), q: b.obj.quaternion.clone() });
        while (b.hist.length > 2 && time - b.hist[0].t > 0.15) b.hist.shift();
        // velocity estimate while held, so held objects can bat others around
        if (b.hist.length > 1) {
          const f = b.hist[0];
          const dtt = time - f.t;
          if (dtt > 1e-4) b.vel.subVectors(b.pos, f.p).divideScalar(dtt);
        }
      } else if (b.state === 'held') {
        releaseVelocity(b);
        b.state = 'free';
        b.idle = 0;
        b.data = {};
        b.law.onRelease?.(b, ctx);
      }
    }

    const SUB = 3;
    const h = dt / SUB;
    const sctx = { ...ctx, dt: h };
    for (let s = 0; s < SUB; s++) {
      for (const b of bodies) {
        if (b.state === 'free') {
          if (b.law.step) b.law.step(b, sctx);
          else {
            const a = fieldsOn(b, b.law.accel(b, sctx, tmpAcc.set(0, 0, 0)), sctx);
            b.vel.addScaledVector(a, h);
            b.vel.multiplyScalar(1 - (b.law.drag ?? 0.02) * h);
            b.pos.addScaledVector(b.vel, h);
          }
          if (!b.law.kinematicNow?.(b)) {
            collideStatic(b, (kind) => b.law.onHit?.(b, kind, sctx));
            if (b.onFloor || b.onCeiling) {
              const fr = 1 - Math.min(1, 1.8 * h);
              b.vel.x *= fr; b.vel.z *= fr;
              const sgn = b.onCeiling && !b.onFloor ? -1 : 1;
              b.angVel.set(b.vel.z * sgn, b.angVel.y * fr, -b.vel.x * sgn).divideScalar(b.r);
            }
          }
        } else if (b.state === 'returning') {
          tmpV.subVectors(b.home, b.pos);
          const d = tmpV.length();
          const step = Math.min(d, (0.6 + d * 2.2) * h);
          if (d < 0.01) { b.state = 'hover'; b.pos.copy(b.home); }
          else b.pos.addScaledVector(tmpV, step / d);
          b.vel.set(0, 0, 0);
        } else if (b.law.stepState) {
          b.law.stepState(b, sctx);
        }
      }
      collidePairs();
    }

    for (const b of bodies) {
      if (b.state === 'hover') {
        b.phase += dt;
        b.pos.set(b.home.x, b.home.y + Math.sin(b.phase * 1.6) * 0.025, b.home.z);
        b.obj.rotation.y += dt * 0.4;
      }
      if (b.state === 'free') {
        // boredom: wander home if left lying around far from the pedestal
        const slow = b.vel.lengthSq() < 0.01;
        if (slow && b.pos.distanceTo(b.home) > 0.4) b.idle += dt;
        else b.idle = Math.max(0, b.idle - dt * 0.5);
        if (b.idle > (b.law.patience ?? 9)) sendHome(b);
        if (!Number.isFinite(b.pos.x + b.pos.y + b.pos.z)) { b.pos.copy(b.home); sendHome(b); }
        if (b.angVel.lengthSq() > 1e-6) {
          const w = b.angVel.length();
          tmpQ.setFromAxisAngle(tmpV.copy(b.angVel).divideScalar(w), w * dt);
          b.obj.quaternion.premultiply(tmpQ);
          b.angVel.multiplyScalar(1 - 0.3 * dt);
        }
      }
      if (b.state !== 'held') b.obj.position.copy(b.pos);
      b.law.visual?.(b, ctx);

      // blob shadow
      const hgt = Math.max(0, b.pos.y - b.r);
      const sc = b.r * 2.6 * (1 + hgt * 0.35);
      b.shadow.position.set(b.pos.x, 0.003, b.pos.z);
      b.shadow.scale.set(sc, sc, sc);
      b.shadow.material.opacity = Math.max(0.08, 1 - hgt * 0.35);
    }
  }
}

world.registerSystem(WeirdPhysicsSystem);
window.__weird = { world, bodies, resetAll };
