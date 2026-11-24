import { World, SessionMode, createSystem, XRPlane, XRMesh, SceneUnderstandingSystem } from '@iwsdk/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LAWS } from './laws.js';
import { makeGunCard } from './textures.js';
import { rebuildSurfaces, collideRoom, hasRoom, roomStats } from './collide.js';
import { FX, Trail } from './fx.js';
import { DepthMap } from './depthmap.js';
import { RoomModel } from './roommodel.js';
import { RoomStore, exportSaved, hasSaved } from './roomstore.js';
import { createGame } from './game/game.js';
import { fixAdditive } from './blend.js';
import { initAudio, updateListener, sfxFire, sfxImpact, sfxRewind, sfxClick, sfxVanish } from './audio.js';

export const ROOM = { killRadius: 14, killHeight: 7 };
const MAX_SHOTS = 70;
const MAX_AGE = 30;
const MUZZLE_SPEED = 9;
const GUN_MODEL = './models/scifi/scifi_assault_b.glb';
const GUN_LENGTH = 0.46; // metres, nose to stock

const world = await World.create(document.getElementById('scene-container'), {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      handTracking: true, planeDetection: true, meshDetection: true, anchors: true,
      depthSensing: { usage: 'gpu-optimized', format: 'float32' }, // feeds our own live room map
    },
    offer: 'always',
  },
  render: { camera: { position: [0, 1.6, 0.01], lookAt: [0, 1.2, -1.5] } },
  features: {
    grabbing: false,
    locomotion: false, // you walk around your real room
    sceneUnderstanding: { showWireFrame: false }, // walls, ceiling, furniture become colliders
  },
});

const audioState = {};
const enterBtn = document.getElementById('enter');
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    enterBtn.disabled = !ok;
    if (!ok) enterBtn.textContent = 'Passthrough AR not available here';
  });
} else {
  enterBtn.textContent = 'Passthrough AR not available here';
}
enterBtn.addEventListener('click', () => { initAudio(audioState); world.launchXR(); });
// the Quest browser can also start the session from its own UI; unlock audio on any gesture
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => initAudio(audioState), { once: true }));
world.renderer.xr.addEventListener('sessionstart', () => initAudio(audioState));

const scene = world.scene;
scene.background = null; // passthrough: your room is the backdrop

// image-based lighting so the glossy shots actually look glossy
{
  const pmrem = new THREE.PMREMGenerator(world.renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
}
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.8));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.0);
sun.position.set(2, 6, 3);
scene.add(sun);

const fx = new FX(scene);
const depthMap = new DepthMap(world.renderer, scene);
const room = new RoomModel(scene);
// scan phase: walk around while the depth map fills in, press A to bake it into walls + boxes
let scanPreview = 0, scanPlanes = 0;
const store = new RoomStore(world.renderer);
// 2D page: let the saved scan be downloaded (to send it in for a look)
const exportBtn = document.getElementById('export');
async function refreshExport() { if (exportBtn) exportBtn.hidden = !(await hasSaved()); }
refreshExport();
world.renderer.xr.addEventListener('sessionend', () => setTimeout(refreshExport, 500));
exportBtn?.addEventListener('click', async () => {
  const blob = await exportSaved();
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `room-scan-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
let storeBegun = false;
function resetRoom() {
  depthMap.reset();
  room.reset();
  scanPreview = 0;
  storeBegun = false;
  store.status = 'idle';
}
function rescan() {
  store.forget(); // the saved room was wrong or stale: start clean
  depthMap.reset();
  room.reset();
  scanPreview = 0;
  scanPlanes = 0;
  window.dispatchEvent(new CustomEvent('room-rescan'));
}
function bakeRoom(now) {
  room.bake(depthMap, now);
  depthMap.setVisible(false, 0, now);
  window.dispatchEvent(new CustomEvent('room-baked', { detail: room.counts })); // other modes can start now
  store.requestSave(room.serialize());
}
function loadSaved(time) {
  const hit = store.poll(time);
  if (!hit) return;
  room.setFrame(hit.matrix);
  room.load(hit.data, depthMap, time);
  depthMap.setVisible(false, 0, time);
  sfxClick(headPos, true);
  cardDirty = true;
  window.dispatchEvent(new CustomEvent('room-baked', { detail: room.counts }));
}
const scanning = () => depthMap.active && !room.baked && store.status !== 'looking';
world.renderer.xr.addEventListener('sessionend', resetRoom);

// ---------- gun ----------
const gun = new THREE.Group();
const muzzle = new THREE.Object3D();
gun.add(muzzle);
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 10, 32), new THREE.MeshPhysicalMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.2,
}));
const chamber = new THREE.Mesh(new THREE.SphereGeometry(0.013, 24, 16), new THREE.MeshPhysicalMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, clearcoat: 1, roughness: 0.1,
}));
const chamberHalo = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), glowMat);
chamber.add(chamberHalo);
gun.add(muzzleRing, chamber);

const { tex: cardTex, draw: drawCard } = makeGunCard();
const card = new THREE.Mesh(
  new THREE.PlaneGeometry(0.17, 0.0956),
  new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, depthTest: false }),
);
card.rotation.x = -0.45;
card.renderOrder = 20;
gun.add(card);

// fallback body until the model loads (or if it never does)
const fallback = new THREE.Mesh(
  new THREE.BoxGeometry(0.04, 0.05, 0.18),
  new THREE.MeshStandardMaterial({ color: 0x30343f, roughness: 0.5, metalness: 0.4 }),
);
fallback.position.set(0, -0.015, 0.0);
gun.add(fallback);
placeGunParts(new THREE.Box3(new THREE.Vector3(-0.02, -0.04, -0.09), new THREE.Vector3(0.02, 0.01, 0.09)));

function placeGunParts(box) {
  const size = box.getSize(new THREE.Vector3());
  const cx = (box.min.x + box.max.x) / 2;
  // muzzle on the front face, upper part (where these blasters keep the barrel)
  muzzle.position.set(cx, box.max.y - size.y * 0.32, box.min.z - 0.012);
  muzzleRing.position.set(cx, muzzle.position.y, box.min.z - 0.002);
  chamber.position.set(cx, box.max.y + 0.01, box.min.z + size.z * 0.45);
  card.position.set(0, box.max.y + 0.09, box.min.z + size.z * 0.62);
}

const accentMats = [];
new GLTFLoader().load(GUN_MODEL, (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.envMapIntensity = 1.2;
    if (m.metalness !== undefined) { m.metalness = Math.max(m.metalness, 0.35); m.roughness = Math.min(m.roughness ?? 1, 0.45); }
    // the orange trim becomes an energy strip in the loaded law's colour
    const hsl = {};
    m.color?.getHSL(hsl);
    if (hsl.s > 0.4 && hsl.h > 0.03 && hsl.h < 0.17 && !accentMats.includes(m)) {
      accentMats.push(m);
    }
  });
  // Quaternius guns point down +X; turn the barrel to -Z (where the controller aims)
  model.rotation.y = Math.PI / 2;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(GUN_LENGTH / (box.max.z - box.min.z));
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const len = box.max.z - box.min.z;
  // the pistol grip sits ~58% of the way back from the nose; put it in the hand, receiver just above
  model.position.set(-(box.min.x + box.max.x) / 2, -box.max.y + 0.035, -(box.min.z + len * 0.58) + 0.05);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model); // gun-local, since the model has no parent yet
  gun.remove(fallback);
  gun.add(model);
  placeGunParts(box);
  setMode(mode);
}, undefined, () => {});

let mode = 0;
let cardDirty = true;
let cardPulse = 0;
let lastStats = '';
function setMode(i) {
  mode = (i + LAWS.length) % LAWS.length;
  const c = new THREE.Color(LAWS[mode].color);
  muzzleRing.material.color.copy(c);
  muzzleRing.material.emissive.copy(c);
  chamber.material.color.copy(c);
  chamber.material.emissive.copy(c);
  glowMat.color.copy(c).multiplyScalar(0.35);
  for (const m of accentMats) { m.color.copy(c); m.emissive?.copy(c); if (m.emissiveIntensity !== undefined) m.emissiveIntensity = 1.4; }
  cardDirty = true;
  cardPulse = 1;
}
function statusLine() {
  const gs = game.status();
  if (gs) return gs;
  if (!world.renderer.xr.isPresenting) return 'trigger fire · A/B cycle · Y clear · stick-click: show room map';
  if (depthMap.mode === 'gpu' || depthMap.mode === 'cpu') {
    if (room.baked) {
      const c = room.counts;
      const ceil = room.ceilY !== undefined ? `ceiling ${(room.ceilY - room.floorY).toFixed(1)} m` : 'no ceiling';
      const saved = store.status === 'found' ? 'saved room' : store.status === 'saved' ? 'saved ✓' : store.status === 'saving' ? 'saving…' : `${c.wall} walls`;
      return `${saved} · ${ceil} · ${c.boxes} boxes · hold Y rescan`;
    }
    if (store.status === 'looking') return 'finding your saved room… (A = scan fresh)';
    return depthMap.active
      ? `SCANNING · ${Math.round(depthMap.solid / 100) / 10}k vox · ${room.counts.wall} walls · ${room.ceilY !== undefined ? 'ceiling ✓' : 'look up!'} · A = done`
      : 'SCANNING · look around the room';
  }
  if (depthMap.mode === 'waiting') return 'starting depth sensor…';
  if (!hasRoom()) return captureAsked ? 'still no room scan: check Settings > Privacy > Spatial data' : 'no room scan: click thumbstick to scan your room';
  return `room: ${roomStats.planes} surfaces · ${roomStats.meshes} meshes · stick-click to view`;
}

// ---------- shots ----------
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1);

export const bodies = [];

function removeBody(b, quiet = false) {
  if (!quiet) { fx.burst(b.pos, b.law.color, { count: 10, speed: 0.6, life: 0.4, gravity: 0 }); sfxVanish(b.pos); }
  scene.remove(b.obj, b.shadow);
  if (b.lineRef) { scene.remove(b.lineRef); b.lineRef.geometry.dispose(); }
  b.trail.dispose();
  b.obj.traverse((o) => { o.geometry?.dispose(); });
  b.shadow.material.dispose();
  const i = bodies.indexOf(b);
  if (i >= 0) bodies.splice(i, 1);
}

function clearAll() {
  const quiet = bodies.length > 12;
  for (const b of [...bodies]) removeBody(b, quiet);
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
  const trail = new Trail(scene, law.color);
  trail.reset(origin);
  const b = {
    law, obj: root, mat, shadow, trail,
    r: law.radius, m: law.mass ?? 1,
    pos: origin.clone(),
    vel: dir.clone().normalize().multiplyScalar(speed),
    angVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
    state: 'free', idle: 0, age: 0, data: {}, hits: 0,
  };
  bodies.push(b);
  law.onRelease?.(b, {});
  while (bodies.length > MAX_SHOTS) removeBody(bodies[0], true);
  return b;
}

// ---------- simulation ----------
const headPos = new THREE.Vector3();
const headFwd = new THREE.Vector3();
const headUp = new THREE.Vector3();
const handPos = [new THREE.Vector3(), new THREE.Vector3()];
const handOk = [false, false];
const muzzlePos = new THREE.Vector3();
const muzzleDir = new THREE.Vector3();
const contactPoint = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// One surface contact: push out, let the law decide the bounce, make it look and sound like something.
function contact(b, n, pen, ctx) {
  b.pos.addScaledVector(n, pen);
  if (n.y > 0.7) b.onFloor = true;
  if (n.y < -0.7) b.onCeiling = true;
  const vn = b.vel.dot(n);
  if (vn >= 0) return;
  const speed = -vn;
  if (b.law.surface) b.law.surface(b, n, vn, ctx);
  else b.vel.addScaledVector(n, -vn * (1 + (b.law.restitution ?? 0.6)));
  // settle instead of micro-bouncing forever on floors
  const vn2 = b.vel.dot(n);
  if (n.y > 0.7 && vn2 > 0 && vn2 < 0.25) b.vel.addScaledVector(n, -vn2);
  if (speed > 0.5) {
    b.hits++;
    contactPoint.copy(b.pos).addScaledVector(n, -b.r);
    const big = b.law.key === 'slowlight' || b.law.key === 'tide';
    fx.ripple(contactPoint, n, b.law.color, big ? 0.6 + speed * 0.05 : 0.18 + speed * 0.04, big ? 0.9 : 0.5);
    fx.burst(contactPoint, b.law.color, {
      count: Math.min(36, 6 + speed * 4), speed: 0.6 + speed * 0.25, normal: n, spread: 0.55, life: 0.5,
    });
    sfxImpact(b.law.key, contactPoint, speed);
    b.law.onHit?.(b, 'surface', ctx);
  }
}

let cbBody = null, cbCtx = null;
const cb = (n, pen) => contact(cbBody, n, pen, cbCtx); // one callback for every contact, instead of a closure per shot per substep
function collide(b, ctx) {
  b.onFloor = false;
  b.onCeiling = false;
  cbBody = b; cbCtx = ctx;
  // our live depth map wins; the headset's scan is the fallback
  const mapped = depthMap.active;
  if (room.baked) {
    room.collide(b.pos, b.r, cb); // inferred walls/floor/ceiling + furniture boxes
    depthMap.collide(b.pos, b.r, cb); // whatever the model doesn't explain (new clutter, people, odd shapes)
    collideRoom(b.pos, b.r, cb, true);
  } else if (mapped) {
    depthMap.collide(b.pos, b.r, cb); // furniture, clutter, people: anything the sensor has seen
    collideRoom(b.pos, b.r, cb, true); // plus the room's own walls/floor/ceiling, so nothing leaks out of unseen corners
  } else collideRoom(b.pos, b.r, cb);
  game.collide(b, cb); // gadgets on the course
  // safety net: the tracking floor, in case the map has holes
  if (b.state === 'free' && b.pos.y < b.r && ((!mapped && !hasRoom()) || b.pos.y < b.r - 0.03)) contact(b, UP, b.r - b.pos.y, ctx);
}

const tmpAcc = new THREE.Vector3();
// forces other shots exert (gravity well, repulsion). Shots never collide with each other.
function fieldsOn(b, out, ctx) {
  for (const o of bodies) {
    if (o === b || !o.law.field) continue;
    o.law.field(o, b, ctx, out);
  }
  game.fields(b, out); // gravity orbs, fans, black holes
  return out;
}

function pulse(side, strength, ms) {
  try {
    world.input.xr.gamepads[side]?.inputSource?.gamepad?.hapticActuators?.[0]?.pulse(strength, ms);
  } catch {}
}

let captureAsked = false;
let viewTime = 0;
function toggleRoomView() {
  if (room.baked) {
    const on = !room.viz.visible || room.vizUntil > 0;
    room.showViz(on, viewTime, 0);
    depthMap.setVisible(on, 0, viewTime);
    return;
  }
  if (depthMap.mode === 'gpu' || depthMap.mode === 'cpu') {
    depthMap.setVisible(!depthMap.show || depthMap.showUntil > 0, 0, viewTime);
    return;
  }
  const session = world.renderer.xr.getSession?.();
  if (session && !hasRoom() && typeof session.initiateRoomCapture === 'function') {
    captureAsked = true;
    session.initiateRoomCapture().catch(() => {});
    return;
  }
  const sys = world.getSystem(SceneUnderstandingSystem);
  if (sys) sys.config.showWireFrame.value = !sys.config.showWireFrame.value;
}

// shared by every law, every frame: nothing here is allocated in the loop
const ctx = {
  dt: 0, time: 0, headPos, headFwd, handPos, handOk, bodies, THREE, ROOM, scene,
  tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(), tmpC: new THREE.Vector3(), xAxis: new THREE.Vector3(1, 0, 0),
  fieldsOn: (b, out) => fieldsOn(b, out, ctx),
};
const sctx = { ...ctx }; // same, with dt = one substep

// The first time a material is drawn the GPU compiles its shader, which is a visible hitch.
// So on entering AR, draw one of everything, microscopic, for a few frames.
let warm = null, warmFrames = 0;
function warmUp() {
  if (warm) scene.remove(warm);
  warm = new THREE.Group();
  for (const law of LAWS) warm.add(law.make(THREE).root);
  game.warm(warm);
  fixAdditive(warm);
  warm.traverse((o) => { o.frustumCulled = false; });
  warm.scale.setScalar(0.001);
  warm.position.set(0, 1, -1);
  scene.add(warm);
  warmFrames = 5;
}
world.renderer.xr.addEventListener('sessionstart', warmUp);

let fireCooldown = 0;
let yHeld = 0;
const lastReplayDir = new Map();
class WeirdPhysicsSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  update(delta, time) {
    const dt = Math.min(delta, 1 / 30);
    if (warm && --warmFrames <= 0) { scene.remove(warm); warm = null; }
    // depth sampling costs a GPU readback and several ms: full rate while scanning, a trickle once the
    // room is baked, and none at all during a match or while anything is in flight
    depthMap.rate = !room.baked ? 8 : game.busy() || bodies.length ? 0 : 2;
    rebuildSurfaces(this.queries.planes.entities, this.queries.meshes.entities);
    viewTime = time;
    const before = depthMap.mode;
    depthMap.update(time);
    if (before === 'waiting' && (depthMap.mode === 'gpu' || depthMap.mode === 'cpu')) depthMap.setVisible(true, 8, time); // show the scan building
    depthMap.tick(time);
    room.tick(time);
    if (!storeBegun && world.renderer.xr.isPresenting) { storeBegun = true; store.begin(time); }
    store.tick();
    if (store.status === 'looking' && !room.baked) loadSaved(time);
    if (scanning()) {
      if (!depthMap.show) depthMap.setVisible(true, 0, time); // keep the voxels up while scanning
      if (time > scanPreview) { scanPlanes = room.preview(depthMap); scanPreview = time + Math.max(2, room.previewMs * 0.04); }
    }
    const player = world.player;
    player.head.getWorldPosition(headPos);
    player.head.getWorldDirection(headFwd).negate();
    headUp.set(0, 1, 0).applyQuaternion(player.head.getWorldQuaternion(tmpQ));
    updateListener(headPos, headFwd, headUp);

    ['left', 'right'].forEach((side, k) => {
      const g = player.gripSpaces[side];
      g.getWorldPosition(handPos[k]);
      handOk[k] = g.visible !== false && handPos[k].distanceToSquared(headPos) < 1.5 && handPos[k].y > 0.05;
    });

    // the gun lives in the right hand; -Z of the ray space is where you aim
    const gunSide = 'right';
    const raySpace = player.raySpaces[gunSide];
    if (gun.parent !== raySpace) raySpace.add(gun);

    const xr = world.input.xr;
    const pads = xr.gamepads;
    const roomReady = room.baked || depthMap.mode === 'unavailable';
    const flags = game.frame(dt, time, { headPos, headFwd, raySpace, ready: roomReady, presenting: world.renderer.xr.isPresenting });
    const bakeNow = depthMap.active && !room.baked && pads.right?.getButtonDown('a-button');
    if (bakeNow && store.status === 'looking') { store.status = 'none'; sfxClick(headPos, false); cardDirty = true; }
    else if (bakeNow) { bakeRoom(time); pulse(gunSide, 0.8, 60); sfxClick(headPos, true); cardDirty = true; }
    else if (!flags.cycle) { /* the game owns A/B right now */ }
    else if (pads.right?.getButtonDown('a-button') || pads.left?.getButtonDown('x-button')) { setMode(mode + 1); pulse(gunSide, 0.2, 20); sfxClick(headPos, true); }
    if (flags.cycle && pads.right?.getButtonDown('b-button')) { setMode(mode - 1); pulse(gunSide, 0.2, 20); sfxClick(headPos, false); }
    if (pads.left?.getButtonDown('y-button')) { if (flags.clear) clearAll(); yHeld = time; }
    if (yHeld && !pads.left?.getButtonPressed('y-button')) yHeld = 0;
    if (yHeld && time - yHeld > 1 && room.baked) { yHeld = 0; rescan(); pulse('left', 0.8, 80); sfxRewind(headPos); }
    if (pads.left?.getButtonDown('xr-standard-thumbstick') || pads.right?.getButtonDown('xr-standard-thumbstick')) toggleRoomView();

    let wantFire = false;
    fireCooldown -= dt;
    const gp = pads[gunSide];
    if (xr.isPrimary('hand', gunSide)) {
      if (xr.getSelectState(gunSide).start) wantFire = true;
    } else if (gp) {
      if (gp.getButtonDown('xr-standard-trigger')) { wantFire = true; fireCooldown = 0.35; }
      else if (gp.getButtonPressed('xr-standard-trigger') && fireCooldown <= 0) { wantFire = true; fireCooldown = 0.15; }
    }
    if (xr.isPrimary('hand', 'left') && xr.getSelectState('left').start) {
      if (depthMap.active && !room.baked) { if (store.status === 'looking') store.status = 'none'; else bakeRoom(time); }
      else setMode(mode + 1);
      sfxClick(headPos, true);
    }

    if (wantFire && flags.fire) {
      muzzle.getWorldPosition(muzzlePos);
      raySpace.getWorldDirection(muzzleDir).negate();
      game.onFire(fire(muzzlePos, muzzleDir));
      fx.burst(muzzlePos, LAWS[mode].color, { count: 14, speed: 1.4, normal: muzzleDir, spread: 0.35, life: 0.25, gravity: 0, drag: 6 });
      fx.ripple(muzzlePos, muzzleDir, LAWS[mode].color, 0.09, 0.18);
      sfxFire(LAWS[mode].key, muzzlePos);
      pulse(gunSide, 0.55, 35);
      gun.position.z = 0.03; // recoil
      gun.rotation.x = 0.12;
    }
    gun.position.z += (0 - gun.position.z) * Math.min(1, dt * 16);
    gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 12);

    // card + chamber life
    const st = statusLine();
    if (cardDirty || st !== lastStats) { drawCard(LAWS[mode], mode, LAWS.length, st); cardDirty = false; lastStats = st; }
    cardPulse = Math.max(0, cardPulse - dt * 3);
    card.scale.setScalar(1 + cardPulse * 0.12);
    chamber.rotation.y += dt * 2;
    chamberHalo.scale.setScalar(1 + Math.sin(time * 5) * 0.12 + cardPulse * 0.6);

    ctx.dt = dt; ctx.time = time; sctx.time = time;

    // 4 substeps: at 9 m/s and 72 fps a shot moves ~3 cm per substep, less than its radius,
    // so it can't tunnel through a wall
    const SUB = 4;
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const b of bodies) {
        const hb = h * game.timeScale(b); // time bubbles slow a shot's own clock
        sctx.dt = hb;
        if (b.state === 'free') {
          if (b.law.step) b.law.step(b, sctx);
          else {
            const a = fieldsOn(b, b.law.accel(b, sctx, tmpAcc.set(0, 0, 0)), sctx);
            b.vel.addScaledVector(a, hb);
            b.vel.multiplyScalar(1 - (b.law.drag ?? 0.02) * hb);
            b.pos.addScaledVector(b.vel, hb);
          }
          if (!b.law.kinematicNow?.(b)) {
            collide(b, sctx);
            if (b.onFloor || b.onCeiling) {
              const fr = 1 - Math.min(1, 1.6 * h);
              b.vel.x *= fr; b.vel.z *= fr;
              const sgn = b.onCeiling && !b.onFloor ? -1 : 1;
              b.angVel.set(b.vel.z * sgn, b.angVel.y * fr, -b.vel.x * sgn).divideScalar(b.r);
            }
          }
        } else if (b.law.stepState) {
          b.law.stepState(b, sctx);
        }
        game.postStep(b);
      }
    }

    for (const b of [...bodies]) {
      b.age += dt;
      // Palindrome: a whoosh every time it turns around
      if (b.state === 'replay') {
        const prev = lastReplayDir.get(b);
        if (prev !== undefined && prev !== b.data.dir) { sfxRewind(b.pos); fx.burst(b.pos, b.law.color, { count: 12, speed: 0.5, life: 0.4, gravity: 0 }); }
        lastReplayDir.set(b, b.data.dir);
      }
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
      const far = Math.hypot(b.pos.x - headPos.x, b.pos.z - headPos.z) > ROOM.killRadius || b.pos.y > ROOM.killHeight || b.pos.y < -3;
      const life = Math.min((b.law.lifetime ?? MAX_AGE) - b.age, (b.law.patience ?? 8) - b.idle);
      if (far || life <= 0 || b.kill || !Number.isFinite(b.pos.x + b.pos.y + b.pos.z)) { lastReplayDir.delete(b); removeBody(b, far || b.kill); continue; }
      // pop in, shrink out
      b.obj.scale.setScalar(Math.min(1, 0.3 + b.age * 8, Math.max(0.05, life)));
      b.obj.position.copy(b.pos);
      b.law.visual?.(b, ctx);
      b.trail.push(b.pos, Math.min(1, b.vel.length() / 3));
      const floorY = room.baked ? room.floorY : 0;
      const hgt = Math.max(0, b.pos.y - b.r - floorY);
      const sc = b.r * 2.6 * (1 + hgt * 0.35);
      b.shadow.position.set(b.pos.x, floorY + 0.003, b.pos.z);
      b.shadow.scale.set(sc, sc, sc);
      b.shadow.material.opacity = Math.max(0.05, 0.8 - hgt * 0.35);
    }
    fx.update(dt);
  }
}

fixAdditive(scene);
fixAdditive(gun);
const game = createGame({ world, scene, fx, bodies, clearAll, pulse });
setMode(0);
world.registerSystem(WeirdPhysicsSystem);
window.__weird = { game, fx, world, bodies, depthMap, room, store, exportSaved, bakeRoom, rescan, fire, setMode, clearAll, roomStats, accentMats, get mode() { return mode; } };
