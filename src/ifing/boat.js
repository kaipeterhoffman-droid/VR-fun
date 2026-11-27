// Boat: the canoe on the water, the paddler's seat in her, the lantern at her bow and the paddle that drives her.
//
// THE OARS lie one to a side in their keipar (carved hooks on the gunwales), and each is a lever through its hook:
// the hand has one end, the water the other. Nothing is scripted. A hand closes on an oar with the grip or the
// trigger and the oar goes wherever that hand puts it; each frame the blade's own movement through the water is
// measured, and the water pushes back on it by the square of its speed. The rower faces the way she goes, as the
// fishermen of the North did when they wanted to see their landing: dip the blades and PUSH and she goes forward,
// pull and she backs, row one side and she turns, hold a blade still in the water and it drags her round. Open the
// hand and the oar stays in its grommet and trails beside her; the river's current and her own keel bring her
// straight again, so a rider who only wants to look can let both go and still come to the well.
//
// THE SEAT. The rider's head is put 0.95 m above the water whatever chair they sit in (their height when they come
// aboard is taken as sitting height). The hull rocks; the rider's horizon never does.
import * as THREE from 'three';
import { makePaint, shared } from './paint.js';
import { woodSheet } from './art.js';
import { buildCanoe, buildLantern, buildOar, buildMitten, OAR } from './craft.js';
import { river, LENGTH } from './river.js';
import { track, clamp } from './noise.js';

export const EYE = 0.95;
// THE CURRENT. She floats down the whole river with nobody rowing: about walking pace between the set pieces, slower
// where there is something to look at, and still at the well. The current has a thread, the line the deepest water
// takes, and the water either side of it leans toward it; so a boat left to itself is carried round the giant's
// hand, between the gate's posts, along the stone ship and through the gap in the loom, and never into a bank.
const CURRENT = [[-40, 0.5], [0, 0.5], [40, 0.8], [150, 0.95], [262, 0.9], [286, 0.55], [318, 0.6], [340, 0.9], [366, 0.62], [400, 0.5], [440, 0.55], [560, 0.6], [600, 0.95], [700, 0.85], [728, 0.5], [790, 0.55], [808, 0.85], [880, 0.6], [960, 0.3], [1010, 0.0]];
const THREAD = [[-40, -1.5], [0, -1.5], [46, 0], [280, 0], [298, 2.5], [314, 2.5], [334, 0], [440, 0], [462, 2.6], [500, 2.6], [530, 0], [760, 0], [772, 1.2], [786, 1.2], [800, 0], [1060, 0]];
const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q1 = new THREE.Quaternion();
const lerp = (a, b, t) => a + (b - a) * t, ease = (q) => q * q * (3 - 2 * q);
const MITT = new THREE.Matrix4().makeRotationZ(Math.PI / 2);       // an empty hand: what it would hold stands upright in it, as a controller does
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Boat {
  constructor({ engine, world, water, glows }) {
    this.engine = engine; this.world = world; this.water = water;
    const wood = woodSheet();
    this.woodMat = makePaint({ map: wood, brush: 0, side: THREE.DoubleSide, inside: 1, clipBelow: true, wet: 0.06, rim: { color: '#ffffff', strength: 0.35, power: 3 } });
    this.lampMat = makePaint({ color: '#5a3a1c', emissive: '#ffae52', emissiveIntensity: 2.2, brush: 0, side: THREE.DoubleSide, inside: 1, vertexColors: true });
    const canoe = buildCanoe(-0.5), lan = buildLantern();
    this.canoe = canoe;
    this.group = new THREE.Group(); this.group.name = 'boat';
    this.hull = new THREE.Mesh(canoe.geometry, this.woodMat); this.hull.name = 'hull'; this.hull.frustumCulled = false;
    this.lantern = new THREE.Group(); this.lantern.position.fromArray(canoe.hook);
    const iron = new THREE.Mesh(lan.iron, this.woodMat), panes = new THREE.Mesh(lan.panes, this.lampMat); iron.frustumCulled = panes.frustumCulled = false;
    this.lantern.add(iron, panes); this.flameLocal = new THREE.Vector3().fromArray(lan.flame);
    this.hull.add(this.lantern); this.group.add(this.hull);
    world.addMoving(this.group);
    const oarGeo = buildOar();
    this.oars = [-1, 1].map((side) => {
      const mesh = new THREE.Mesh(oarGeo, this.woodMat); mesh.name = side < 0 ? 'port oar' : 'starboard oar'; mesh.frustumCulled = false; world.addMoving(mesh);
      const rest = new THREE.Vector3(side * 0.75, -0.245, 0.61).normalize();                  // trailing: out, a little aft, the blade lying on the water
      return { side, mesh, lock: new THREE.Vector3().fromArray(canoe.locks[side < 0 ? 0 : 1]), rest, dir: rest.clone(), len: 0.4, set: false,
        G: new THREE.Vector3(), A: new THREE.Vector3(), N: new THREE.Vector3(0, 1, 0), tip: new THREE.Vector3(),      // in the world: the hand's place on it, the way it runs, the blade's face, its tip
        hand: null, mode: 'rest', feather: 1, amp: 1,
        samples: [0.2, 0.55, 0.88].map((q) => ({ q, prev: new THREE.Vector3(), has: false, vel: new THREE.Vector3() })), wet: 0, dripClock: 0, inWater: 0, force: 0 };
    });
    this.woolMat = makePaint({ color: '#e6dcc6', brush: 0.34, brushScale: 7, side: THREE.DoubleSide, inside: 0.8, rim: { color: '#fff4dc', strength: 0.3, power: 3 } });

    this.flame = new THREE.Vector3(0, 0.5, 0);
    this.glow = glows.add({ position: this.flame, size: 0.3, color: new THREE.Color('#ffb054'), power: 1, flicker: 0.3 });
    this.lampColor = new THREE.Color();

    // where she is: place, heading, speed ahead, speed sideways, rate of turn; where on the river that is
    this.pos = new THREE.Vector2(); this.heading = 0; this.u = 0; this.w = 0; this.om = 0; this.s = 0; this.d = 0;
    this.roll = 0; this.pitch = 0; this.swing = new THREE.Vector4();      // the lantern's swing: angles (x, z) and their rates
    this.obstacles = [];                                                    // things standing in the water: { x, z, r }
    this.frozen = false; this.hold = 0;                                     // hold: 1 = the river lets her go no further
    this.seat = { x: 0, y: 1.15, z: 0, yaw: 0, set: false };
    this.view = { yaw: 0, pitch: 0 };                                       // looking about with the mouse, outside the headset
    this.sound = { swish: 0, splash: 0, bump: 0, speed: 0, flow: 0, hits: [] };      // what the ear should be told (src/ifing/audio.js): hits are [what, which oar, how hard], this frame's only
    this.stats = { strokes: 0, distance: 0 }; this.asked = [0, 0, 0];

    // the hands: a mitten for each, which closes on the oar of its own side
    const xr = engine.renderer.xr, mittGeo = buildMitten();
    this.hands = [0, 1].map((i) => {
      const grip = xr.getControllerGrip(i), h = { grip, on: false, live: false, source: null, side: i ? 1 : -1, pos: new THREE.Vector3(), squeeze: false, pinch: false, oar: null, near: false, buzz: 0 };
      grip.addEventListener('connected', (e) => { h.on = true; h.source = e.data; if (e.data && e.data.handedness === 'left') h.side = -1; else if (e.data && e.data.handedness === 'right') h.side = 1; });
      grip.addEventListener('disconnected', () => { h.on = false; h.source = null; h.squeeze = h.pinch = false; });
      grip.addEventListener('squeezestart', () => { h.squeeze = true; }); grip.addEventListener('squeezeend', () => { h.squeeze = false; });
      grip.addEventListener('selectstart', () => { h.pinch = true; }); grip.addEventListener('selectend', () => { h.pinch = false; });
      engine.rig.add(grip);
      h.mitt = new THREE.Mesh(mittGeo, this.woolMat); h.mitt.name = 'mitten'; h.mitt.frustumCulled = false; h.mitt.visible = false; h.mitt.matrixAutoUpdate = false; world.addMoving(h.mitt);
      return h;
    });
    this.stroke = { p: 0.6, count: 0 };
    this.keys = {};
    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    this.place(2, 0);
  }

  /** Put her on the river at s, d, lying along it, at rest. */
  place(s, d = 0, turn = 0) {
    const p = river.at(s, {});
    this.pos.set(p.x + p.rx * d, p.z + p.rz * d); this.heading = p.heading + turn; this.u = track(CURRENT, s) * 0.6; this.w = this.om = 0; this.s = s; this.d = d;      // (already on the current: she does not start from rest)
    for (const o of this.oars) { o.set = false; for (const sm of o.samples) sm.has = false; }
    this.sync(0, 0);
  }

  /** Take where the rider's head is now as the seat (called on coming aboard, and when they ask to be re-seated). */
  seatHere() {
    const cam = this.engine.camera; v1.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.seat.x = cam.position.x; this.seat.y = clamp(cam.position.y, 0.5, 1.9); this.seat.z = cam.position.z; this.seat.yaw = Math.atan2(-v1.x, -v1.z); this.seat.set = true;
  }

  get forward() { return v4.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  /** Does this hand mean to hold? The grip or the trigger of a controller, or the pinch of a bare hand. */
  closed(h) {
    const gp = h.source && h.source.gamepad; let on = h.squeeze || h.pinch;
    if (gp && gp.buttons) { const b0 = gp.buttons[0], b1 = gp.buttons[1]; on = (b0 && (b0.pressed || b0.value > 0.5)) || (b1 && (b1.pressed || b1.value > 0.5)) || (!gp.buttons.length && on); }
    return !!on;
  }
  pulse(h, strength, ms) {
    try { const gp = h.source && h.source.gamepad, a = gp && (gp.hapticActuators && gp.hapticActuators[0]); if (a && a.pulse) a.pulse(clamp(strength, 0, 1), ms); } catch { /* a controller without a motor */ }
  }

  // ---- where the oars are: in the hands that hold them, moved for the rider by the keys, or trailing in their grommets
  poseOars(dt, drive = 0, steer = 0, headingErr = 0) {
    const rig = this.engine.rig, vr = this.engine.presenting, hullM = this.hull.matrixWorld, inv = m4.copy(hullM).invert();
    for (const h of this.hands) {
      h.live = vr && h.on && h.grip.visible;
      if (h.live) h.pos.copy(h.grip.position).applyMatrix4(rig.matrixWorld);
      const o = this.oars[h.side < 0 ? 0 : 1], want = h.live && this.closed(h);
      if (h.oar && !want) { h.oar.hand = null; h.oar = null; }                                   // the hand opens: the oar is its own again
      if (dt > 0 && h.live && !h.oar && !o.hand && o.set) {
        // near enough to take: anywhere along the loom, from the handle to the keip
        v1.copy(o.lock).applyMatrix4(hullM).sub(o.G); const l2 = v1.lengthSq() || 1, q = clamp(v2.copy(h.pos).sub(o.G).dot(v1) / l2, -0.15, 0.8);
        const near = v2.copy(o.G).addScaledVector(v1, q).distanceTo(h.pos) < 0.3;
        if (near && !h.near) this.pulse(h, 0.25, 25);
        h.near = near;
        if (near && want) { h.oar = o; o.hand = h; h.near = false; this.pulse(h, 0.6, 40); for (const sm of o.samples) sm.has = false; }
      }
    }
    // a stroke made for the rider (keys, a thumbstick): the same oars in the same water, moved along a rower's path
    const scripted = Math.abs(drive) > 0.05, st = this.stroke, back = drive < 0;
    if (scripted && dt > 0) {
      st.p += dt * 0.6 * (0.55 + 0.45 * Math.abs(drive));
      if (st.p >= 1) { st.p -= 1; st.count++; }
      const need = clamp(steer * 1.2 + clamp(headingErr * 2, -1, 1), -1, 1) * (back ? -1 : 1);      // > 0: she should come round to the right, so the left oar works and the right one rests
      this.oars[0].amp += (clamp(1 + need * 1.4, 0, 1) - this.oars[0].amp) * Math.min(1, dt * 4); this.oars[1].amp += (clamp(1 - need * 1.4, 0, 1) - this.oars[1].amp) * Math.min(1, dt * 4);
    } else if (!scripted && dt > 0) st.p = 0.6;
    for (const o of this.oars) {
      const L = o.lock, sg = o.side; let k, feather = 0;
      const held = o.hand && o.hand.live;
      if (held || scripted) {
        // the hand's place, in her own frame
        if (held) v1.copy(o.hand.pos).applyMatrix4(inv);
        else {
          const a = o.amp, sw = 0.27 * Math.max(a, 0.15); let z, y;
          if (st.p < 0.45) { const q = st.p / 0.45, e = ease(q); z = back ? lerp(-sw, sw, e) : lerp(sw, -sw, e); y = a > 0.15 ? 0.03 + 0.13 * Math.min(1, q * 6) * Math.min(1, (1 - q) * 6) : -0.05; }
          else { const q = (st.p - 0.45) / 0.55, e = ease(q); z = back ? lerp(sw, -sw, e) : lerp(-sw, sw, e); y = -0.035 - 0.045 * Math.sin(Math.PI * q); feather = q > 0.08 && q < 0.92 ? 1 : 0; }
          if (a <= 0.15) feather = 1;
          v1.set(L.x - sg * 0.36, L.y + y, L.z + z);
        }
        // the oar runs from the hand through the keip. The hand may not cross the gunwale, nor lift the oar out of its hook
        if ((L.x - v1.x) * sg < 0.1) v1.x = L.x - sg * 0.1;
        v2.copy(L).sub(v1); const l = v2.length() || 1; v2.divideScalar(l);
        v2.y = clamp(v2.y, -0.82, 0.5); v2.normalize();
        k = held ? 1 - Math.exp(-dt * 45) : 1 - Math.exp(-dt * 16);
        if (!o.set || (held && o.mode !== 'held' && dt > 0)) k = Math.max(k, 0.5);
        o.dir.lerp(v2, k).normalize(); o.len += (clamp(l, 0.2, 0.8) - o.len) * k;
        o.mode = held ? 'held' : 'keys';
      } else {
        // let go: it settles back into trailing, the blade flat on the water and nodding with it
        k = o.set ? 1 - Math.exp(-dt * 3.2) : 1;
        v2.copy(o.rest); v2.y += 0.012 * Math.sin(shared.uTime.value * 1.3 + sg); v2.z += clamp(this.u, -1, 2) * 0.1; v2.normalize();
        o.dir.lerp(v2, k).normalize(); o.len += (0.4 - o.len) * k; feather = 1; o.mode = 'rest';
      }
      o.set = true;
      o.A.copy(o.dir).transformDirection(hullM); v1.copy(L).applyMatrix4(hullM); o.G.copy(v1).addScaledVector(o.A, -o.len); o.tip.copy(o.G).addScaledVector(o.A, OAR.length);
      // the blade stands square to the way she goes (so that a push drives her), or lies flat when it is carried or left
      o.feather += (feather - o.feather) * (dt > 0 ? Math.min(1, dt * 12) : 0); if (!this._posed) o.feather = feather;
      const f = v3.copy(this.forward).lerp(UP, o.feather); f.addScaledVector(o.A, -f.dot(o.A));
      if (f.lengthSq() < 0.01) f.copy(UP).addScaledVector(o.A, -UP.dot(o.A));
      o.N.copy(f).normalize();
    }
    this._posed = true;
  }

  /** dt: the frame; look: the reach's colours (for the lantern); input: { drive, steer } from keys or a thumbstick. */
  update(dt, time, look) {
    const snd = this.sound; snd.splash = 0; snd.hits.length = 0; snd.bump = Math.max(0, snd.bump - dt * 4);
    if (this.frozen) { this.sync(dt, time); this.light(look, time); return; }
    // ---- what is asked of her by keys or thumbstick
    let drive = 0, steer = 0; const K = this.keys;
    if (K.KeyW || K.ArrowUp) drive += 1; if (K.KeyS || K.ArrowDown) drive -= 1;
    if (K.KeyD || K.ArrowRight) steer += 1; if (K.KeyA || K.ArrowLeft) steer -= 1;
    for (const h of this.hands) {
      const gp = h.on && h.source && h.source.gamepad; if (!gp) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (Math.abs(ay) > 0.35) drive = clamp(drive - ay * 1.2, -1, 1); if (Math.abs(ax) > 0.35) steer = clamp(steer + ax, -1, 1);
      const press = gp.buttons[3] && gp.buttons[3].pressed; if (press && !h.wasPressed) this.seatHere(); h.wasPressed = press;
    }
    if (steer && !drive) drive = 0.7;
    drive *= 1 - this.hold;

    const here = river.at(clamp(this.s, 0, LENGTH), {});
    const fwd = this.forward.clone(), right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const err = wrap(here.heading - this.heading);                           // > 0: the river lies to her left
    this.asked = [drive, steer, -err]; this.poseOars(dt, drive, steer, -err);
    // ---- the water on the blades
    const cur = track(CURRENT, this.s) * (1 - this.hold), lean = clamp((track(THREAD, this.s) - this.d) * 0.24, -0.45, 0.45) * (1 - this.hold) * Math.min(1, cur * 3);
    const cx = here.tx * cur + here.rx * lean, cz = here.tz * cur + here.rz * lean;
    let Fx = 0, Fz = 0, tau = 0, subs = [0, 0], swish = 0;
    const px = this.pos.x + fwd.x * 0.5, pz = this.pos.y + fwd.z * 0.5, { length: Lo, blade: Lb } = OAR;
    for (let n = 0; n < 2; n++) {
      const o = this.oars[n]; let sub = 0, speed = 0, fo = 0;
      if (o.mode === 'rest') {
        // trailing: no work is done, but it marks the water as she moves
        for (const sm of o.samples) sm.has = false;
        v1.copy(o.G).addScaledVector(o.A, Lo - Lb * 0.4);
        if (v1.y < 0.03 && o.inWater <= 0.3) { snd.splash = Math.max(snd.splash, 0.3); snd.hits.push(['touch', n, 0.25]); this.water.ripples.touch(v1.x, v1.z, 0.24, 0.4); }
        o.inWater = v1.y < 0.03 ? 1 : 0; o.force = 0;
        const sp = Math.hypot(this.u - cur, this.w); if (o.inWater && sp > 0.15) this.water.ripples.touch(v1.x, v1.z, 0.16, clamp(sp * 0.03, 0, 0.08));
        continue;
      }
      for (const sm of o.samples) {
        v1.copy(o.G).addScaledVector(o.A, Lo - Lb + sm.q * Lb);
        if (sm.has && dt > 1e-4) {
          v2.copy(v1).sub(sm.prev).divideScalar(dt);
          if (v2.lengthSq() < 400) sm.vel.lerp(v2, 0.6); else sm.vel.set(0, 0, 0);                  // a jump in the tracking is not a stroke
        }
        sm.prev.copy(v1); sm.has = true;
        const f = clamp((-v1.y + 0.02) / 0.07); if (f <= 0) continue;
        v2.set(sm.vel.x - cx, sm.vel.y, sm.vel.z - cz); v2.addScaledVector(o.A, -v2.dot(o.A));       // across the shaft
        v3.copy(o.N).multiplyScalar(o.N.dot(v2) * 0.7).addScaledVector(v2, 0.3);                    // mostly what meets the blade's face
        const sp = Math.hypot(v3.x, v3.z); if (sp < 0.1) { sub += f / 3; continue; }
        const k = -0.26 / 3 * f * sp, fx = v3.x * k, fz = v3.z * k;
        Fx += fx; Fz += fz; tau += (v1.z - pz) * fx - (v1.x - px) * fz; fo += Math.hypot(fx, fz);
        sub += f / 3; speed += sp * f / 3;
        this.water.ripples.touch(v1.x, v1.z, 0.2, clamp(sp * 0.06, 0, 0.3) * f);
      }
      // going in, coming out, the drops that fall from the blade after, and what the hand is told of it
      v1.copy(o.G).addScaledVector(o.A, Lo - Lb * 0.3);
      if (sub > 0.3 && o.inWater <= 0.3) { const hard = clamp(0.25 + speed * 0.3, 0, 1); snd.splash = Math.max(snd.splash, hard); snd.hits.push(['splash', n, hard]); this.water.ripples.touch(v1.x, v1.z, 0.26, 0.5); this.stats.strokes++; if (o.hand) this.pulse(o.hand, 0.5, 35); }
      if (sub > 0.3) o.wet = 1; else if (o.wet > 0) {
        o.wet = Math.max(0, o.wet - dt * 0.45); o.dripClock -= dt;
        if (o.dripClock <= 0 && v1.y < 0.9) { o.dripClock = 0.07 + (1 - o.wet) * 0.3; this.water.ripples.touch(o.tip.x, o.tip.z, 0.07, 0.16 * o.wet); snd.hits.push(['drip', n, o.wet]); }
      }
      if (o.hand && fo > 0.25) { o.hand.buzz -= dt; if (o.hand.buzz <= 0) { o.hand.buzz = 0.05; this.pulse(o.hand, 0.08 + fo * 0.14, 45); } }
      o.inWater = sub; o.force = fo; subs[n] = sub; swish = Math.max(swish, clamp(sub * speed * 0.45, 0, 1));
    }
    const Fm = Math.hypot(Fx, Fz); if (Fm > 7) { Fx *= 7 / Fm; Fz *= 7 / Fm; tau *= 7 / Fm; }
    tau *= 0.45;                                                              // (her keel and her length resist the long lever of an oar)
    snd.swish += (swish - snd.swish) * Math.min(1, dt * 12);

    // ---- her own way through the water
    const Ff = Fx * fwd.x + Fz * fwd.z, Fl = Fx * right.x + Fz * right.z;
    const cu = cx * fwd.x + cz * fwd.z, cw = cx * right.x + cz * right.z, ur = this.u - cu;
    const grip = 0.25 + Math.min(1, Math.abs(this.u));
    this.u += (Ff - 0.22 * ur - 0.13 * ur * Math.abs(ur) - this.hold * 1.5 * this.u) * dt;
    this.w += (Fl * 0.3 - 3.2 * (this.w - cw)) * dt;
    this.om += (tau / 2.6 - 1.7 * this.om + 0.42 * grip * Math.sin(err) * (1 - this.hold)) * dt;
    this.om = clamp(this.om, -0.7, 0.7); this.u = clamp(this.u, -1.6, 3.2);
    this.heading += this.om * dt;
    this.pos.x += (fwd.x * this.u + right.x * this.w) * dt; this.pos.y += (fwd.z * this.u + right.z * this.w) * dt;
    this.stats.distance += Math.abs(this.u) * dt;

    // ---- the banks, the ends of the river, and whatever stands in the water
    const loc = river.locate(this.pos.x, this.pos.y, this.s, {}); this.s = loc.s; this.d = loc.d;
    const push = (nx, nz, pen, hard) => {                                    // n: the way out of the thing, pen: how far into it she is
      const k = Math.min(1, dt * 9); this.pos.x += nx * pen * k; this.pos.y += nz * pen * k;
      let vx = fwd.x * this.u + right.x * this.w, vz = fwd.z * this.u + right.z * this.w; const vn = vx * nx + vz * nz;
      if (vn < 0) { if (vn < -0.5 && hard) snd.bump = Math.max(snd.bump, clamp(-vn * 0.6, 0, 1)); vx -= nx * vn; vz -= nz * vn; const fr = Math.max(0, 1 - dt * 1.2); vx *= fr; vz *= fr; this.u = vx * fwd.x + vz * fwd.z; this.w = vx * right.x + vz * right.z; }
    };
    const lim = Math.max(0.5, loc.halfWidth - 0.62);
    if (Math.abs(loc.d) > lim) { const sg = Math.sign(loc.d); push(-sg * loc.rx, -sg * loc.rz, Math.abs(loc.d) - lim, true); }
    const bow = river.locate(this.pos.x + fwd.x * 2.0, this.pos.y + fwd.z * 2.0, this.s, {}), blim = bow.halfWidth - 0.4;
    if (Math.abs(bow.d) > blim) this.om += Math.sign(bow.d) * Math.min(1.5, (Math.abs(bow.d) - blim) * 2.5) * dt;
    const a0 = river.at(0, {}), along0 = (this.pos.x - a0.x) * a0.tx + (this.pos.y - a0.z) * a0.tz; if (along0 < -3) push(a0.tx, a0.tz, -3 - along0, false);
    const a1 = river.at(LENGTH, {}), along1 = (this.pos.x - a1.x) * a1.tx + (this.pos.y - a1.z) * a1.tz; if (along1 > -6) push(-a1.tx, -a1.tz, along1 + 6, false);
    for (const o of this.obstacles) for (const [off, rb] of [[2.1, 0.22], [0.5, 0.46], [-1.1, 0.3]]) {
      const bx = this.pos.x + fwd.x * off, bz = this.pos.y + fwd.z * off, dx = bx - o.x, dz = bz - o.z, dist = Math.hypot(dx, dz), min = o.r + rb;
      if (dist < min && dist > 1e-4) { push(dx / dist, dz / dist, min - dist, true); this.om += ((bz - this.pos.y) * dx / dist - (bx - this.pos.x) * dz / dist) * (min - dist) * 2.0 * dt; }
    }

    // ---- how she lies in the water: a little down by the side the blade is on, a little by the stern when she is driven
    const rollT = (subs[0] - subs[1]) * 0.022 - clamp(Fl, -2, 2) * 0.012 + Math.sin(time * 0.83) * 0.007 + Math.sin(time * 1.31 + 1) * 0.004;
    const pitchT = clamp(Ff, -3, 3) * 0.006 + Math.sin(time * 0.61 + 2) * 0.004;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 3.5); this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 3);
    // the lantern swings on its ring
    const sw = this.swing; sw.z += (-46 * sw.x - 1.1 * sw.z + clamp(Ff, -4, 4) * 0.9 - this.pitch * 30) * dt; sw.x += sw.z * dt;
    sw.w += (-46 * sw.y - 1.1 * sw.w + this.om * 3.0 + this.roll * 30) * dt; sw.y += sw.w * dt;
    // her wake: the bow parts the water, the stern leaves it turning
    const spd = Math.hypot(this.u - cu, this.w);
    if (spd > 0.08) {
      const k = clamp(spd * 0.02, 0, 0.05) * Math.min(2, dt * 60), bz = this.canoe.bow + 0.35, sz = this.canoe.stern - 0.2, j = Math.sin(time * 37) * 0.1;
      this.water.ripples.touch(this.pos.x + fwd.x * -bz + right.x * j, this.pos.y + fwd.z * -bz + right.z * j, 0.22, k);
      this.water.ripples.touch(this.pos.x + fwd.x * -sz - right.x * j, this.pos.y + fwd.z * -sz - right.z * j, 0.24, -k * 0.7);
    }
    snd.speed = spd; snd.flow = cur;
    this.sync(dt, time); this.light(look, time);
  }

  // put the things in the scene where the numbers say they are
  sync(dt, time) {
    const g = this.group, rig = this.engine.rig, cam = this.engine.camera;
    g.position.set(this.pos.x, 0, this.pos.y); g.rotation.y = this.heading;
    this.hull.rotation.set(this.pitch, 0, this.roll); this.hull.position.y = Math.sin(time * 1.13) * 0.004;
    this.lantern.rotation.set(this.swing.x, 0, this.swing.y);
    if (this.engine.presenting) {
      // the seat is taken a few frames after coming aboard: on the first, the headset has not yet said where the head is
      this.aboard = (this.aboard || 0) + 1;
      if (!this.seat.set && this.aboard > 4) this.seatHere();
      if (!this.seat.set) { this.seat.x = cam.position.x; this.seat.y = clamp(cam.position.y, 0.5, 1.9); this.seat.z = cam.position.z; }
      const rot = this.heading - this.seat.yaw, c = Math.cos(rot), s = Math.sin(rot);
      rig.rotation.y = rot; rig.position.set(this.pos.x - (this.seat.x * c + this.seat.z * s), EYE - this.seat.y, this.pos.y - (-this.seat.x * s + this.seat.z * c));
    } else {
      this.aboard = 0;
      rig.rotation.y = this.heading; rig.position.set(this.pos.x, 0, this.pos.y);
      cam.position.set(0, EYE, 0); cam.rotation.set(this.view.pitch, this.view.yaw, 0, 'YXZ');
    }
    rig.updateMatrixWorld(true); g.updateMatrixWorld(true);
    // the oars: where the hands have them now that she has moved; and the hands themselves
    this.poseOars(0, ...(this.frozen ? [0, 0, 0] : this.asked));
    for (const o of this.oars) {
      v2.copy(o.A).negate(); v1.crossVectors(v2, o.N).normalize();
      m4.makeBasis(v1, v2, o.N); o.mesh.quaternion.setFromRotationMatrix(m4); o.mesh.position.copy(o.G); o.mesh.updateMatrixWorld(true);
    }
    for (const h of this.hands) {
      h.mitt.visible = h.live; if (!h.live) continue;
      if (h.oar) {
        // closed on the oar: across it, the wrist toward the rower
        const o = h.oar; v1.copy(o.A); v3.set(Math.sin(this.heading), 0.25, Math.cos(this.heading)); v3.addScaledVector(v1, -v3.dot(v1)).normalize(); v2.crossVectors(v3, v1);
        h.mitt.matrix.makeBasis(v1, v2, v3).setPosition(o.G);
      } else {
        h.grip.updateWorldMatrix(true, false); h.mitt.matrix.copy(h.grip.matrixWorld).multiply(MITT);
      }
      h.mitt.matrixWorld.copy(h.mitt.matrix);
    }
    this.flame.copy(this.flameLocal); this.lantern.localToWorld(this.flame);
  }

  light(look, time) {
    const g = this.gust || 0;                                                 // a gust at the lantern: the flame lies over and nearly goes
    const fl = (0.88 + 0.07 * Math.sin(time * 11.3) * Math.sin(time * 7.1) + 0.05 * Math.sin(time * 23.7)) * (1 - g * (0.42 + 0.22 * Math.sin(time * 37) * Math.sin(time * 23)));
    this.lampColor.copy(look.lantern).multiplyScalar(look.lanternPower * fl);
    shared.uLanternPos.value.copy(this.flame); shared.uLanternColor.value.copy(this.lampColor);
    this.glow.color.copy(look.lantern); this.glow.power = 0.55 + 0.35 * look.lanternPower * fl;
    this.lampMat.uniforms.uEmissive.value.copy(look.lantern).multiplyScalar(2.0 * fl);
  }
}
