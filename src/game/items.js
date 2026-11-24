// The shop. Every gadget is one entry: what it costs, what it looks like, and what it does to a shot.
//
// A placed item has { def, pos, quat, invQuat, obj, owner, ph, data }. Its local frame comes from the
// gun at the moment of placing: -Z points away from whoever placed it, +Z back at them.
// Hooks, all optional:
//   collide(it, b, cb, G)   solid parts; call cb(normal, penetration) like the room does
//   field(it, b, out, G)    acceleration added to a shot
//   timeScale(it, b)        < 1 slows a shot's clock
//   post(it, b, G)          triggers, checked after every substep
//   update(it, G)           animation, once a frame
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- shared looks ----------
const cache = new Map();
const once = (k, fn) => { let v = cache.get(k); if (!v) cache.set(k, v = fn()); return v; };

function canvasTex(k, w, h, draw) {
  return once('tex:' + k, () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
const dotTex = () => canvasTex('dot', 64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const puffTex = () => canvasTex('puff', 64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const swirlTex = () => canvasTex('swirl', 128, 128, (g) => {
  g.translate(64, 64);
  for (let i = 0; i < 90; i++) {
    const a = i * 0.45, r = 6 + i * 0.62;
    g.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * (i / 90)})`;
    g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + i * 0.07, 0, 7); g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 40, 0, 0, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
});
const discTex = () => canvasTex('accretion', 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.12, 'rgba(255,240,200,1)');
  gr.addColorStop(0.45, 'rgba(255,120,40,0.55)');
  gr.addColorStop(1, 'rgba(120,30,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) { // streaks so the spin reads
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1 + (i % 3);
    g.beginPath(); g.arc(64, 64, 20 + i * 1.7, i * 1.3, i * 1.3 + 1.1); g.stroke();
  }
});
const gridTex = () => canvasTex('grid', 256, 192, (g, w, h) => {
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#4ad9ff'; g.lineWidth = 2; g.globalAlpha = 0.5;
  const s = 32;
  for (let y = 0; y <= h / s + 1; y++) for (let x = 0; x <= w / s; x++) { // hex-ish lattice
    const ox = x * s + (y % 2 ? s / 2 : 0), oy = y * s * 0.86;
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(ox + Math.cos(a) * 17, oy + Math.sin(a) * 17); } g.closePath(); g.stroke();
  }
  g.globalAlpha = 1; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
});
const stripeTex = () => canvasTex('stripe', 64, 64, (g) => {
  g.fillStyle = '#16181d'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffc531';
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 80, 64); g.lineTo(i + 64, 64); g.fill(); }
});

const geo = (k, fn) => once('geo:' + k, fn);
const metal = (color, o = {}) => once(`metal:${color}:${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75, ...o }));
// self-lit trim. Emissive above 1 clips toward white and shifts the hue, so k only sets how much
// the room's light still matters, never the brightness.
const lit = (color) => once(`lit:${color}`, () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1, roughness: 0.5, metalness: 0 }));
// flat colour that stays its colour against a bright wall (additive washes out to white there)
const tint = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
const add = (color, opacity = 1, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...o });
const DARK = 0x232a38;

function glow(color, size, opacity = 0.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}
function mesh(g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; }
const sphereG = (r, k = 'a') => geo(`sph:${r}:${k}`, () => new THREE.SphereGeometry(r, 20, 14));
const torusG = (R, t, seg = 40) => geo(`tor:${R}:${t}:${seg}`, () => new THREE.TorusGeometry(R, t, 8, seg));
const boxG = (x, y, z) => geo(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const cylG = (r1, r2, h, seg = 20, open = false) => geo(`cyl:${r1}:${r2}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open));

// ---------- collision helpers (item-local) ----------
function toLocal(it, w, out) { return out.copy(w).sub(it.pos).applyQuaternion(it.invQuat); }

// sphere at p (radius r) against a box centred on the origin; returns penetration and fills n
function boxHit(p, r, hx, hy, hz, n) {
  const dx = p.x - clamp(p.x, -hx, hx), dy = p.y - clamp(p.y, -hy, hy), dz = p.z - clamp(p.z, -hz, hz);
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > r * r) return 0;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); n.set(dx / d, dy / d, dz / d); return r - d; }
  const ax = hx - Math.abs(p.x), ay = hy - Math.abs(p.y), az = hz - Math.abs(p.z);
  if (ax <= ay && ax <= az) { n.set(p.x < 0 ? -1 : 1, 0, 0); return ax + r; }
  if (ay <= az) { n.set(0, p.y < 0 ? -1 : 1, 0); return ay + r; }
  n.set(0, 0, p.z < 0 ? -1 : 1); return az + r;
}
// bounce off something that may itself be moving (vs = its velocity at the contact, world space)
function bounce(b, n, pen, cb, vs) {
  if (vs) b.vel.sub(vs);
  cb(n, pen, 'gadget');
  if (vs) b.vel.add(vs);
}
function sphereHit(it, b, cb, c, R, vel, G) {
  toLocal(it, b.pos, _p).sub(c);
  const d = _p.length();
  if (d >= R + b.r || d < 1e-6) return false;
  _n.copy(_p).divideScalar(d).applyQuaternion(it.quat);
  bounce(b, _n, R + b.r - d, cb, vel && _v.copy(vel).applyQuaternion(it.quat));
  G.touch(b, it);
  return true;
}
const inDisc = (p, R, half) => Math.abs(p.z) < half && p.x * p.x + p.y * p.y < R * R;
const cooled = (b, it, G, s) => { const m = b.gx.cd; if ((m.get(it.id) ?? 0) > G.time) return false; m.set(it.id, G.time + s); return true; };

function well(k, R, label) {
  return function field(it, b, out, G) {
    _v.subVectors(it.pos, b.pos);
    const d2 = _v.lengthSq();
    if (d2 > R * R || d2 < 1e-6) return;
    out.addScaledVector(_v.divideScalar(Math.sqrt(d2)), (k / (d2 + 0.03)) * (1 - d2 / (R * R)));
    if (d2 < 0.5) G.touch(b, it);
  };
}
function orbLook(color, dark, dir) {
  return function make() {
    const g = new THREE.Group();
    g.add(mesh(sphereG(0.085), new THREE.MeshStandardMaterial({ color: dark, emissive: color, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.3 })));
    g.add(glow(color, 0.5, 0.55));
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = mesh(torusG(0.2, 0.007), tint(color, 0.8));
      r.rotation.set(i * 1.1, i * 2.1, 0);
      rings.push(r); g.add(r);
    }
    g.userData = { rings, dir };
    return g;
  };
}
function orbUpdate(it, G) {
  const { rings, dir } = it.obj.userData;
  rings.forEach((r, i) => {
    let f = (G.time * 0.6 + i / 3) % 1;
    if (dir < 0) f = 1 - f; // collapsing rings pull, expanding rings push
    r.scale.setScalar(0.4 + f * 1.4);
    r.material.opacity = 0.9 * Math.sin(f * Math.PI);
  });
}

export const ITEMS = [
  {
    key: 'glass', name: 'GLASS', cost: 10, color: '#9fe8ff', reach: 0.5,
    blurb: 'Stops exactly one shot, then shatters. Cheap insurance.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(boxG(0.7, 0.5, 0.015), once('m:glass', () => new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false }))));
      const e = new THREE.LineSegments(geo('glassEdge', () => new THREE.EdgesGeometry(boxG(0.7, 0.5, 0.015))), once('m:glassE', () => new THREE.LineBasicMaterial({ color: 0xcff6ff })));
      g.add(e);
      return g;
    },
    collide(it, b, cb, G) {
      const pen = boxHit(toLocal(it, b.pos, _p), b.r, 0.35, 0.25, 0.01, _n);
      if (!pen) return;
      const hard = b.vel.lengthSq() > 1;
      bounce(b, _n.applyQuaternion(it.quat), pen, cb);
      G.touch(b, it);
      if (hard) { b.vel.multiplyScalar(0.35); G.shatter(it); }
    },
  },
  {
    key: 'wall', name: 'WALL', cost: 15, color: '#4ad9ff', reach: 0.55,
    blurb: 'A hard-light slab, 80 by 60 cm. Opaque, so it also blocks the view.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(boxG(0.8, 0.6, 0.04), once('m:wall', () => new THREE.MeshStandardMaterial({ map: gridTex(), emissiveMap: gridTex(), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.5 }))));
      return g;
    },
    collide(it, b, cb, G) {
      const pen = boxHit(toLocal(it, b.pos, _p), b.r, 0.4, 0.3, 0.02, _n);
      if (pen) { bounce(b, _n.applyQuaternion(it.quat), pen, cb); G.touch(b, it); }
    },
  },
  {
    key: 'fog', name: 'FOG', cost: 15, color: '#cfd8e6', reach: 0, upright: true,
    blurb: 'A cloud to hide the target, or whatever else you built behind it.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(cylG(0.07, 0.09, 0.06, 12), metal(DARK)));
      const puffs = new THREE.Group();
      const m = once('m:fog', () => new THREE.SpriteMaterial({ map: puffTex(), color: 0xc3cad6, transparent: true, opacity: 0.9, depthWrite: false }));
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(m);
        const a = i * 2.4, r = 0.12 + (i % 4) * 0.11;
        s.position.set(Math.cos(a) * r, 0.25 + ((i * 7) % 5) * 0.11, Math.sin(a) * r);
        s.scale.setScalar(0.7 + (i % 3) * 0.16);
        puffs.add(s);
      }
      g.add(puffs);
      g.userData = { puffs };
      return g;
    },
    update(it, G) {
      const { puffs } = it.obj.userData;
      puffs.rotation.y = G.time * 0.15 + it.ph;
      // standing inside ten full-screen sprites is how you drop frames: thin out up close
      puffs.visible = G.headPos.distanceToSquared(it.pos) > 0.5;
    },
  },
  {
    key: 'mine', name: 'MINE', cost: 15, color: '#ff4a4a', reach: 0.4,
    blurb: 'Blasts any shot that drifts close, then re-arms in three seconds.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(geo('mine', () => new THREE.IcosahedronGeometry(0.07, 0)), metal(0x30343c, { flatShading: true })));
      for (let i = 0; i < 6; i++) {
        const s = mesh(cylG(0, 0.014, 0.05, 6), metal(0x8a8f99));
        const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i];
        s.position.set(d[0] * 0.085, d[1] * 0.085, d[2] * 0.085);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
        g.add(s);
      }
      const lamp = glow(0xff3030, 0.22, 0.9);
      g.add(lamp);
      g.userData = { lamp };
      return g;
    },
    update(it, G) {
      const armed = (it.data.rearm ?? 0) < G.time;
      it.obj.userData.lamp.material.opacity = armed ? 0.5 + 0.5 * Math.sin(G.time * 9 + it.ph) : 0.06;
      it.obj.rotation.y += G.dt * 0.6;
    },
    post(it, b, G) {
      if ((it.data.rearm ?? 0) > G.time) return;
      const R = 0.26 + b.r;
      if (b.pos.distanceToSquared(it.pos) > R * R) return;
      it.data.rearm = G.time + 3;
      _v.subVectors(b.pos, it.pos).normalize();
      b.vel.multiplyScalar(0.3).addScaledVector(_v, 8);
      G.touch(b, it);
      G.fx.burst(it.pos, '#ffb060', { count: 60, speed: 3.2, life: 0.5, gravity: -1 });
      G.fx.burst(it.pos, '#ff4a4a', { count: 30, speed: 1.4, life: 0.7, gravity: 0 });
      G.sfx('boom', it.pos);
    },
  },
  {
    key: 'spring', name: 'SPRING', cost: 20, color: '#7dff7a', reach: 0.35,
    blurb: 'Launch pad. Whatever lands on it leaves along the pad, fast.',
    make() {
      const g = new THREE.Group();
      const pad = new THREE.Group();
      const top = mesh(cylG(0.22, 0.22, 0.03, 28), metal(0x2c3340)); top.rotation.x = Math.PI / 2;
      const ring = mesh(torusG(0.17, 0.014), lit(0x7dff7a)); ring.position.z = 0.017;
      const ring2 = mesh(torusG(0.08, 0.01), lit(0x7dff7a)); ring2.position.z = 0.017;
      pad.add(top, ring, ring2);
      const coils = [];
      for (let i = 0; i < 4; i++) { const c = mesh(torusG(0.1, 0.012, 24), metal(0xb9c2cf)); coils.push(c); g.add(c); }
      const base = mesh(cylG(0.13, 0.13, 0.02, 20), metal(DARK)); base.rotation.x = Math.PI / 2; base.position.z = -0.16;
      g.add(pad, base);
      g.userData = { pad, coils };
      return g;
    },
    update(it, G) {
      const k = it.data.kick = Math.max(0, (it.data.kick ?? 0) - G.dt * 4);
      const ext = Math.sin(k * Math.PI) * 0.12; // pad punches out, then settles
      const { pad, coils } = it.obj.userData;
      pad.position.z = ext;
      coils.forEach((c, i) => { c.position.z = -0.14 + (i + 0.5) * ((0.14 + ext - 0.015) / 4); });
    },
    collide(it, b, cb, G) {
      const p = toLocal(it, b.pos, _p);
      const side = p.z >= 0 ? 1 : -1;
      const pen = boxHit(p, b.r, 0.22, 0.22, 0.03, _n);
      if (!pen) return;
      const sp = b.vel.length();
      bounce(b, _n.applyQuaternion(it.quat), pen, cb);
      if (b.state === 'free' && !b.data.stuck) b.vel.set(0, 0, side).applyQuaternion(it.quat).multiplyScalar(clamp(sp * 1.25, 8, 14));
      G.touch(b, it);
      if (cooled(b, it, G, 0.15)) { it.data.kick = 1; G.sfx('boing', it.pos); }
    },
  },
  {
    key: 'fan', name: 'FAN', cost: 20, color: '#8fd3ff', reach: 2.3,
    blurb: 'Blows a two metre jet the way you point it. Bends every arc that crosses.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(torusG(0.3, 0.022), metal(0x39414f)));
      const rotor = new THREE.Group();
      for (let i = 0; i < 4; i++) { const bl = mesh(boxG(0.26, 0.07, 0.008), metal(0xaab4c4)); bl.position.x = 0.15; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2; bl.rotation.x = 0.5; h.add(bl); rotor.add(h); }
      rotor.add(mesh(sphereG(0.045), lit(0x8fd3ff)));
      g.add(rotor);
      const jet = mesh(cylG(0.22, 0.34, 2, 16, true), add(0x8fd3ff, 0.05)); jet.rotation.x = Math.PI / 2; jet.position.z = -1;
      g.add(jet);
      const streaks = [];
      for (let i = 0; i < 5; i++) { const s = mesh(boxG(0.006, 0.006, 0.3), add(0xd6efff, 0.5)); streaks.push(s); g.add(s); }
      g.userData = { rotor, streaks };
      return g;
    },
    update(it, G) {
      const u = it.obj.userData;
      u.rotor.rotation.z -= G.dt * 14;
      u.streaks.forEach((s, i) => {
        const f = (G.time * 0.9 + i * 0.2 + it.ph) % 1, a = i * 2.3 + it.ph;
        s.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, -f * 2);
        s.material.opacity = 0.5 * Math.sin(f * Math.PI);
      });
    },
    field(it, b, out, G) {
      const p = toLocal(it, b.pos, _p);
      if (p.z > 0 || p.z < -2 || p.x * p.x + p.y * p.y > 0.12) return;
      out.addScaledVector(_v.set(0, 0, -1).applyQuaternion(it.quat), 24 * (1 + p.z / 2.4));
      G.touch(b, it);
    },
  },
  {
    key: 'hoop', name: 'BONUS HOOP', cost: 20, color: '#ffd24a', reach: 0.45,
    blurb: 'Thread a shot through it and that shot is worth +100 if it scores.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(torusG(0.3, 0.022), lit(0xffd24a)));
      const tw = mesh(torusG(0.34, 0.006), tint(0xffb000, 0.85));
      g.add(tw);
      g.userData = { tw };
      return g;
    },
    update(it, G) { const k = it.data.kick = Math.max(0, (it.data.kick ?? 0) - G.dt * 2); it.obj.userData.tw.scale.setScalar(1 + 0.06 * Math.sin(G.time * 3 + it.ph) + k * 0.8); },
    post(it, b, G) {
      if (!inDisc(toLocal(it, b.pos, _p), 0.3, 0.07) || b.gx.hoops.has(it.id)) return;
      b.gx.hoops.add(it.id);
      it.data.kick = 1;
      G.touch(b, it);
      G.fx.burst(it.pos, '#ffd24a', { count: 40, speed: 1.6, life: 0.6, gravity: 0 });
      G.sfx('hoop', it.pos);
    },
  },
  {
    key: 'boost', name: 'BOOSTER', cost: 25, color: '#5dffb0', reach: 0.4,
    blurb: 'A rail-gun ring. Shots leave straight down its axis at speed.',
    make() {
      const g = new THREE.Group();
      const rings = [];
      for (let i = 0; i < 3; i++) { const r = mesh(torusG(0.28 - i * 0.04, 0.012), lit(0x5dffb0)); r.position.z = -i * 0.09; rings.push(r); g.add(r); }
      for (let i = 0; i < 3; i++) { const s = mesh(boxG(0.02, 0.02, 0.24), metal(DARK)); const a = i * 2.094; s.position.set(Math.cos(a) * 0.27, Math.sin(a) * 0.27, -0.09); s.rotation.x = 0; g.add(s); }
      g.userData = { rings };
      return g;
    },
    update(it, G) { it.obj.userData.rings.forEach((r, i) => r.scale.setScalar(1 + 0.07 * Math.sin(G.time * 8 - i * 1.2))); },
    post(it, b, G) {
      if (!inDisc(toLocal(it, b.pos, _p), 0.28, 0.08) || !cooled(b, it, G, 0.4)) return;
      _v.set(0, 0, -1).applyQuaternion(it.quat);
      if (b.vel.dot(_v) < 0) _v.negate();
      b.vel.copy(_v).multiplyScalar(clamp(b.vel.length() * 1.5, 9, 14));
      G.touch(b, it);
      G.fx.burst(b.pos, '#5dffb0', { count: 24, speed: 2, normal: _v, spread: 0.3, life: 0.35, gravity: 0 });
      G.sfx('boost', it.pos);
    },
  },
  {
    key: 'gravity', name: 'GRAVITY ORB', cost: 25, color: '#5a8cff', reach: 1.8,
    blurb: 'Pulls shots toward it. Slingshot around it, or just ruin a straight line.',
    make: orbLook(0x5a8cff, 0x081030, -1), update: orbUpdate, field: well(4.5, 1.8),
  },
  {
    key: 'antigrav', name: 'ANTIGRAVITY', cost: 25, color: '#ff9a3c', reach: 1.8,
    blurb: 'Shoves shots away. Park one in front of the target and watch arcs split.',
    make: orbLook(0xff9a3c, 0x301606, 1), update: orbUpdate, field: well(-4.5, 1.8),
  },
  {
    key: 'demolish', name: 'DEMOLITION', cost: 25, color: '#ff5d5d', tool: true,
    blurb: 'Aim at any gadget, yours or theirs, and delete it. Counter-play.',
  },
  {
    key: 'piston', name: 'PISTON', cost: 30, color: '#ffc531', reach: 0.75,
    blurb: 'A block that slams back and forth along where you point.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(boxG(0.03, 0.03, 1.1), metal(0x39414f)));
      const blk = mesh(boxG(0.3, 0.3, 0.3), once('m:piston', () => new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.5, metalness: 0.4 })));
      g.add(blk);
      g.userData = { blk };
      return g;
    },
    z: (it, t) => 0.4 * Math.sin(t * 2.4 + it.ph),
    update(it, G) { it.obj.userData.blk.position.z = this.z(it, G.time); },
    collide(it, b, cb, G) {
      const p = toLocal(it, b.pos, _p);
      p.z -= this.z(it, G.time);
      const pen = boxHit(p, b.r, 0.15, 0.15, 0.15, _n);
      if (!pen) return;
      _v.set(0, 0, 0.96 * Math.cos(G.time * 2.4 + it.ph)).applyQuaternion(it.quat);
      bounce(b, _n.applyQuaternion(it.quat), pen, cb, _v);
      G.touch(b, it);
    },
  },
  {
    key: 'plank', name: 'SPIN PLANK', cost: 30, color: '#ff7ad1', reach: 0.7,
    blurb: 'A 1.1 m propeller. Timing gets you through; bad timing gets you batted.',
    W: 2.6,
    make() {
      const g = new THREE.Group();
      const spin = new THREE.Group();
      spin.add(mesh(boxG(1.1, 0.12, 0.07), metal(0x2c3340)));
      spin.add(mesh(boxG(1.1, 0.03, 0.075), lit(0xff7ad1)));
      g.add(spin, mesh(sphereG(0.07), metal(0xb9c2cf)));
      g.userData = { spin };
      return g;
    },
    update(it, G) { it.obj.userData.spin.rotation.z = G.time * this.W + it.ph; },
    collide(it, b, cb, G) {
      const p = toLocal(it, b.pos, _p);
      if (Math.abs(p.z) > 0.04 + b.r) return;
      const a = G.time * this.W + it.ph, c = Math.cos(a), s = Math.sin(a);
      const px = p.x, py = p.y;
      p.x = c * px + s * py; p.y = -s * px + c * py;
      const pen = boxHit(p, b.r, 0.55, 0.06, 0.035, _n);
      if (!pen) return;
      const nx = _n.x, ny = _n.y;
      _n.x = c * nx - s * ny; _n.y = s * nx + c * ny;
      _v.set(-this.W * py, this.W * px, 0).applyQuaternion(it.quat);
      bounce(b, _n.applyQuaternion(it.quat), pen, cb, _v);
      G.touch(b, it);
    },
  },
  {
    key: 'pendulum', name: 'PENDULUM', cost: 30, color: '#ffb347', reach: 1.0, upright: true,
    blurb: 'A heavy bob on an 80 cm arm, swinging across your line of fire.',
    L: 0.8, A: 0.95, W: 2.5,
    make() {
      const g = new THREE.Group();
      g.add(mesh(boxG(0.1, 0.05, 0.1), metal(0x39414f)));
      const arm = new THREE.Group();
      arm.add(mesh(cylG(0.008, 0.008, 0.8, 8), metal(0xb9c2cf), 0, -0.4, 0));
      arm.add(mesh(sphereG(0.13), metal(0x8a6a2a, { roughness: 0.25 }), 0, -0.8, 0));
      const band = mesh(torusG(0.132, 0.012, 28), lit(0xffb347)); band.position.y = -0.8; band.rotation.x = Math.PI / 2;
      arm.add(band);
      g.add(arm);
      g.userData = { arm };
      return g;
    },
    update(it, G) { it.obj.userData.arm.rotation.z = this.A * Math.sin(G.time * this.W + it.ph); },
    collide(it, b, cb, G) {
      const ph = G.time * this.W + it.ph, th = this.A * Math.sin(ph), w = this.A * this.W * Math.cos(ph);
      _c.set(Math.sin(th) * this.L, -Math.cos(th) * this.L, 0);
      const cs = Math.cos(th) * this.L * w, sn = Math.sin(th) * this.L * w;
      sphereHit(it, b, cb, _c, 0.13, _q.set(cs, sn, 0, 0), G);
    },
  },
  {
    key: 'orbiter', name: 'ORBITER', cost: 30, color: '#c58cff', reach: 0.6,
    blurb: 'A ball circling a 40 cm ring. Put the target in the middle, for instance.',
    R: 0.4, W: 3.2,
    make() {
      const g = new THREE.Group();
      g.add(mesh(torusG(0.4, 0.005, 48), tint(0xc58cff, 0.7)));
      const ball = new THREE.Group();
      ball.add(mesh(sphereG(0.1), metal(0x4a2a7a, { emissive: 0xc58cff, emissiveIntensity: 0.5 })), glow(0xc58cff, 0.4, 0.5));
      g.add(ball);
      g.userData = { ball };
      return g;
    },
    update(it, G) { const a = G.time * this.W + it.ph; it.obj.userData.ball.position.set(Math.cos(a) * this.R, Math.sin(a) * this.R, 0); },
    collide(it, b, cb, G) {
      const a = G.time * this.W + it.ph, c = Math.cos(a) * this.R, s = Math.sin(a) * this.R;
      sphereHit(it, b, cb, _c.set(c, s, 0), 0.1, _q.set(-s * this.W, c * this.W, 0, 0), G);
    },
  },
  {
    key: 'slow', name: 'TIME BUBBLE', cost: 30, color: '#59f0d0', reach: 0.6,
    blurb: 'Inside, time runs at a quarter speed. Shots crawl; the clock on them does not.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(geo('bubble', () => new THREE.SphereGeometry(0.6, 28, 18)), Object.assign(tint(0x59f0d0, 0.16), { side: THREE.FrontSide }))); // front faces only: no fill cost from inside
      g.add(mesh(torusG(0.6, 0.008, 56), tint(0x2fd6b4, 0.9)));
      const h1 = mesh(boxG(0.014, 0.3, 0.014), tint(0x2fd6b4, 0.95), 0, 0.15, 0), h2 = mesh(boxG(0.014, 0.2, 0.014), tint(0x2fd6b4, 0.95), 0, 0.1, 0);
      const a1 = new THREE.Group(), a2 = new THREE.Group(); a1.add(h1); a2.add(h2);
      g.add(a1, a2);
      g.userData = { a1, a2 };
      return g;
    },
    update(it, G) { const u = it.obj.userData; u.a1.rotation.z = -G.time * 0.5; u.a2.rotation.z = -G.time * 0.04 + it.ph; },
    timeScale(it, b, G) {
      if (b.pos.distanceToSquared(it.pos) > 0.36) return 1;
      G.touch(b, it);
      return 0.25;
    },
  },
  {
    key: 'laser', name: 'LASER', cost: 35, color: '#ff3b5c', reach: 2.6,
    blurb: 'A 2.5 m beam that vaporises shots. It blinks: 1.6 s on, 1 s off.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(boxG(0.08, 0.08, 0.12), metal(0x39414f)), mesh(boxG(0.06, 0.06, 0.04), metal(0x39414f), 0, 0, -2.5));
      const lens = mesh(sphereG(0.025), lit(0xff3b5c)); lens.position.z = -0.06;
      const beam = new THREE.Group();
      const core = mesh(cylG(0.008, 0.008, 2.44, 6), add(0xffd0d8, 1)); core.rotation.x = Math.PI / 2; core.position.z = -1.28;
      const halo = mesh(cylG(0.03, 0.03, 2.44, 8, true), add(0xff3b5c, 0.3)); halo.rotation.x = Math.PI / 2; halo.position.z = -1.28;
      beam.add(core, halo);
      g.add(lens, beam);
      g.userData = { beam, halo };
      return g;
    },
    on: (it, t) => (t + it.ph) % 2.6 < 1.6,
    update(it, G) {
      const u = it.obj.userData;
      const f = (G.time + it.ph) % 2.6;
      // warn before it comes back on
      u.beam.visible = f < 1.6 || (f > 2.3 && Math.sin(G.time * 60) > 0);
      u.halo.scale.x = u.halo.scale.z = 1 + 0.25 * Math.sin(G.time * 30);
    },
    post(it, b, G) {
      if (!this.on(it, G.time)) return;
      const p = toLocal(it, b.pos, _p);
      if (p.z > 0.04 || p.z < -2.52) return;
      const R = b.r + 0.012;
      if (p.x * p.x + p.y * p.y > R * R) return;
      G.fx.burst(b.pos, '#ff3b5c', { count: 50, speed: 2.4, life: 0.5, gravity: 1 });
      G.sfx('zap', b.pos);
      G.kill(b, 'vaporised by a laser');
    },
  },
  {
    key: 'blackhole', name: 'BLACK HOLE', cost: 45, color: '#b06bff', reach: 2.4,
    blurb: 'Strong pull out to 2.4 m. Anything that touches the horizon is gone.',
    make() {
      const g = new THREE.Group();
      g.add(glow(0x9a4dff, 0.75, 0.5));
      g.add(mesh(sphereG(0.11, 'bh'), once('m:bh', () => new THREE.MeshBasicMaterial({ color: 0x000000 }))));
      const disc = mesh(geo('bhdisc', () => new THREE.PlaneGeometry(0.72, 0.72)), new THREE.MeshBasicMaterial({ map: discTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = -1.25;
      const tilt = new THREE.Group(); tilt.add(disc);
      g.add(tilt, mesh(torusG(0.118, 0.004, 40), add(0xffe6c0, 0.9)));
      g.userData = { disc };
      return g;
    },
    update(it, G) { it.obj.userData.disc.rotation.z = G.time * 2.2; },
    field: well(11, 2.4),
    post(it, b, G) {
      if (b.pos.distanceToSquared(it.pos) > 0.0169) return;
      G.fx.burst(it.pos, '#b06bff', { count: 40, speed: 0.9, life: 0.6, gravity: 0 });
      G.sfx('gulp', it.pos);
      G.kill(b, 'swallowed by a black hole');
    },
  },
  {
    key: 'turret', name: 'ANTIMATTER GUN', cost: 50, color: '#e25dff', reach: 0, upright: true,
    blurb: 'Tracks shots within 3.5 m and fires antimatter. One touch annihilates both.',
    make() {
      const g = new THREE.Group();
      g.add(mesh(cylG(0.05, 0.09, 0.07, 14), metal(0x39414f), 0, -0.09, 0));
      const head = new THREE.Group();
      head.add(mesh(sphereG(0.075), metal(0x2c3340)));
      const barrel = mesh(cylG(0.016, 0.022, 0.24, 10), metal(0xb9c2cf)); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.15;
      const tip = mesh(torusG(0.024, 0.007, 16), lit(0xe25dff)); tip.position.z = -0.27;
      const eye = mesh(sphereG(0.022), lit(0xe25dff)); eye.position.set(0, 0.06, -0.04);
      head.add(barrel, tip, eye);
      g.add(head);
      g.userData = { head };
      return g;
    },
    update(it, G) {
      const head = it.obj.userData.head;
      let best = null, bd = 12.25;
      for (const b of G.bodies) { if (b.kill) continue; const d = b.pos.distanceToSquared(it.pos); if (d < bd) { bd = d; best = b; } }
      it.data.cool = (it.data.cool ?? 0.5) - G.dt;
      if (!best) { head.rotation.y += G.dt * 0.5; return; } // idle scan
      // lead the shot, slew toward it, fire when lined up
      _p.copy(best.pos).addScaledVector(best.vel, Math.sqrt(bd) / 7).sub(it.pos).normalize();
      _v.copy(_p).applyQuaternion(it.invQuat);
      _q.setFromUnitVectors(_c.set(0, 0, -1), _v);
      head.quaternion.rotateTowards(_q, G.dt * 5);
      if (it.data.cool <= 0 && head.quaternion.angleTo(_q) < 0.12) {
        it.data.cool = 0.85;
        _c.copy(it.pos).addScaledVector(_p, 0.28);
        G.pellet(_c, _p.multiplyScalar(7));
        G.sfx('pew', it.pos);
      }
    },
  },
  {
    key: 'portal', name: 'PORTAL PAIR', cost: 90, color: '#ff8a3c', reach: 0.45, pair: true,
    blurb: 'Place the orange end, then the blue. In one, out the other, same speed.',
    make(second) {
      const col = second ? 0x4aa8ff : 0xff8a3c;
      const g = new THREE.Group();
      g.add(mesh(torusG(0.3, 0.02), lit(col, 1.5)));
      const sw = mesh(geo('portalDisc', () => new THREE.CircleGeometry(0.29, 32)), new THREE.MeshBasicMaterial({ map: swirlTex(), color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      g.add(sw);
      g.userData = { sw };
      return g;
    },
    update(it, G) { it.obj.userData.sw.rotation.z = G.time * (it.data.second ? -1.6 : 1.6); it.obj.userData.sw.material.opacity = it.data.partner ? 0.9 : 0.3; },
    post(it, b, G) {
      const o = it.data.partner;
      if (!o || (b.gx.portal ?? 0) > G.time) return;
      const p = toLocal(it, b.pos, _p);
      if (!inDisc(p, 0.3, 0.07)) return;
      b.gx.portal = G.time + 0.25;
      G.fx.burst(b.pos, it.def.color, { count: 24, speed: 1.2, life: 0.4, gravity: 0 });
      // walk in the front of one, walk out the front of the other: half a turn about local Y
      b.vel.applyQuaternion(it.invQuat); b.vel.x = -b.vel.x; b.vel.z = -b.vel.z; b.vel.applyQuaternion(o.quat);
      p.x = -p.x; p.z = -p.z;
      b.pos.copy(p).applyQuaternion(o.quat).add(o.pos);
      const sp = b.vel.length();
      if (sp > 1e-3) b.pos.addScaledVector(b.vel, 0.09 / sp);
      b.trail?.reset(b.pos);
      G.touch(b, it); G.touch(b, o);
      G.fx.burst(b.pos, o.data.second ? '#4aa8ff' : '#ff8a3c', { count: 24, speed: 1.2, life: 0.4, gravity: 0 });
      G.sfx('portal', o.pos);
    },
  },
];

export const ITEM_BY_KEY = Object.fromEntries(ITEMS.map((d) => [d.key, d]));
export { glow, dotTex, Z };
