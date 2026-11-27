// Boat: the canoe on the water, the paddler's seat in her, the lantern at her bow and the paddle that drives her.
//
// THE PADDLE is held in both hands, as a real one is: the upper hand on the grip, the lower on the shaft, and the
// blade goes wherever that puts it. Nothing is scripted. Each frame the blade's own movement through the water is
// measured, and the water pushes back on it by the square of its speed: pull the blade aft and she goes forward,
// hold it still in the water and it drags like a rudder, sweep it wide and she turns. A stroke on the right turns
// her to the left, as it should, and the river's current and her own keel slowly bring her straight again, so a
// rider who only wants to look can paddle on one side, or not at all, and still come to the well.
//
// THE SEAT. The rider's head is put 0.95 m above the water whatever chair they sit in (their height when they come
// aboard is taken as sitting height). The hull rocks; the rider's horizon never does.
import * as THREE from 'three';
import { makePaint, shared } from './paint.js';
import { woodSheet } from './art.js';
import { buildCanoe, buildLantern, buildPaddle, PADDLE } from './craft.js';
import { river, LENGTH } from './river.js';
import { track, clamp } from './noise.js';

export const EYE = 0.95;
const CURRENT = [[-40, 0.2], [0, 0.26], [60, 0.42], [366, 0.42], [420, 0.24], [560, 0.24], [600, 0.42], [800, 0.45], [880, 0.3], [960, 0.14], [1010, 0.0]];
const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q1 = new THREE.Quaternion();
const lerp = (a, b, t) => a + (b - a) * t, ease = (q) => q * q * (3 - 2 * q);
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
    this.paddle = new THREE.Mesh(buildPaddle(), this.woodMat); this.paddle.name = 'paddle'; this.paddle.frustumCulled = false;
    world.addMoving(this.paddle);

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
    this.sound = { swish: 0, splash: 0, bump: 0, speed: 0, drip: 0 };       // what the ear should be told (src/ifing/audio.js)
    this.stats = { strokes: 0, distance: 0 }; this.asked = [0, 0, 0];

    // the hands
    const xr = engine.renderer.xr;
    this.hands = [0, 1].map((i) => {
      const grip = xr.getControllerGrip(i), h = { grip, on: false, source: null, pos: new THREE.Vector3() };
      grip.addEventListener('connected', (e) => { h.on = true; h.source = e.data; });
      grip.addEventListener('disconnected', () => { h.on = false; h.source = null; });
      engine.rig.add(grip); return h;
    });
    this.top = 0;
    this.pT = new THREE.Vector3(); this.pA = new THREE.Vector3(1, 0, 0); this.pN = new THREE.Vector3(0, 1, 0); this.poseSet = false;
    this.samples = [0.18, 0.5, 0.85].map((q) => ({ q, prev: new THREE.Vector3(), has: false, vel: new THREE.Vector3() }));
    this.stroke = { p: 0.6, side: 1, count: 0 };
    this.wet = 0; this.dripClock = 0; this.inWater = 0;
    this.keys = {};
    addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    this.place(2, 0);
  }

  /** Put her on the river at s, d, lying along it, at rest. */
  place(s, d = 0, turn = 0) {
    const p = river.at(s, {});
    this.pos.set(p.x + p.rx * d, p.z + p.rz * d); this.heading = p.heading + turn; this.u = this.w = this.om = 0; this.s = s; this.d = d;
    for (const sm of this.samples) sm.has = false;
    this.poseSet = false; this.sync(0, 0);
  }

  /** Take where the rider's head is now as the seat (called on coming aboard, and when they ask to be re-seated). */
  seatHere() {
    const cam = this.engine.camera; v1.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.seat.x = cam.position.x; this.seat.y = clamp(cam.position.y, 0.5, 1.9); this.seat.z = cam.position.z; this.seat.yaw = Math.atan2(-v1.x, -v1.z); this.seat.set = true;
  }

  get forward() { return v4.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }

  // ---- the paddle's place: from the hands, from the keys, or at rest across the gunwales
  pose(dt, drive, steer, headingErr) {
    const rig = this.engine.rig, vr = this.engine.presenting;
    const live = vr ? this.hands.filter((h) => h.on && h.grip.visible) : [];
    for (const h of live) h.pos.copy(h.grip.position).applyMatrix4(rig.matrixWorld);
    const T = v1, A = v2, N = v3; let tracked = false, feather = false;
    if (live.length === 2 && Math.abs(drive) < 0.3) {
      const [a, b] = live;
      if (a.pos.y > b.pos.y + 0.06) this.top = 0; else if (b.pos.y > a.pos.y + 0.06) this.top = 1;
      const hi = this.top === 0 ? a : b, lo = this.top === 0 ? b : a;
      T.copy(hi.pos); A.copy(lo.pos).sub(hi.pos);
      if (A.length() > 0.2) A.normalize(); else A.copy(this.pA);
      tracked = true;
    } else if (live.length === 1 && Math.abs(drive) < 0.3) {
      const h = live[0]; h.grip.getWorldQuaternion(q1);
      A.set(0, -0.35, -1).normalize().applyQuaternion(q1); T.copy(h.pos).addScaledVector(A, -0.55); tracked = true;
    } else if (Math.abs(drive) > 0.05) {
      // a stroke made for the rider: the same blade in the same water, moved along a paddler's path
      const st = this.stroke, back = drive < 0;
      st.p += dt * 0.6 * (0.55 + 0.45 * Math.abs(drive));
      if (st.p >= 1) {
        st.p -= 1; st.count++;
        const need = steer * 1.2 + clamp(headingErr * 2, -1, 1);                // > 0: she should come round to the right, so paddle on the left
        if (need > 0.2) st.side = -1; else if (need < -0.2) st.side = 1; else if (st.count % 3 === 0) st.side = -st.side;
      }
      const sd = st.side, zF = -0.98, zB = 0.28; let tx, ty, tz;
      if (st.p < 0.42) { const q = st.p / 0.42, e = ease(q); tz = back ? lerp(zB, zF, e) : lerp(zF, zB, e); tx = sd * 0.6; ty = -0.36 * Math.min(1, q * 7) * Math.min(1, (1 - q) * 5); }
      else { const q = (st.p - 0.42) / 0.58, e = ease(q); tz = back ? lerp(zF, zB, e) : lerp(zB, zF, e); tx = sd * (0.6 + 0.28 * Math.sin(Math.PI * q)); ty = 0.09 + 0.17 * Math.sin(Math.PI * q); feather = q > 0.1 && q < 0.9; }
      T.set(-sd * 0.1, 0.9, tz * 0.3 - 0.34); A.set(tx, ty, tz).sub(T).normalize(); T.set(tx, ty, tz).addScaledVector(A, -PADDLE.length);
      T.applyMatrix4(this.group.matrixWorld); A.transformDirection(this.group.matrixWorld);
    } else {
      // at rest, laid across the gunwales in front of the rider
      T.set(-0.8, 0.345, -0.6).applyMatrix4(this.hull.matrixWorld); A.set(1, 0.0, 0.05).normalize().transformDirection(this.hull.matrixWorld); feather = true;
      this.stroke.p = 0.6;
    }
    // the blade faces the way she is going (so that a pull drives her), or lies flat when it is carried forward
    const f = feather ? UP : this.forward; N.copy(f).addScaledVector(A, -f.dot(A));
    if (N.lengthSq() < 0.01) N.copy(UP).addScaledVector(A, -UP.dot(A));
    N.normalize();
    const k = tracked || !this.poseSet ? 1 : 1 - Math.exp(-dt * 16);
    this.pT.lerp(T, k); this.pA.lerp(A, k).normalize(); this.pN.lerp(N, tracked || !this.poseSet ? 1 : 1 - Math.exp(-dt * 9));
    this.pN.addScaledVector(this.pA, -this.pN.dot(this.pA)).normalize(); this.poseSet = true;
    return tracked;
  }

  /** dt: the frame; look: the reach's colours (for the lantern); input: { drive, steer } from keys or a thumbstick. */
  update(dt, time, look) {
    const snd = this.sound; snd.splash = 0; snd.bump = Math.max(0, snd.bump - dt * 4);
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
    this.asked = [drive, steer, -err]; this.pose(dt, drive, steer, -err);
    // ---- the water on the blade
    const cur = track(CURRENT, this.s) * (1 - this.hold), cx = here.tx * cur, cz = here.tz * cur;
    let Fx = 0, Fz = 0, tau = 0, sub = 0, speed = 0;
    const px = this.pos.x + fwd.x * 0.5, pz = this.pos.y + fwd.z * 0.5, { length: Lp, blade: Lb } = PADDLE;
    for (const sm of this.samples) {
      v1.copy(this.pT).addScaledVector(this.pA, Lp - Lb + sm.q * Lb);
      if (sm.has && dt > 1e-4) {
        v2.copy(v1).sub(sm.prev).divideScalar(dt);
        if (v2.lengthSq() < 144) sm.vel.lerp(v2, 0.6); else sm.vel.set(0, 0, 0);                    // a jump in the tracking is not a stroke
      }
      sm.prev.copy(v1); sm.has = true;
      const f = clamp((-v1.y + 0.02) / 0.07); if (f <= 0) continue;
      v2.set(sm.vel.x - cx, sm.vel.y, sm.vel.z - cz); v2.addScaledVector(this.pA, -v2.dot(this.pA));   // across the shaft
      v3.copy(this.pN).multiplyScalar(this.pN.dot(v2) * 0.65).addScaledVector(v2, 0.35);              // mostly what meets the blade's face
      const sp = Math.hypot(v3.x, v3.z); if (sp < 0.1) { sub += f / 3; continue; }
      const k = -0.72 / 3 * f * sp, fx = v3.x * k, fz = v3.z * k;
      Fx += fx; Fz += fz; tau += (v1.z - pz) * fx - (v1.x - px) * fz;
      sub += f / 3; speed += sp * f / 3;
      this.water.ripples.touch(v1.x, v1.z, 0.2, clamp(sp * 0.07, 0, 0.3) * f);
    }
    const Fm = Math.hypot(Fx, Fz); if (Fm > 7) { Fx *= 7 / Fm; Fz *= 7 / Fm; tau *= 7 / Fm; }
    // going in, coming out, and the drops that fall from the blade after
    v1.copy(this.pT).addScaledVector(this.pA, Lp - Lb * 0.3);
    if (sub > 0.3 && this.inWater <= 0.3) { snd.splash = clamp(0.25 + speed * 0.4, 0, 1); this.water.ripples.touch(v1.x, v1.z, 0.26, 0.5); this.stats.strokes++; }
    if (sub > 0.3) this.wet = 1; else if (this.wet > 0) {
      this.wet = Math.max(0, this.wet - dt * 0.45); this.dripClock -= dt;
      if (this.dripClock <= 0 && v1.y < 0.7) { this.dripClock = 0.07 + (1 - this.wet) * 0.3; v2.copy(this.pT).addScaledVector(this.pA, Lp); this.water.ripples.touch(v2.x, v2.z, 0.07, 0.16 * this.wet); snd.drip = this.wet; }
    }
    this.inWater = sub; snd.swish += (clamp(sub * speed * 0.6, 0, 1) - snd.swish) * Math.min(1, dt * 12);

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
    const side = Math.sign((this.pT.x + this.pA.x * Lp - this.pos.x) * right.x + (this.pT.z + this.pA.z * Lp - this.pos.y) * right.z);
    const rollT = -side * sub * 0.028 - clamp(Fl, -2, 2) * 0.012 + Math.sin(time * 0.83) * 0.007 + Math.sin(time * 1.31 + 1) * 0.004;
    const pitchT = clamp(Ff, -3, 3) * 0.006 + Math.sin(time * 0.61 + 2) * 0.004;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 3.5); this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 3);
    // the lantern swings on its ring
    const sw = this.swing; sw.z += (-46 * sw.x - 1.1 * sw.z + clamp(Ff, -4, 4) * 0.9 - this.pitch * 30) * dt; sw.x += sw.z * dt;
    sw.w += (-46 * sw.y - 1.1 * sw.w + this.om * 3.0 + this.roll * 30) * dt; sw.y += sw.w * dt;
    // her wake: the bow parts the water, the stern leaves it turning
    const spd = Math.hypot(this.u - cu, this.w);
    if (spd > 0.08) {
      const k = clamp(spd * 0.05, 0, 0.14), bz = this.canoe.bow + 0.35, sz = this.canoe.stern - 0.2, j = Math.sin(time * 37) * 0.1;
      this.water.ripples.touch(this.pos.x + fwd.x * -bz + right.x * j, this.pos.y + fwd.z * -bz + right.z * j, 0.3, k);
      this.water.ripples.touch(this.pos.x + fwd.x * -sz - right.x * j, this.pos.y + fwd.z * -sz - right.z * j, 0.32, -k * 0.7);
    }
    snd.speed = spd;
    this.sync(dt, time); this.light(look, time);
  }

  // put the things in the scene where the numbers say they are
  sync(dt, time) {
    const g = this.group, rig = this.engine.rig, cam = this.engine.camera;
    g.position.set(this.pos.x, 0, this.pos.y); g.rotation.y = this.heading;
    this.hull.rotation.set(this.pitch, 0, this.roll); this.hull.position.y = Math.sin(time * 1.13) * 0.004;
    this.lantern.rotation.set(this.swing.x, 0, this.swing.y);
    if (this.engine.presenting) {
      if (!this.seat.set) this.seatHere();
      const rot = this.heading - this.seat.yaw, c = Math.cos(rot), s = Math.sin(rot);
      rig.rotation.y = rot; rig.position.set(this.pos.x - (this.seat.x * c + this.seat.z * s), EYE - this.seat.y, this.pos.y - (-this.seat.x * s + this.seat.z * c));
    } else {
      rig.rotation.y = this.heading; rig.position.set(this.pos.x, 0, this.pos.y);
      cam.position.set(0, EYE, 0); cam.rotation.set(this.view.pitch, this.view.yaw, 0, 'YXZ');
    }
    rig.updateMatrixWorld(true); g.updateMatrixWorld(true);
    // the paddle: between the hands as they are now
    if (dt === 0 || this.frozen) this.pose(0, 0, 0, 0); else if (this.engine.presenting) this.pose(0, ...this.asked);
    v2.copy(this.pA).negate(); v1.crossVectors(v2, this.pN).normalize();
    m4.makeBasis(v1, v2, this.pN); this.paddle.quaternion.setFromRotationMatrix(m4); this.paddle.position.copy(this.pT); this.paddle.updateMatrixWorld(true);
    this.flame.copy(this.flameLocal); this.lantern.localToWorld(this.flame);
  }

  light(look, time) {
    const fl = 0.88 + 0.07 * Math.sin(time * 11.3) * Math.sin(time * 7.1) + 0.05 * Math.sin(time * 23.7);
    this.lampColor.copy(look.lantern).multiplyScalar(look.lanternPower * fl);
    shared.uLanternPos.value.copy(this.flame); shared.uLanternColor.value.copy(this.lampColor);
    this.glow.color.copy(look.lantern); this.glow.power = 0.55 + 0.35 * look.lanternPower * fl;
    this.lampMat.uniforms.uEmissive.value.copy(look.lantern).multiplyScalar(2.0 * fl);
  }
}
