import { World, SessionMode, createSystem, XRPlane, XRMesh } from '@iwsdk/core';
import * as THREE from 'three';
import { LAWS } from './laws.js';
import { makeLabelTexture } from './textures.js';

// ---------- room ----------
// No walls in passthrough: only the real floor (y = 0) bounces things. Shots die past these bounds.
export const ROOM = { half: 1e6, height: 1e6, killRadius: 12, killHeight: 6 };
const MAX_SHOTS = 80;
const MAX_AGE = 30;
const MUZZLE_SPEED = 9;

const world = await World.create(document.getElementById('scene-container'), {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: { handTracking: true, planeDetection: true, meshDetection: true, anchors: true },
    offer: 'always',
  },
  render: { camera: { position: [0, 1.6, 0.01], lookAt: [0, 1.2, -1.5] } },
  features: {
    grabbing: false,
    locomotion: false, // you walk around your real room
    sceneUnderstanding: { showWireFrame: false }, // walls, ceiling, furniture become colliders
  },
});

const enterBtn = document.getElementById('enter');
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    enterBtn.disabled = !ok;
    if (!ok) enterBtn.textContent = 'Passthrough AR not available here';
  });
} else {
  enterBtn.textContent = 'Passthrough AR not available here';
}
enterBtn.addEventListener('click', () => world.launchXR());

const scene = world.scene;
scene.background = null; // passthrough: your room is the backdrop

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.2);
sun.position.set(2, 6, 3);
scene.add(sun);

// ---------- gun ----------
const labelTex = LAWS.map((l) => makeLabelTexture(l.name, l.blurb, l.color));
const gun = new THREE.Group();
const gunDark = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.5, metalness: 0.4 });
const gunAccent = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.3 });
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.15), gunDark);
  body.position.set(0, 0, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.045), gunDark);
  grip.position.set(0, -0.06, 0.07);
  grip.rotation.x = -0.35;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.14, 16), gunDark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.008, -0.11);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.005, 8, 24), gunAccent);
  ring.position.set(0, 0.008, -0.18);
  const chamber = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 12), gunAccent);
  chamber.position.set(0, 0.035, 0.02);
  gun.add(body, grip, barrel, ring, chamber);
}
// grip pose is roughly the controller handle; nudge so the barrel follows the pointing ray
gun.position.set(0, -0.01, 0.03);
const muzzle = new THREE.Object3D();
muzzle.position.set(0, 0.008, -0.2);
gun.add(muzzle);
const modeCard = new THREE.Mesh(
  new THREE.PlaneGeometry(0.16, 0.08),
  new THREE.MeshBasicMaterial({ map: labelTex[0], transparent: true, depthTest: false }),
);
modeCard.position.set(0, 0.09, 0.03);
modeCard.rotation.x = -0.5;
modeCard.renderOrder = 10;
gun.add(modeCard);

let gunSide = 'right';
let mode = 0;
function setMode(i) {
  mode = (i + LAWS.length) % LAWS.length;
  const c = new THREE.Color(LAWS[mode].color);
  gunAccent.color.copy(c);
  gunAccent.emissive.copy(c).multiplyScalar(0.45);
  modeCard.material.map = labelTex[mode];
  modeCard.material.needsUpdate = true;
  cardFlash = 1.2;
}
let cardFlash = 0;

// ---------- projectiles ----------
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

function removeBody(b) {
  scene.remove(b.obj, b.shadow);
  if (b.lineRef) { scene.remove(b.lineRef); b.lineRef.geometry.dispose(); }
  b.obj.traverse((o) => { o.geometry?.dispose(); });
  b.shadow.material.dispose();
  const i = bodies.indexOf(b);
  if (i >= 0) bodies.splice(i, 1);
}

function clearAll() {
  while (bodies.length) removeBody(bodies[0]);
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function fire(origin, dir, lawIndex = mode, speed = MUZZLE_SPEED) {
  const law = LAWS[lawIndex];
  const { root, mat } = law.make(THREE);
  root.position.copy(origin);
  scene.add(root);
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const b = {
    law, obj: root, mat, shadow,
    r: law.radius, m: law.mass ?? 1,
    pos: origin.clone(),
    vel: dir.clone().normalize().multiplyScalar(speed),
    angVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
    state: 'free', idle: 0, age: 0, data: {},
  };
  bodies.push(b);
  law.onRelease?.(b, {});
  while (bodies.length > MAX_SHOTS) removeBody(bodies[0]);
  return b;
}

// ---------- simulation ----------
const headPos = new THREE.Vector3();
const headFwd = new THREE.Vector3();
const handPos = [new THREE.Vector3(), new THREE.Vector3()];
const handOk = [false, false];
const muzzlePos = new THREE.Vector3();
const muzzleDir = new THREE.Vector3();

function collideStatic(b, onHit) {
  const { pos, vel, r } = b;
  const e = b.law.restitution ?? 0.6;
  let hit = false;
  if (pos.y - r < 0) {
    pos.y = r;
    if (vel.y < 0) {
      if (vel.y < -0.4) hit = 'floor';
      vel.y = -vel.y * e;
      if (Math.abs(vel.y) < 0.25) vel.y = 0;
    }
    b.onFloor = true;
  } else b.onFloor = pos.y - r < 0.002;
  if (pos.y + r > ROOM.height) {
    pos.y = ROOM.height - r;
    if (vel.y > 0) {
      if (vel.y > 0.4) hit = 'ceiling';
      vel.y = -vel.y * e;
      if (Math.abs(vel.y) < 0.25) vel.y = 0;
    }
    b.onCeiling = true;
  } else b.onCeiling = ROOM.height - pos.y - r < 0.002;
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
  for (const c of colliders) {
    const h = c.type === 'plane' ? collidePlane(b, c, e) : collideBox(b, c, e);
    if (h) hit = h;
  }
  if (hit && onHit) onHit(hit);
}

// ---------- real-room colliders (from Quest scene understanding) ----------
const colliders = [];
const cLocal = new THREE.Vector3();
const cN = new THREE.Vector3();
function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function bounce(b, n, pen, e) {
  b.pos.addScaledVector(n, pen);
  const vn = b.vel.dot(n);
  if (vn < 0) {
    b.vel.addScaledVector(n, -(1 + e) * vn);
    if (n.y > 0.7) b.onFloor = true;
    if (n.y < -0.7) b.onCeiling = true;
    return vn < -0.4;
  }
  if (n.y > 0.7) b.onFloor = true;
  return false;
}
function collidePlane(b, c, e) {
  cLocal.copy(b.pos).applyMatrix4(c.inv);
  if (Math.abs(cLocal.y) >= b.r) return false;
  if (cLocal.x < c.minX || cLocal.x > c.maxX || cLocal.z < c.minZ || cLocal.z > c.maxZ) return false;
  if (!pointInPoly(c.poly, cLocal.x, cLocal.z)) return false;
  const side = cLocal.y >= 0 ? 1 : -1;
  cN.copy(c.normal).multiplyScalar(side);
  return bounce(b, cN, b.r - Math.abs(cLocal.y), e) ? 'wall' : false;
}
function collideBox(b, c, e) {
  cLocal.copy(b.pos).applyMatrix4(c.inv);
  const { min, max } = c;
  const qx = Math.min(Math.max(cLocal.x, min.x), max.x);
  const qy = Math.min(Math.max(cLocal.y, min.y), max.y);
  const qz = Math.min(Math.max(cLocal.z, min.z), max.z);
  let dx = cLocal.x - qx, dy = cLocal.y - qy, dz = cLocal.z - qz;
  let d = Math.hypot(dx, dy, dz);
  let pen;
  if (d > 1e-6) {
    if (d >= b.r) return false;
    pen = b.r - d; dx /= d; dy /= d; dz /= d;
  } else {
    // center inside the box: leave through the nearest face
    const opts = [
      [cLocal.x - min.x, -1, 0, 0], [max.x - cLocal.x, 1, 0, 0],
      [cLocal.y - min.y, 0, -1, 0], [max.y - cLocal.y, 0, 1, 0],
      [cLocal.z - min.z, 0, 0, -1], [max.z - cLocal.z, 0, 0, 1],
    ].sort((a, z) => a[0] - z[0])[0];
    pen = opts[0] + b.r; dx = opts[1]; dy = opts[2]; dz = opts[3];
  }
  cN.set(dx, dy, dz).applyQuaternion(c.quat);
  return bounce(b, cN, pen, e) ? 'furniture' : false;
}
const _q = new THREE.Quaternion();
function rebuildColliders(planeEntities, meshEntities) {
  colliders.length = 0;
  for (const ent of planeEntities) {
    const obj = ent.object3D;
    const plane = ent.getValue(XRPlane, '_plane');
    if (!obj || !plane?.polygon?.length) continue;
    obj.updateWorldMatrix(true, false);
    let c = obj.userData.__col;
    if (!c || c.polySrc !== plane.polygon) {
      const poly = plane.polygon.map((p) => ({ x: p.x, z: p.z }));
      c = obj.userData.__col = {
        type: 'plane', polySrc: plane.polygon, poly,
        minX: Math.min(...poly.map((p) => p.x)), maxX: Math.max(...poly.map((p) => p.x)),
        minZ: Math.min(...poly.map((p) => p.z)), maxZ: Math.max(...poly.map((p) => p.z)),
        inv: new THREE.Matrix4(), normal: new THREE.Vector3(),
      };
    }
    c.inv.copy(obj.matrixWorld).invert();
    obj.getWorldQuaternion(_q);
    c.normal.set(0, 1, 0).applyQuaternion(_q);
    colliders.push(c);
  }
  for (const ent of meshEntities) {
    if (!ent.getValue(XRMesh, 'isBounded3D')) continue;
    const obj = ent.object3D;
    if (!obj) continue;
    obj.updateWorldMatrix(true, false);
    const mn = ent.getVectorView(XRMesh, 'min');
    const mx = ent.getVectorView(XRMesh, 'max');
    let c = obj.userData.__col;
    if (!c) c = obj.userData.__col = { type: 'box', min: new THREE.Vector3(), max: new THREE.Vector3(), inv: new THREE.Matrix4(), quat: new THREE.Quaternion() };
    c.min.set(mn[0], mn[1], mn[2]);
    c.max.set(mx[0], mx[1], mx[2]);
    c.inv.copy(obj.matrixWorld).invert();
    obj.getWorldQuaternion(c.quat);
    colliders.push(c);
  }
}

const tmpAcc = new THREE.Vector3();
// forces other objects exert (gravity well, repulsion). Objects never collide with each other.
function fieldsOn(b, out, ctx) {
  for (const o of bodies) {
    if (o === b || !o.law.field) continue;
    o.law.field(o, b, ctx, out);
  }
  return out;
}

function pulse(side, strength, ms) {
  try {
    world.input.xr.gamepads[side]?.inputSource?.gamepad?.hapticActuators?.[0]?.pulse(strength, ms);
  } catch {}
}

let fireCooldown = 0;
class WeirdPhysicsSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  update(delta, time) {
    const dt = Math.min(delta, 1 / 30);
    rebuildColliders(this.queries.planes.entities, this.queries.meshes.entities);
    const player = world.player;
    player.head.getWorldPosition(headPos);
    player.head.getWorldDirection(headFwd).negate();

    ['left', 'right'].forEach((side, k) => {
      const g = player.gripSpaces[side];
      g.getWorldPosition(handPos[k]);
      handOk[k] = g.visible !== false && handPos[k].distanceToSquared(headPos) < 1.5 && handPos[k].y > 0.05;
    });

    // keep the gun in the right hand (ray space: -Z points where you aim)
    const raySpace = player.raySpaces[gunSide];
    if (gun.parent !== raySpace) raySpace.add(gun);

    const xr = world.input.xr;
    const pads = xr.gamepads;
    const other = gunSide === 'right' ? 'left' : 'right';
    const gp = pads[gunSide];
    if (pads.right?.getButtonDown('a-button') || pads.left?.getButtonDown('x-button')) { setMode(mode + 1); pulse(gunSide, 0.2, 20); }
    if (pads.right?.getButtonDown('b-button')) { setMode(mode - 1); pulse(gunSide, 0.2, 20); }
    if (pads.left?.getButtonDown('y-button')) clearAll();

    let wantFire = false;
    fireCooldown -= dt;
    if (xr.isPrimary('hand', gunSide)) {
      if (xr.getSelectState(gunSide).start) wantFire = true;
    } else if (gp) {
      if (gp.getButtonDown('xr-standard-trigger')) { wantFire = true; fireCooldown = 0.35; }
      else if (gp.getButtonPressed?.('xr-standard-trigger') && fireCooldown <= 0) { wantFire = true; fireCooldown = 0.16; }
    }
    // bare-hand pinch with the off hand cycles modes
    if (xr.isPrimary('hand', other) && xr.getSelectState(other).start) setMode(mode + 1);

    if (wantFire) {
      muzzle.getWorldPosition(muzzlePos);
      raySpace.getWorldDirection(muzzleDir).negate();
      fire(muzzlePos, muzzleDir);
      pulse(gunSide, 0.5, 35);
      gun.position.z = 0.05; // recoil
    }
    gun.position.z += (0.03 - gun.position.z) * Math.min(1, dt * 18);

    cardFlash = Math.max(0, cardFlash - dt);
    modeCard.scale.setScalar(1 + cardFlash * 0.25);

    const ctx = {
      dt, time, headPos, headFwd, handPos, handOk, bodies, THREE, ROOM, scene,
      tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(), tmpC: new THREE.Vector3(), xAxis: new THREE.Vector3(1, 0, 0),
      fieldsOn: (b, out) => fieldsOn(b, out, ctx),
    };

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
        } else if (b.law.stepState) {
          b.law.stepState(b, sctx);
        }
      }
    }

    for (const b of [...bodies]) {
      b.age += dt;
      if (b.state === 'free') {
        if (b.vel.lengthSq() < 0.01 && !b.law.kinematicNow?.(b)) b.idle += dt;
        else b.idle = Math.max(0, b.idle - dt * 0.5);
        if (b.angVel.lengthSq() > 1e-6) {
          const w = b.angVel.length();
          tmpQ.setFromAxisAngle(tmpV.copy(b.angVel).divideScalar(w), w * dt);
          b.obj.quaternion.premultiply(tmpQ);
          b.angVel.multiplyScalar(1 - 0.3 * dt);
        }
      }
      const far = Math.hypot(b.pos.x - headPos.x, b.pos.z - headPos.z) > ROOM.killRadius || b.pos.y > ROOM.killHeight;
      const dead = far || b.age > (b.law.lifetime ?? MAX_AGE) || b.idle > (b.law.patience ?? 8) ||
        !Number.isFinite(b.pos.x + b.pos.y + b.pos.z);
      if (dead) { removeBody(b); continue; }
      // shrink away in the last second
      const left = Math.min((b.law.lifetime ?? MAX_AGE) - b.age, (b.law.patience ?? 8) - b.idle);
      b.obj.scale.setScalar(Math.min(1, Math.max(0.05, left)));
      b.obj.position.copy(b.pos);
      b.law.visual?.(b, ctx);
      const hgt = Math.max(0, b.pos.y - b.r);
      const sc = b.r * 2.6 * (1 + hgt * 0.35);
      b.shadow.position.set(b.pos.x, 0.003, b.pos.z);
      b.shadow.scale.set(sc, sc, sc);
      b.shadow.material.opacity = Math.max(0.08, 1 - hgt * 0.35);
    }
  }
}

setMode(0);
world.registerSystem(WeirdPhysicsSystem);
window.__weird = { world, bodies, fire, setMode, clearAll, colliders, get mode() { return mode; } };
