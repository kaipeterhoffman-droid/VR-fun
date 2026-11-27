// Life: what is alive on the river besides the rider. A still world reads as a model of a place; these are what make
// it the place.
//
//   moths    round the canoe's lantern and round every lamp the keeper has left: never a circle, always correcting
//   midges   dancing columns over the slack water by the banks, which nobody sees until the lantern comes among them
//   bats     at blue hour over the landing and under the moon over the mere: a flicker against the sky
//   fish     rising: a ring on the water somewhere near, and the small sound of it
//   herons   two, standing in the shallows. Each lets the canoe come so near and no nearer, and goes down the river
//            ahead of it into the mist
//
// The first three are worked out in the shader from a seed and the clock (src/ifing/fx.js does the same for sparks),
// so that a thousand of them cost one drawing and no arithmetic. The herons are watched, and cost a little.
import * as THREE from 'three';
import { GLSL_FINISH, shared } from './paint.js';
import { Builder } from './build.js';
import { tube, lump } from './flora.js';
import { river } from './river.js';
import { rng, smooth } from './noise.js';
import { spot, TAU } from './kit.js';

const quad = () => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; };
function swarm(list, vert, frag, extra = {}) {
  const n = list.length, g = quad(), home = new Float32Array(n * 4), seed = new Float32Array(n * 4);
  list.forEach((m, i) => { home.set(m.home, i * 4); seed.set(m.seed, i * 4); });
  g.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.instanceCount = n;
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, ...extra }));
  mesh.frustumCulled = false; mesh.renderOrder = 32; mesh.userData.noMirror = true;
  return mesh;
}

// ------------------------------------------------------------------------------------------------ moths
const MOTH_VERT = /* glsl */`
  attribute vec4 aHome; attribute vec4 aSeed;                    // home: a place, and whether it is the canoe's lantern instead (1); seed: phase, size, speed, how wide it circles
  uniform float uTime; uniform vec3 uLanternPos;
  varying vec2 vP; varying float vLit; varying float vDist; varying float vY;
  void main() {
    float ph = aSeed.x * 6.2832, t = uTime * aSeed.z;
    float wide = smoothstep(0.8, 1.0, sin(t * 0.19 + ph * 5.0));                              // now and then one goes out into the dark, and comes back
    float ang = t * 2.1 + ph + 1.5 * sin(t * 0.83 + ph * 2.0) + 0.7 * sin(t * 2.9 + ph);
    float r = aSeed.w * (0.5 + 0.5 * sin(t * 0.61 + ph * 3.0)) + 0.045 + 0.03 * sin(t * 5.3 + ph) + wide * 0.45;
    vec3 p = mix(aHome.xyz, uLanternPos, aHome.w) + vec3(cos(ang) * r, 0.1 * sin(t * 1.3 + ph * 4.0) + 0.04 * sin(t * 4.1 + ph) + wide * 0.15, sin(ang) * r);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDist = length(mv.xyz); vY = p.y;
    float flap = abs(sin(uTime * (31.0 + 9.0 * aSeed.x) + ph));
    mv.xy += position.xy * vec2(aSeed.y * (0.3 + 0.7 * flap), aSeed.y * 0.62) * (1.0 + 0.02 * vDist);
    vP = position.xy; vLit = 1.0 / (1.0 + r * r * 14.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTH_FRAG = /* glsl */`
  ${GLSL_FINISH}
  varying vec2 vP; varying float vLit; varying float vDist; varying float vY;
  void main() {
    vec2 q = vec2(abs(vP.x), vP.y);
    float wing = 1.0 - smoothstep(0.7, 1.0, length((q - vec2(0.48, 0.08)) * vec2(2.0, 1.25)));
    float body = 1.0 - smoothstep(0.5, 1.0, length(q * vec2(7.0, 1.3)));
    float a = max(wing * 0.8, body);
    if (a < 0.02) discard;
    gl_FragColor = vec4(developAdd(vec3(1.0, 0.74, 0.42) * (a * vLit * 1.15 * (1.0 - fogAmount(abs(vY), vDist, 0.5)))), 1.0);
  }
`;
function moths(ctx) {
  const rnd = rng(6101), list = [];
  for (let k = 0; k < 9; k++) list.push({ home: [0, 0, 0, 1], seed: [rnd(), 0.02 + rnd() * 0.014, 0.7 + rnd() * 0.7, 0.14 + rnd() * 0.22] });
  for (const at of ctx.lamps) for (let k = 0; k < 5; k++) list.push({ home: [at.x, at.y, at.z, 0], seed: [rnd(), 0.03 + rnd() * 0.02, 0.7 + rnd() * 0.7, 0.25 + rnd() * 0.4] });
  ctx.world.add(swarm(list, MOTH_VERT, MOTH_FRAG, { blending: THREE.AdditiveBlending }), null, false);
}

// ------------------------------------------------------------------------------------------------ midges
const MIDGE_VERT = /* glsl */`
  attribute vec4 aHome; attribute vec4 aSeed;                    // home: the middle of its column, the column's height; seed: phase, size, speed, the column's width
  uniform float uTime; uniform vec3 uLanternPos, uLanternColor, uSkyLight; uniform float uLanternRadius;
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY;
  void main() {
    float ph = aSeed.x * 6.2832, ph2 = fract(aSeed.x * 7.13) * 6.2832, ph3 = fract(aSeed.x * 13.7) * 6.2832, t = uTime * aSeed.z;
    float rr = sqrt(fract(aSeed.x * 5.3)) * aSeed.w;
    vec3 p = aHome.xyz + vec3(cos(ph2) * rr, (fract(aSeed.x * 3.7) - 0.5) * aHome.w, sin(ph2) * rr);
    // a midge dances: up and down in its own place, fast, while the whole column leans about in the air
    p += vec3(sin(t * 2.3 + ph) * 0.07 + sin(t * 0.31 + ph2) * 0.16, abs(fract(t * 0.9 + aSeed.x) - 0.5) * 0.44 - 0.11 + sin(t * 3.7 + ph3) * 0.04, cos(t * 1.9 + ph3) * 0.07 + cos(t * 0.27 + ph) * 0.16);
    float la = 1.0 - smoothstep(0.0, uLanternRadius * 1.1, length(uLanternPos - p));
    vCol = uLanternColor * (la * la * 0.8) + uSkyLight * 0.22;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDist = length(mv.xyz); vY = p.y;
    mv.xy += position.xy * aSeed.y * (1.0 + 0.016 * vDist);
    vP = position.xy;
    gl_Position = projectionMatrix * mv;
  }
`;
const MIDGE_FRAG = /* glsl */`
  ${GLSL_FINISH}
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY;
  void main() {
    float r = dot(vP, vP); if (r > 1.0) discard;
    gl_FragColor = vec4(developAdd(vCol * ((1.0 - r) * (1.0 - fogAmount(abs(vY), vDist, 0.6)))), 1.0);
  }
`;
function midges(ctx) {
  const rnd = rng(6203), list = []; ctx.swarms = [];
  for (let s = 14; s < 1010; s += 17 + rnd() * 16) {
    if (s > 812 && s < 868) continue;                                                       // none under the root: nothing lives there
    const hw = river.halfWidth(s), side = rnd() < 0.5 ? -1 : 1, p = spot(s, side * (hw - 0.7 - rnd() * rnd() * hw * 0.7), 0.75 + rnd() * 0.5), wide = 0.3 + rnd() * 0.35, tall = 0.7 + rnd() * 0.7;
    ctx.swarms.push({ s: Math.round(s), x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) });
    for (let k = 0; k < 46; k++) list.push({ home: [p.x, p.y, p.z, tall], seed: [rnd(), 0.004 + rnd() * 0.002, 0.7 + rnd() * 0.6, wide] });
  }
  ctx.world.add(swarm(list, MIDGE_VERT, MIDGE_FRAG, { blending: THREE.AdditiveBlending }), null, false);
}

// ------------------------------------------------------------------------------------------------ bats
const BAT_VERT = /* glsl */`
  attribute vec4 aHome; attribute vec4 aSeed;                    // home: the middle of its beat, how far it ranges; seed: phase, half its span, speed
  uniform float uTime;
  varying vec2 vP; varying float vFlap; varying float vDist; varying vec3 vW;
  void main() {
    float ph = aSeed.x * 6.2832, t = uTime * aSeed.z;
    vec3 p = aHome.xyz + vec3(sin(t * 0.37 + ph) * cos(t * 0.11 + ph * 2.0), 0.0, cos(t * 0.29 + ph * 1.7) * sin(t * 0.13 + ph)) * aHome.w
      + vec3(sin(t * 1.9 + ph * 3.0) * 2.2, sin(t * 0.8 + ph) * 1.6 + sin(t * 2.7 + ph * 2.0) * 0.5, cos(t * 1.6 + ph) * 2.2);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDist = length(mv.xyz); vW = p;
    mv.xy += position.xy * aSeed.y;
    vP = position.xy; vFlap = sin(uTime * (46.0 + 16.0 * aSeed.x) + ph * 9.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const BAT_FRAG = /* glsl */`
  ${GLSL_FINISH}
  varying vec2 vP; varying float vFlap; varying float vDist; varying vec3 vW;
  void main() {
    float x = abs(vP.x), wrist = 0.16 + 0.42 * vFlap, tip = 0.7 * vFlap - 0.08;
    float top = x < 0.42 ? mix(0.1, wrist, x / 0.42) : mix(wrist, tip, (x - 0.42) / 0.58);       // the arm: shoulder, wrist, the long finger's end
    float web = (0.5 * pow(1.0 - x, 0.75) + 0.02) * (0.6 + 0.4 * abs(cos(x * 9.42)));          // the skin behind it, drawn in between the fingers
    float wing = step(vP.y, top) * step(top - web, vP.y) * step(x, 0.99);
    float body = 1.0 - step(1.0, length(vec2(x * 8.0, vP.y * 3.2)));
    if (max(wing, body) < 0.5) discard;
    vec3 V = normalize(vW - cameraPosition);
    float fog = fogAmount(vW.y, vDist, 1.0);
    vec4 o = develop(mix(vec3(0.006, 0.007, 0.011), fogTint(V, vW.y), fog), 1.0);
    gl_FragColor = vec4(o.rgb, (1.0 - fog * 0.85) * (1.0 - uVeil));
  }
`;
function bats(ctx) {
  const rnd = rng(6307), list = [];
  for (const [s, d, y, far] of [[26, 2, 6, 9], [62, -3, 7, 11], [98, 1, 6, 9], [404, 0, 8, 12], [452, 4, 9, 14], [524, -2, 8, 13]]) {
    const p = spot(s, d, y);
    for (let k = 0; k < 4; k++) list.push({ home: [p.x, p.y + rnd() * 2, p.z, far * (0.7 + rnd() * 0.5)], seed: [rnd(), 0.15 + rnd() * 0.04, 0.8 + rnd() * 0.5, 0] });
  }
  ctx.world.add(swarm(list, BAT_VERT, BAT_FRAG), null, false);
}

// ------------------------------------------------------------------------------------------------ fish
/** A fish rises somewhere near: more often in still water, never under the root. */
function fish(ctx) {
  const rnd = rng(6401); let wait = 7, second = null;
  ctx.ticks.push((dt, time, boat, look) => {
    if (boat.frozen) return;
    if (second && time > second.at) { ctx.water.ripples.touch(second.x, second.z, 0.16, -0.3); second = null; }
    const still = look.to === 'arch' || look.from === 'arch' ? 0 : 1.6 - Math.min(1, boat.sound.flow || 0);        // (slack water is where they feed)
    wait -= dt * still; if (wait > 0) return;
    wait = 7 + rnd() * 16;
    const hw = river.halfWidth(boat.s), a = (rnd() - 0.5) * 3.6, r = 3.5 + rnd() * 6, d = Math.max(-(hw - 0.8), Math.min(hw - 0.8, boat.d + Math.sin(a) * r)), p = spot(boat.s + Math.cos(a) * r, d, 0);
    ctx.water.ripples.touch(p.x, p.z, 0.1, 0.6); second = { at: time + 0.28, x: p.x, z: p.z };
    ctx.hit('fish', p, 0.6 + 0.4 * rnd());
  });
}

// ------------------------------------------------------------------------------------------------ herons
const GREY = [0.4, 0.44, 0.5], PALE = [0.82, 0.83, 0.8], DARK = [0.075, 0.085, 0.11], BILL = [0.78, 0.6, 0.22], SHANK = [0.3, 0.29, 0.22];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Standing in a hand's depth of water: feet at the origin (which is the river's bed), looking along +z. */
function heronStanding() {
  const b = new Builder(900), body = new Builder(300);
  lump(body, 0, 0, 0, 0.085, 0.095, 0.2, 2, 5, 0.03, (x, y, z) => (z < -0.45 ? DARK : y > 0.1 && z > 0.2 ? DARK : GREY));          // the folded wing's dark tip, the dark shoulder
  tube(body, [[0, -0.01, -0.15, 0.06], [0, -0.03, -0.27, 0.04], [0, -0.05, -0.36, 0.012]], 5, (i) => (i ? DARK : GREY), null, true);
  b.add(body, new THREE.Matrix4().makeTranslation(0, 0.62, -0.03).multiply(new THREE.Matrix4().makeRotationX(-0.62)));
  for (const sx of [-1, 1]) tube(b, [[sx * 0.03, -0.02, 0.01, 0.009], [sx * 0.034, 0.27, -0.035, 0.008], [sx * 0.04, 0.5, 0.0, 0.013]], 4, () => SHANK, null, false);
  tube(b, [[0, 0.7, 0.07, 0.042], [0, 0.8, 0.165, 0.031], [0, 0.9, 0.16, 0.025], [0, 0.985, 0.075, 0.022], [0, 1.05, 0.055, 0.023], [0, 1.095, 0.085, 0.027]], 6, (i, j) => (j === 0 || j === 5 ? [0.5, 0.52, 0.55] : PALE), null, false);       // the neck, drawn back in an S
  lump(b, 0, 1.11, 0.115, 0.033, 0.032, 0.052, 1, 9, 0.02, (x, y, z) => (y > 0.2 && z < 0.5 ? DARK : PALE));                         // the head, a black stripe over the eye
  tube(b, [[0, 1.108, 0.155, 0.015], [0, 1.1, 0.26, 0.009], [0, 1.088, 0.35, 0.0015]], 4, () => BILL, null, true);                        // the bill, a dagger
  tube(b, [[0, 1.13, 0.085, 0.007], [0, 1.115, 0.0, 0.005], [0, 1.06, -0.085, 0.001]], 3, () => DARK, null, true);                        // the plume at the nape
  return b.build({ uv: false, bend: false });
}
/** In the air: the middle of the body at the origin, flying along +z. The neck is folded back on itself, as a heron carries it. */
function heronFlying() {
  const b = new Builder(600);
  lump(b, 0, 0, 0, 0.08, 0.075, 0.23, 2, 5, 0.03, (x, y) => (y > 0.3 ? GREY : [0.62, 0.64, 0.66]));
  lump(b, 0, -0.035, 0.24, 0.042, 0.055, 0.075, 1, 3, 0.02, () => PALE);                                                              // the bag of the folded neck
  tube(b, [[0, 0.01, 0.2, 0.035], [0, 0.04, 0.29, 0.026], [0, 0.045, 0.355, 0.024]], 5, () => PALE, null, false);
  lump(b, 0, 0.048, 0.375, 0.027, 0.027, 0.044, 1, 9, 0.02, (x, y) => (y > 0.25 ? DARK : PALE));
  tube(b, [[0, 0.045, 0.41, 0.013], [0, 0.04, 0.5, 0.008], [0, 0.034, 0.575, 0.0015]], 4, () => BILL, null, true);
  tube(b, [[0, 0.0, -0.2, 0.05], [0, 0.0, -0.3, 0.035], [0, -0.005, -0.37, 0.012]], 5, () => GREY, null, true);                           // the tail
  const legs = new Builder(120);                                                                                                    // hinged at the hip: they hang at first, then trail
  for (const sx of [-1, 1]) { tube(legs, [[sx * 0.022, 0, 0, 0.011], [sx * 0.022, -0.005, -0.25, 0.008], [sx * 0.022, 0.0, -0.5, 0.008]], 4, () => SHANK, null, false); tube(legs, [[sx * 0.022, 0.0, -0.5, 0.008], [sx * 0.03, -0.012, -0.6, 0.004]], 3, () => SHANK, null, true); }
  // a wing in two parts, each a sheet a little arched: grey before, the flight feathers dark behind and at the tip
  const sheet = (x0, x1, lead, trail, tipRound) => {
    const w = new Builder(60), nx = 5, rows = [];
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, x = x0 + (x1 - x0) * u, zl = lead(u), zt = trail(u), row = [];
      for (let j = 0; j <= 3; j++) { const v = j / 3, z = zl + (zt - zl) * v; row.push(w.vert(x, 0.022 * Math.sin(Math.PI * v) * (1 - 0.5 * u * tipRound), z, 0, 1, 0, v > 0.5 || (tipRound && u > 0.72) ? DARK : v > 0.3 ? [0.3, 0.33, 0.38] : GREY)); }
      rows.push(row);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < 3; j++) w.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
    return w.build({ uv: false, bend: false });
  };
  const arm = sheet(0, 0.37, (u) => 0.07 + 0.02 * u, (u) => -0.2 - 0.03 * u, 0);
  const hand = sheet(0, 0.52, (u) => 0.09 - 0.14 * u * u, (u) => -0.23 + 0.17 * u * u * u, 1);
  return { body: b.build({ uv: false, bend: false }), legs: legs.build({ uv: false, bend: false }), arm, hand };
}

function heron(ctx, geo, S, side, yaw0, seed) {
  const mat = ctx.mats.plain, hw = river.halfWidth(S), d0 = side * (hw - 1.5), P0 = spot(S, d0, -0.13), here = river.at(S, {});
  // standing: half turned to the water, half to the way the canoe comes from
  const stand = new THREE.Mesh(geo.stand, mat); stand.name = 'heron'; stand.position.copy(P0); stand.scale.setScalar(1.12);
  stand.rotation.y = Math.atan2(-side * here.rx * 0.8 - here.tx * 0.55, -side * here.rz * 0.8 - here.tz * 0.55) + yaw0;
  ctx.world.addMoving(stand);
  // flying
  const fly = new THREE.Group(); fly.name = 'heron, flying'; fly.rotation.order = 'YXZ'; fly.scale.setScalar(1.12); fly.visible = false;
  const legs = new THREE.Mesh(geo.legs, mat); legs.position.set(0, -0.03, -0.17);
  fly.add(new THREE.Mesh(geo.body, mat), legs);
  const wings = [1, -1].map((sx) => {
    const root = new THREE.Group(); root.position.set(sx * 0.07, 0.035, 0.07); root.scale.x = sx;
    const tip = new THREE.Group(); tip.position.set(0.37, 0, 0);
    root.add(new THREE.Mesh(geo.arm, mat), tip); tip.add(new THREE.Mesh(geo.hand, mat)); fly.add(root);
    return { root, tip, sx };
  });
  fly.traverse((o) => { o.frustumCulled = false; });
  ctx.world.addMoving(fly);
  // where she is, tau seconds after leaving the water: down the river and across it, climbing, into the mist
  const dT = -side * hw * 0.25, p = V3(), q = V3();
  const along = (tau) => 8.6 * (tau - 1.3 * (1 - Math.exp(-tau / 1.3)));
  const place = (tau, out) => { const L = along(tau), pt = river.point(S + L, d0 + (dT - d0) * smooth(0, 34, L), []); return out.set(pt[0], 0.5 + 3.4 * (1 - Math.exp(-tau / 2.4)) + 0.018 * L, pt[1]); };
  const pose = (tau) => {
    place(tau, p); place(tau + 0.06, q); q.sub(p);
    const ph = TAU * (2.35 * tau + 1.5 * (1 - Math.exp(-tau / 2))), deep = 0.62 + 0.3 * Math.exp(-tau / 1.5), up = Math.exp(-tau / 0.9);
    fly.position.copy(p); fly.position.y += 0.035 * Math.cos(ph);
    fly.rotation.set(-Math.atan2(q.y, Math.hypot(q.x, q.z)) - 0.5 * up, Math.atan2(q.x, q.z), 0);
    legs.rotation.x = 1.25 * Math.exp(-tau / 0.8);                                             // (hanging, then drawn up behind)
    for (const w of wings) { w.root.rotation.z = w.sx * (0.12 + deep * Math.sin(ph)); w.tip.rotation.z = -0.22 + 0.62 * Math.sin(ph - 1.1) - 0.25 * up; }
    fly.updateMatrixWorld(true);
    return ph;
  };
  const forced = parseFloat(new URLSearchParams(location.search).get('heron'));             // ?heron=1.2: both of them that long into their flight, to be looked at
  let state = 0, t0 = 0, beat = 0;                                                            // 0 standing, 1 has seen the lantern, 2 flying, 3 gone
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const near = Math.abs(boat.s - S) < 220;
    if (forced >= 0) { stand.visible = false; fly.visible = near; if (near) pose(forced); return; }
    if (state === 3) { if (boat.s < S - 150) { state = 0; stand.visible = true; } return; }
    if (state === 0) {
      stand.visible = near; if (!near || boat.frozen) return;
      stand.rotation.z = 0.012 * Math.sin(time * 0.5 + seed);                                  // she is alive: she shifts her weight
      if (Math.hypot(eye.x - P0.x, eye.z - P0.z) < 17) { state = 1; t0 = time; }
      return;
    }
    if (state === 1) {                                                                          // a moment's stillness, a crouch
      const u = (time - t0) / 0.45; stand.position.y = P0.y - 0.07 * smooth(0.3, 1, u);
      if (u >= 1) {
        state = 2; t0 = time; beat = 0; stand.visible = false; stand.position.y = P0.y; fly.visible = true;
        ctx.water.ripples.touch(P0.x, P0.z, 0.2, 0.7); ctx.hit('launch', P0);
      }
      return;
    }
    const tau = time - t0, ph = pose(tau), n = Math.floor(ph / TAU + 0.25);
    if (n > beat) { beat = n; if (n < 14) { ctx.hit('wing', fly.position, Math.exp(-n / 6)); if (n < 3) ctx.water.ripples.touch(fly.position.x, fly.position.z, 0.3, 0.25 / n); } }      // the first beats strike the water
    if (along(tau) > 150) { state = 3; fly.visible = false; }
  });
}

export function buildLife(ctx) {
  moths(ctx); midges(ctx); bats(ctx); fish(ctx);
  const f = heronFlying(), geo = { stand: heronStanding(), ...f };
  heron(ctx, geo, 92, 1, 0, 1); heron(ctx, geo, 428, 1, 0.3, 2);
}
