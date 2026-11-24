// TRICK SHOT: a two-player, one-headset obstacle-course game played in your real room.
//
// Both players get cash. After an opening build each, turns go: take up to five shots at the target
// from the tee, then spend money on gadgets and leave them on the course. Nothing is ever cleared
// (short of a demolition charge), so the course gets worse every turn. Fewer shots = more points,
// plus style bonuses for every gadget the scoring shot touched on the way in.
import * as THREE from 'three';
import { ITEMS, glow } from './items.js';
import { BALLS, steer } from './balls.js';
import { Panel, drawBanner, drawShop, drawScore, bullseyeTexture, teeTexture } from './ui.js';
import { sfxGame } from '../audio.js';
import { fixAdditive } from '../blend.js';

const ROUNDS = 4;
const SHOTS = 5;
const START_CASH = 100;
const INCOME = 60;
const MAX_ITEMS = 40;
const HIT_POINTS = [500, 400, 300, 200, 100];
const TARGET_R = 0.17;
const TEE_R = 0.75;
const SHOT_TIMEOUT = 10;
const P_COLORS = ['#4ad9ff', '#ff9a3c'];
const GOLD = '#f2c14e';
const CELLS = [...ITEMS.map((d) => ({ name: d.name, cost: d.cost, color: d.color, blurb: d.blurb })), { done: true, color: '#8dff9a', blurb: 'Finish building and hand over.' }];
const COLS = 7;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function createGame(api) {
  const { world, scene, fx, bodies } = api;
  const _r = new THREE.Vector3();
  const S = {
    state: 'off', // off | menu | sandbox | setTee | setTarget | pass | build | shoot | over
    players: [0, 1].map((i) => ({ name: `PLAYER ${i + 1}`, color: P_COLORS[i], score: 0, cash: START_CASH })),
    steps: [], step: -1, cur: 0, round: 0,
    shotsLeft: 0, shotN: 0, shots: [], ball: 0, shotWhy: '', note: '',
    items: [], placed: [], pending: null, sel: 0, dist: 1.2, yaw: 0,
    tee: null, target: null, wait: null, match: false,
  };
  let nextId = 1;
  let time = 0;
  const inject = {}; // tests poke inputs in here

  const G = {
    time: 0, dt: 0, bodies, fx, headPos: new THREE.Vector3(),
    sfx: sfxGame,
    touch(b, it) { b.gx.used.add(it.id); },
    kill(b, why) {
      if (b.kill) return;
      const gx = b.gx;
      if (gx && gx.safe > time) return;
      if (gx && b.law.shield && !gx.popped) { // the shield takes it
        gx.popped = true; gx.safe = time + 0.5;
        fx.burst(b.pos, '#59f0d0', { count: 50, speed: 2.4, life: 0.5, gravity: 0 });
        sfxGame('glass', b.pos);
        return;
      }
      end(b, why);
    },
    pellet(pos, vel) { spawnPellet(pos, vel); },
    shatter(it) {
      fx.burst(it.pos, '#cff6ff', { count: 70, speed: 2.2, life: 0.7, gravity: -5 });
      sfxGame('glass', it.pos);
      removeItem(it);
    },
  };

  function end(b, why = '') { b.kill = true; b.state = 'dead'; if (S.shots.includes(b)) S.shotWhy = why; }

  // ---------- world furniture: tee, target, banner, tablet, aim helpers ----------
  const tee = new THREE.Mesh(new THREE.PlaneGeometry(TEE_R * 2.3, TEE_R * 2.3), new THREE.MeshBasicMaterial({
    map: teeTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  tee.rotation.x = -Math.PI / 2;
  tee.visible = false;
  scene.add(tee);

  const target = new THREE.Group();
  {
    const face = new THREE.MeshBasicMaterial({ map: bullseyeTexture(), side: THREE.DoubleSide });
    target.add(new THREE.Mesh(new THREE.CircleGeometry(TARGET_R, 40), face));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TARGET_R + 0.012, 0.012, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffd24a, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.6 }));
    target.add(rim);
    const halo = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(TARGET_R + 0.06, 0.006, 6, 20, 1.3), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      arc.rotation.z = i * 2.094;
      halo.add(arc);
    }
    const g = glow(0xffc040, 0.9, 0.35);
    g.position.z = -0.02;
    target.add(halo, g);
    target.userData = { halo, flash: 0 };
    target.visible = false;
    scene.add(target);
  }

  const banner = new Panel(1024, 512, 0.9, 0.45);
  banner.mat.depthTest = false;
  banner.mesh.renderOrder = 30;
  banner.mesh.visible = false;
  scene.add(banner.mesh);
  let bannerUntil = 0, bannerModal = false, bannerFresh = false;

  const tablet = new Panel(1024, 768, 0.34, 0.255);
  tablet.mesh.position.set(0, 0.17, 0.02);
  tablet.mesh.rotation.x = -0.55;
  tablet.mesh.visible = false;
  // the same texture again, big, over the target, so whoever is watching the passthrough cast can follow
  const jumbo = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), tablet.mat);
  jumbo.visible = false;
  scene.add(jumbo);

  const aim = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 28), new THREE.MeshBasicMaterial({ color: 0x8dff9a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  aim.visible = marker.visible = false;
  aim.frustumCulled = false;
  scene.add(aim, marker);
  let ghost = null; // { def, obj, it }
  for (const o of [tee, target, aim, marker]) fixAdditive(o);

  // antimatter pellets: one Points object, fixed pool
  const PN = 24;
  const pel = { pos: new Float32Array(PN * 3), vel: new Float32Array(PN * 3), life: new Float32Array(PN), next: 0 };
  const pelGeo = new THREE.BufferGeometry();
  pelGeo.setAttribute('position', new THREE.BufferAttribute(pel.pos, 3).setUsage(THREE.DynamicDrawUsage));
  const pelPts = new THREE.Points(pelGeo, new THREE.PointsMaterial({ size: 0.07, map: glow(0xffffff, 1).material.map, color: 0xf0a0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pelPts.frustumCulled = false;
  pel.pos.fill(-999);
  fixAdditive(pelPts);
  scene.add(pelPts);
  function spawnPellet(p, v) {
    const k = pel.next; pel.next = (k + 1) % PN;
    pel.pos[k * 3] = p.x; pel.pos[k * 3 + 1] = p.y; pel.pos[k * 3 + 2] = p.z;
    pel.vel[k * 3] = v.x; pel.vel[k * 3 + 1] = v.y; pel.vel[k * 3 + 2] = v.z;
    pel.life[k] = 0.9;
  }
  function updatePellets(dt) {
    let any = false;
    for (let k = 0; k < PN; k++) {
      if (pel.life[k] <= 0) continue;
      any = true;
      pel.life[k] -= dt;
      const i = k * 3;
      _o.set(pel.pos[i], pel.pos[i + 1], pel.pos[i + 2]);
      _d.set(pel.vel[i], pel.vel[i + 1], pel.vel[i + 2]);
      let dead = pel.life[k] <= 0;
      for (const b of bodies) {
        if (b.kill) continue;
        // closest approach along this frame's travel, so a fast pellet can't skip over a shot
        _p.subVectors(b.pos, _o);
        const t = THREE.MathUtils.clamp(_p.dot(_d) / _d.lengthSq(), 0, dt);
        if (_p.addScaledVector(_d, -t).lengthSq() > (b.r + 0.045) ** 2) continue;
        fx.burst(b.pos, '#ffffff', { count: 60, speed: 3.5, life: 0.45, gravity: 0 });
        fx.burst(b.pos, '#e25dff', { count: 40, speed: 1.5, life: 0.8, gravity: 0 });
        sfxGame('annihilate', b.pos);
        G.kill(b, 'annihilated by antimatter');
        dead = true;
        break;
      }
      if (dead) { pel.life[k] = 0; pel.pos[i] = pel.pos[i + 1] = pel.pos[i + 2] = -999; continue; }
      pel.pos[i] += _d.x * dt; pel.pos[i + 1] += _d.y * dt; pel.pos[i + 2] += _d.z * dt;
    }
    if (any || pelPts.userData.dirty) pelGeo.attributes.position.needsUpdate = true;
    pelPts.userData.dirty = any;
  }

  // ---------- items ----------
  function addItem(def, pos, quat, owner, second = false) {
    const obj = fixAdditive(def.make(second));
    obj.position.copy(pos);
    obj.quaternion.copy(quat);
    scene.add(obj);
    const it = { id: nextId++, def, pos: pos.clone(), quat: quat.clone(), invQuat: quat.clone().invert(), obj, owner, ph: (nextId * 1.618) % 6.28, data: { second }, born: time };
    S.items.push(it);
    return it;
  }
  function removeItem(it) {
    const i = S.items.indexOf(it);
    if (i < 0) return;
    S.items.splice(i, 1);
    scene.remove(it.obj);
    if (S.pending === it) S.pending = null;
    const o = it.data.partner;
    if (o) { o.data.partner = null; removeItem(o); }
    S.placed = S.placed.filter((x) => x !== it);
  }
  function clearCourse() { for (const it of [...S.items]) removeItem(it); }

  // ---------- physics hooks (called by the integrator in main.js) ----------
  const _field = new THREE.Vector3();
  function timeScale(b) {
    if (!b.gx) b.gx = { used: new Set(), hoops: new Set(), cd: new Map(), gadgetHits: 0, safe: 0, phaseItem: null, phased: false, popped: false };
    let s = 1;
    for (const it of S.items) if (it.def.timeScale) s = Math.min(s, it.def.timeScale(it, b, G));
    return s;
  }
  function fields(b, out) {
    if (!b.gx) return out;
    const k = b.law.fieldScale ?? 1; // cannonballs shrug, floaters get thrown about
    if (k !== 1) _field.set(0, 0, 0);
    const acc = k !== 1 ? _field : out;
    for (const it of S.items) {
      const f = it.def.field;
      if (f) f(it, b, acc, G);
    }
    if (k !== 1) out.addScaledVector(_field, k);
    return out;
  }
  function collide(b, cb) {
    if (!b.gx) return;
    const h0 = b.hits;
    for (const it of S.items) {
      const d = it.def;
      if (!d.collide) continue;
      const R = d.reach + b.r;
      const gx = b.gx;
      if (b.pos.distanceToSquared(it.pos) > R * R) {
        if (it === gx.phaseItem) gx.phased = true; // out the far side: solid from here on
        continue;
      }
      if (b.law.phase) { // the first solid gadget a phase ball reaches does not exist for it
        if (!gx.phaseItem) { gx.phaseItem = it; fx.burst(b.pos, '#b48cff', { count: 26, speed: 1, life: 0.4, gravity: 0 }); sfxGame('portal', b.pos); }
        if (it === gx.phaseItem) continue;
      }
      d.collide(it, b, cb, G);
      if (b.kill) break;
    }
    b.gx.gadgetHits += b.hits - h0;
  }
  function postStep(b) {
    if (!b.gx || b.kill) return;
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      if (!it) continue;
      const d = it.def;
      if (!d.post) continue;
      const R = d.reach + b.r;
      if (b.pos.distanceToSquared(it.pos) > R * R) continue;
      d.post(it, b, G);
      if (b.kill) return;
    }
    if (S.state === 'shoot' && S.target && S.shots.includes(b)) {
      _p.copy(b.pos).sub(S.target.pos).applyQuaternion(S.target.inv);
      if (Math.abs(_p.z) < b.r + 0.03 && _p.x * _p.x + _p.y * _p.y < (TARGET_R + b.r * 0.45) ** 2) scored(b);
    }
  }

  // ---------- flow ----------
  function say(title, lines, { footer = '', color = GOLD, modal = false, secs = 3 } = {}) {
    banner.paint(title + lines.join('|') + footer + color, (g, w, h) => drawBanner(g, w, h, { title, lines, footer, color }));
    banner.mesh.visible = true;
    bannerModal = modal;
    bannerUntil = modal ? Infinity : time + secs;
    bannerFresh = true;
  }
  function hush() { banner.mesh.visible = false; bannerModal = false; }
  const P = () => S.players[S.cur];

  function openMenu() {
    if (S.state !== 'menu' && S.state !== 'off') S.back = S.state;
    S.state = 'menu';
    dropGhost();
    say('TRICK SHOT', [
      'Two players, one headset. Build a course out of bad ideas, then try to shoot through it.',
      S.match ? 'A match is in progress.' : `${ROUNDS} rounds · ${SHOTS} shots a turn · fewer shots, more points.`,
    ], { footer: S.match ? 'TRIGGER resume · A new match · B sandbox' : 'TRIGGER start match · B free-fire sandbox', modal: true });
  }
  function newMatch() {
    clearCourse();
    api.clearAll();
    S.players.forEach((p) => { p.score = 0; p.cash = START_CASH; });
    S.steps = [{ type: 'build', p: 0, round: 0 }, { type: 'build', p: 1, round: 0 }];
    for (let r = 1; r <= ROUNDS; r++) for (const p of [0, 1]) {
      S.steps.push({ type: 'shoot', p, round: r });
      if (!(r === ROUNDS && p === 1)) S.steps.push({ type: 'build', p, round: r, income: INCOME });
    }
    S.step = -1; S.cur = 0; S.round = 0; S.match = true; S.note = '';
    S.state = 'setTee';
    S.tee = S.target = null;
    tee.visible = target.visible = false;
    say('PLACE THE TEE', ['Stand where shots will be taken from, with a decent view of the room.'], { footer: 'TRIGGER to plant it here', modal: true });
  }
  function resume() {
    hush();
    if (S.back === 'build' || S.back === 'shoot') S.state = S.back;
    else if (S.back === 'pass') { S.step--; advance(true); }
    else newMatch();
  }
  function advance(forcePass = false) {
    S.step++;
    S.shots = [];
    const st = S.steps[S.step];
    if (!st) return gameOver();
    const change = forcePass || st.p !== S.cur || S.step === 0;
    S.cur = st.p; S.round = st.round;
    const cash = P().cash + (st.income ?? 0);
    const what = st.type === 'build' ? 'BUILD' : 'SHOOT';
    const lines = st.type === 'build'
      ? [`You have $${cash}. Buy gadgets and leave them on the course.`, st.round === 0 ? 'Opening build: nobody has shot yet.' : 'Whatever you leave, they shoot through next. So do you, later.']
      : [`${SHOTS} shots from the tee. First-shot hit pays ${HIT_POINTS[0]}; every gadget your shot touches adds 50.`, 'A / B picks the ball. The clever ones cost money.'];
    if (change) {
      S.state = 'pass';
      say(`${P().name}: ${what}`, [S.step === 0 ? 'Player 1 has the headset.' : `Hand the headset to ${P().name}.`, ...lines], { footer: 'TRIGGER when ready', color: P().color, modal: true });
    } else {
      begin();
      say(`${P().name}: ${what}`, lines, { color: P().color, secs: 3.5 });
    }
  }
  function begin() {
    const st = S.steps[S.step];
    hush();
    S.state = st.type;
    S.note = '';
    if (st.income) P().cash += st.income;
    if (st.type === 'build') { S.placed = []; S.pending = null; S.sel = 0; S.dist = 1.2; S.yaw = 0; }
    else { S.shotsLeft = SHOTS; S.shotN = 0; S.ball = 0; api.clearAll(); }
  }
  function gameOver() {
    S.state = 'over';
    S.match = false;
    dropGhost();
    const [a, b] = S.players;
    // points decide it; money left in the bank only breaks ties, so hoarding is not a strategy
    const w = a.score !== b.score ? (a.score > b.score ? a : b) : a.cash !== b.cash ? (a.cash > b.cash ? a : b) : null;
    say(w ? `${w.name} WINS` : 'DEAD HEAT', [
      `${a.name}: ${a.score} points, $${a.cash} unspent`,
      `${b.name}: ${b.score} points, $${b.cash} unspent`,
      a.score === b.score && w ? 'Level on points. Thrift breaks the tie.' : '',
    ].filter(Boolean), { footer: 'TRIGGER for the menu', color: w ? w.color : GOLD, modal: true });
    sfxGame('win', G.headPos);
    if (S.target) for (let i = 0; i < 5; i++) fx.burst(_p.copy(S.target.pos).add(_v.randomDirection().multiplyScalar(0.5)), w ? w.color : GOLD, { count: 60, speed: 2.5, life: 1.1, gravity: -2 });
  }

  function scored(b) {
    const gx = b.gx;
    const base = HIT_POINTS[S.shotN - 1] ?? 100;
    const gadgets = Math.min(6, gx.used.size - gx.hoops.size) * 50;
    const hoops = gx.hoops.size * 100;
    const bank = b.hits - gx.gadgetHits > 0 ? (b.law.bank ?? 50) : 0;
    const total = base + gadgets + hoops + bank;
    P().score += total;
    const parts = [`shot ${S.shotN}: ${base}`];
    if (gadgets) parts.push(`gadgets +${gadgets}`);
    if (hoops) parts.push(`hoops +${hoops}`);
    if (bank) parts.push(`bank shot +${bank}`);
    S.note = `+${total}  (${parts.join(' · ')})`;
    say(`+${total}`, [parts.join(' · ')], { color: P().color, secs: 2.6 });
    target.userData.flash = 1;
    const c = S.target.pos;
    fx.burst(c, GOLD, { count: 90, speed: 3.2, life: 0.9, gravity: -3 });
    fx.burst(c, P().color, { count: 70, speed: 1.8, life: 1.2, gravity: -1 });
    fx.ripple(c, _v.set(0, 0, 1).applyQuaternion(S.target.quat), GOLD, 1.2, 0.9);
    sfxGame('score', c);
    api.pulse('right', 1, 120);
    for (const s of S.shots) end(s);
    S.shots = [];
    S.shotsLeft = 0;
    S.wait = { t: time + 2.6, then: advance };
  }
  function missed(why) {
    S.shots = [];
    S.note = `Shot ${S.shotN} ${why || 'missed'}.`;
    sfxGame('miss', G.headPos);
    if (S.shotsLeft <= 0) {
      S.note = 'Five shots, no hit. Zero points.';
      say('NO HIT', [`${P().name} scores nothing this turn.`], { color: P().color, secs: 2.4 });
      S.wait = { t: time + 2.4, then: advance };
    }
  }

  // main.js fired a shot for us
  function onFire(b, ray) {
    if (S.state !== 'shoot') return;
    S.shots = [b]; S.shotN++; S.shotsLeft--; S.shotWhy = ''; S.note = '';
    P().cash -= b.law.cost ?? 0;
    // curveball: spin axis is the gun's right side, so it swerves toward the gun's top
    if (ray) b.data.axis = new THREE.Vector3(1, 0, 0).applyQuaternion(ray.getWorldQuaternion(_q));
  }

  // ---------- build mode ----------
  function dropGhost() {
    if (ghost) { scene.remove(ghost.obj); ghost = null; }
    aim.visible = marker.visible = false;
  }
  function wantGhost(def, second) {
    if (!def || def.tool) { if (ghost) { scene.remove(ghost.obj); ghost = null; } return; }
    if (ghost && ghost.def === def && ghost.second === second) return;
    if (ghost) scene.remove(ghost.obj);
    const obj = fixAdditive(def.make(second));
    scene.add(obj);
    ghost = { def, second, obj, it: { id: 0, def, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), invQuat: new THREE.Quaternion(), obj, ph: 0, data: { second } } };
  }
  function holdPose(def, ray, outPos, outQuat) {
    ray.getWorldPosition(_o);
    ray.getWorldQuaternion(_q);
    _d.set(0, 0, -1).applyQuaternion(_q);
    outPos.copy(_o).addScaledVector(_d, S.dist);
    outPos.y = Math.max(0.06, outPos.y);
    if (def?.upright) outQuat.setFromAxisAngle(UP, Math.atan2(-_d.x, -_d.z));
    else outQuat.copy(_q);
    outQuat.multiply(_q2.setFromAxisAngle(UP, S.yaw));
  }
  function whyNot(def, pos) {
    if (def.cost > P().cash && !S.pending) return `Not enough cash for that. You have $${P().cash}.`;
    if (S.items.length >= MAX_ITEMS) return 'The course is full. Demolish something first.';
    if (pos.distanceToSquared(S.target.pos) < 0.3) return 'Too close to the target. Leave it half a metre.';
    if (Math.hypot(pos.x - S.tee.x, pos.z - S.tee.z) < 0.9 && pos.y < 2.3) return 'Keep the tee box clear.';
    if (S.pending && pos.distanceToSquared(S.pending.pos) < 0.5) return 'Put the blue end further from the orange one.';
    return '';
  }
  function pickItem() {
    let best = null, bd = 0.3;
    for (const it of S.items) {
      _p.subVectors(it.pos, _o);
      const t = _p.dot(_d);
      if (t < 0.1) continue;
      const d = _p.addScaledVector(_d, -t).length();
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function build(inp, ray, dt) {
    // browse
    let s = S.sel;
    if (inp.next) s = (s + 1) % CELLS.length;
    if (inp.prev) s = (s + CELLS.length - 1) % CELLS.length;
    if (inp.right) s = Math.min(CELLS.length - 1, s + 1);
    if (inp.left) s = Math.max(0, s - 1);
    if (inp.down && s + COLS < CELLS.length) s += COLS;
    if (inp.up && s - COLS >= 0) s -= COLS;
    if (s !== S.sel && !S.pending) { S.sel = s; S.note = ''; sfxGame('tick', G.headPos); }
    S.dist = THREE.MathUtils.clamp(S.dist - inp.ry * dt * 2.2 * Math.max(0.6, S.dist * 0.6), 0.25, 6);
    S.yaw -= inp.rx * dt * 2.4;

    const cell = CELLS[S.sel];
    const def = cell.done ? null : ITEMS[S.sel];
    const second = !!S.pending;
    wantGhost(def, second);
    ray.getWorldPosition(_o);
    ray.getWorldQuaternion(_q);
    _d.set(0, 0, -1).applyQuaternion(_q);
    aim.visible = marker.visible = !!def;

    if (inp.undo) undo();

    if (!def) { // DONE
      if (inp.trigger) {
        if (S.pending) { P().cash += S.pending.def.cost; removeItem(S.pending); }
        dropGhost();
        sfxGame('done', G.headPos);
        advance();
      }
      return;
    }
    if (def.tool) { // demolition: point at a gadget
      const it = pickItem();
      aim.position.copy(_o); aim.quaternion.copy(_q); aim.scale.z = it ? _p.subVectors(it.pos, _o).length() : 3;
      aim.material.color.set(0xff5d5d);
      marker.visible = !!it;
      if (it) { marker.position.copy(it.pos); marker.quaternion.copy(world.camera.quaternion); marker.scale.setScalar(2.2 + Math.sin(time * 10) * 0.2); marker.material.color.set(0xff5d5d); }
      if (inp.trigger) {
        if (!it) S.note = 'Point at a gadget to demolish it.';
        else if (def.cost > P().cash) { S.note = `Not enough cash. You have $${P().cash}.`; sfxGame('deny', G.headPos); }
        else {
          P().cash -= def.cost;
          fx.burst(it.pos, '#ffb060', { count: 80, speed: 3, life: 0.6, gravity: -2 });
          sfxGame('boom', it.pos);
          removeItem(it);
          S.note = '';
        }
      }
      return;
    }
    const g = ghost.it;
    holdPose(def, ray, g.pos, g.quat);
    g.invQuat.copy(g.quat).invert();
    ghost.obj.position.copy(g.pos);
    ghost.obj.quaternion.copy(g.quat);
    def.update?.(g, G);
    const no = whyNot(def, g.pos);
    aim.position.copy(_o); aim.quaternion.copy(_q); aim.scale.z = S.dist;
    aim.material.color.set(no ? 0xff5d5d : 0x8dff9a);
    marker.position.copy(g.pos); marker.quaternion.copy(g.quat); marker.scale.setScalar(1);
    marker.material.color.set(no ? 0xff5d5d : 0x8dff9a);
    if (!inp.trigger) return;
    if (no) { S.note = no; sfxGame('deny', G.headPos); api.pulse('right', 0.3, 60); return; }
    const it = addItem(def, g.pos, g.quat, S.cur, second);
    fx.burst(it.pos, def.color, { count: 30, speed: 1.2, life: 0.45, gravity: 0 });
    sfxGame('place', it.pos);
    api.pulse('right', 0.6, 40);
    if (def.pair && !second) { P().cash -= def.cost; S.pending = it; S.note = 'Now place the blue end.'; S.placed.push(it); }
    else if (second) { it.data.partner = S.pending; S.pending.data.partner = it; S.pending = null; S.note = ''; }
    else { P().cash -= def.cost; S.placed.push(it); S.note = ''; }
  }
  function undo() {
    const it = S.placed.pop();
    if (!it) { S.note = 'Nothing of yours to undo this turn.'; return; }
    P().cash += it.def.cost;
    fx.burst(it.pos, it.def.color, { count: 20, speed: 1, life: 0.4, gravity: 0 });
    sfxGame('undo', it.pos);
    removeItem(it);
    S.note = `Refunded $${it.def.cost}.`;
  }

  // ---------- per frame ----------
  function readInput() {
    const pads = world.input.xr.gamepads;
    const R = pads.right, L = pads.left;
    const ax = R?.getAxesValues('xr-standard-thumbstick');
    const inp = {
      trigger: !!R?.getButtonDown('xr-standard-trigger'),
      next: !!R?.getButtonDown('a-button'),
      prev: !!R?.getButtonDown('b-button'),
      undo: !!L?.getButtonDown('y-button'),
      menu: !!L?.getButtonDown('xr-standard-trigger'),
      left: !!L?.getAxesEnteringLeft('xr-standard-thumbstick'),
      right: !!L?.getAxesEnteringRight('xr-standard-thumbstick'),
      up: !!L?.getAxesEnteringUp('xr-standard-thumbstick'),
      down: !!L?.getAxesEnteringDown('xr-standard-thumbstick'),
      rx: Math.abs(ax?.x ?? 0) > 0.25 ? ax.x : 0,
      ry: Math.abs(ax?.y ?? 0) > 0.25 ? ax.y : 0,
    };
    for (const k in inject) { inp[k] = inject[k]; delete inject[k]; }
    return inp;
  }

  const FLAGS_FREE = { fire: true, cycle: true, clear: true };
  const FLAGS_NONE = { fire: false, cycle: false, clear: false };
  const FLAGS_SHOOT = { fire: true, cycle: false, clear: false };

  // env: { headPos, headFwd, raySpace, ready, presenting }
  function frame(dt, t, env) {
    time = t; G.time = t; G.dt = dt; G.headPos.copy(env.headPos);
    for (const it of S.items) {
      it.def.update?.(it, G);
      const a = (t - it.born) * 4;
      if (a < 1.2) it.obj.scale.setScalar(a < 1 ? 1 - (1 - a) ** 3 : 1); // pop in
    }
    updatePellets(dt);
    animate(dt, t, env);

    if (!env.presenting || !env.ready) { // not in the headset, or the room is being (re)scanned
      if (S.state !== 'off') { if (S.state !== 'menu') S.back = S.state; S.state = 'off'; hush(); dropGhost(); }
      layoutUI(env);
      return FLAGS_FREE;
    }
    if (S.state === 'off') {
      if (S.match && (S.back === 'build' || S.back === 'shoot' || S.back === 'pass')) resume();
      else { S.state = 'menu'; openMenu(); }
    }
    const inp = readInput();
    if (inp.menu && S.state !== 'menu' && !S.wait) { openMenu(); sfxGame('tick', G.headPos); layoutUI(env); return FLAGS_NONE; }
    if (S.wait) {
      if (t >= S.wait.t) { const f = S.wait.then; S.wait = null; f(); }
      layoutUI(env);
      return FLAGS_NONE;
    }
    let flags = FLAGS_NONE;
    switch (S.state) {
      case 'menu':
        if (inp.trigger) { if (S.match) resume(); else newMatch(); }
        else if (inp.next && S.match) newMatch();
        else if (inp.prev) { S.state = 'sandbox'; hush(); say('SANDBOX', ['Free fire. Left trigger brings the menu back.'], { secs: 2.5 }); }
        break;
      case 'sandbox':
        flags = FLAGS_FREE;
        break;
      case 'setTee':
        if (inp.trigger) {
          S.tee = new THREE.Vector3(env.headPos.x, 0, env.headPos.z);
          tee.position.set(S.tee.x, 0.012, S.tee.z);
          tee.visible = true;
          S.state = 'setTarget';
          S.dist = 3;
          sfxGame('place', S.tee);
          say('PLACE THE TARGET', ['Aim where it should float. Right stick pushes it away or pulls it in.', 'At least 1.5 m from the tee.'], { footer: 'TRIGGER to fix it', modal: true });
        }
        break;
      case 'setTarget': {
        holdPose(null, env.raySpace, _p, _q2);
        _p.y = THREE.MathUtils.clamp(_p.y, 0.35, 2.6);
        S.dist = THREE.MathUtils.clamp(S.dist - inp.ry * dt * 2.5, 0.8, 8);
        const ok = Math.hypot(_p.x - S.tee.x, _p.z - S.tee.z) >= 1.5;
        target.visible = true;
        target.position.copy(_p);
        target.quaternion.setFromAxisAngle(UP, Math.atan2(S.tee.x - _p.x, S.tee.z - _p.z));
        aim.visible = true; aim.position.copy(_o); aim.quaternion.copy(_q); aim.scale.z = _o.distanceTo(_p);
        aim.material.color.set(ok ? 0x8dff9a : 0xff5d5d);
        if (inp.trigger) {
          if (!ok) sfxGame('deny', G.headPos);
          else {
            S.target = { pos: _p.clone(), quat: target.quaternion.clone(), inv: target.quaternion.clone().invert() };
            aim.visible = false;
            jumbo.position.copy(S.target.pos).y += TARGET_R + 0.42;
            jumbo.quaternion.copy(S.target.quat);
            sfxGame('place', S.target.pos);
            fx.burst(S.target.pos, GOLD, { count: 50, speed: 1.6, life: 0.6, gravity: 0 });
            advance();
          }
        }
        break;
      }
      case 'pass':
        if (inp.trigger) { sfxGame('done', G.headPos); begin(); }
        break;
      case 'build':
        build(inp, env.raySpace, dt);
        break;
      case 'shoot': {
        const inTee = Math.hypot(env.headPos.x - S.tee.x, env.headPos.z - S.tee.z) < TEE_R;
        S.inTee = inTee;
        steer.set(0, 0, 0);
        if (S.shots.length) {
          for (const b of [...S.shots]) {
            if (b.kill || !bodies.includes(b)) { S.shots.splice(S.shots.indexOf(b), 1); continue; }
            if (inp.undo) end(b, 'called off');
            else if (b.age > SHOT_TIMEOUT) end(b, 'ran out of time');
            else if (b.idle > 0.9) end(b, 'came to rest');
            else if (b.law.split && !b.noSplit && b.age > 0.33) { // scatter: two more, fanned out sideways
              b.noSplit = true;
              for (const a of [-0.2, 0.2]) {
                _v.copy(b.vel).applyAxisAngle(UP, a);
                const nb = api.fire(b.pos, _v, b.law, _v.length());
                nb.noSplit = true;
                S.shots.push(nb);
              }
              fx.burst(b.pos, b.law.color, { count: 30, speed: 1.5, life: 0.35, gravity: 0 });
              sfxGame('tick', b.pos);
            } else if (b.law.key === 'guided') { // stick steers across your view
              _r.crossVectors(env.headFwd, UP).normalize();
              steer.copy(_r).multiplyScalar(inp.rx).addScaledVector(_v.crossVectors(_r, env.headFwd), -inp.ry);
            }
          }
          if (!S.shots.length) missed(S.shotWhy);
        } else if (S.shotsLeft > 0) {
          if (inp.next || inp.prev) { S.ball = (S.ball + (inp.next ? 1 : BALLS.length - 1)) % BALLS.length; S.note = ''; sfxGame('tick', G.headPos); }
          const broke = BALLS[S.ball].cost > P().cash;
          flags = inTee && !broke ? FLAGS_SHOOT : FLAGS_NONE;
          if (inp.trigger && !inTee) { S.note = 'Back to the tee to shoot.'; sfxGame('deny', G.headPos); }
          else if (inp.trigger && broke) { S.note = `${BALLS[S.ball].name} costs $${BALLS[S.ball].cost}. You have $${P().cash}.`; sfxGame('deny', G.headPos); }
        }
        break;
      }
      case 'over':
        if (inp.trigger) openMenu();
        break;
    }
    layoutUI(env);
    return flags;
  }

  function animate(dt, t, env) {
    if (target.visible) {
      const u = target.userData;
      u.halo.rotation.z = t * 0.8;
      u.flash = Math.max(0, u.flash - dt * 1.5);
      const bob = S.target ? Math.sin(t * 1.3) * 0.015 : 0;
      if (S.target) target.position.set(S.target.pos.x, S.target.pos.y + bob, S.target.pos.z);
      target.scale.setScalar(1 + u.flash * 0.5 * Math.sin(u.flash * 20));
    }
    if (tee.visible) {
      tee.material.color.set(S.state === 'shoot' || S.state === 'build' || S.state === 'pass' ? P().color : GOLD);
      const call = S.state === 'shoot' && !S.inTee; // "come back here"
      tee.material.opacity = call ? 0.55 + 0.45 * Math.sin(t * 7) : 0.7;
      tee.rotation.z = t * 0.2;
    }
  }

  function layoutUI(env) {
    // banner: floats ahead of you, catches up when you turn away
    if (banner.mesh.visible) {
      if (time > bannerUntil) banner.mesh.visible = false;
      else {
        _v.set(env.headFwd.x, 0, env.headFwd.z);
        if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
        _v.normalize().multiplyScalar(bannerModal ? 1.25 : 1.5).add(env.headPos);
        _v.y = env.headPos.y + (bannerModal ? -0.05 : 0.32);
        if (bannerFresh) { banner.mesh.position.copy(_v); bannerFresh = false; }
        else if (banner.mesh.position.distanceToSquared(_v) > 0.2) banner.mesh.position.lerp(_v, Math.min(1, G.dt * 3));
        banner.mesh.lookAt(env.headPos);
      }
    }
    // tablet on the left controller
    const showShop = S.state === 'build';
    const showScore = S.state === 'shoot' || S.state === 'over' || (S.state === 'pass' && S.step > 0);
    const grip = world.player.gripSpaces?.left;
    if (grip && tablet.mesh.parent !== grip) grip.add(tablet.mesh);
    tablet.mesh.visible = showShop || showScore;
    jumbo.visible = showScore && !!S.target;
    if (!tablet.mesh.visible) return;
    const st = S.steps[S.step] ?? {};
    const common = {
      players: S.players, cur: S.cur,
      roundText: st.round ? `round ${st.round} of ${ROUNDS}` : 'opening build',
    };
    if (showShop) {
      const sig = `shop|${S.cur}|${P().cash}|${S.sel}|${S.note}|${S.items.length}|${st.round}`;
      tablet.paint(sig, (g, w, h) => drawShop(g, w, h, {
        ...common, phase: 'BUILD', cells: CELLS, sel: S.sel, note: S.note, count: S.items.length, max: MAX_ITEMS,
        hint: 'L stick / A B: browse · R stick: distance, turn · trigger: place · Y: undo',
      }));
    } else {
      const sig = `score|${S.cur}|${S.players[0].score}|${S.players[1].score}|${S.players[0].cash}|${S.players[1].cash}|${S.shotsLeft}|${S.note}|${S.state}|${st.round}|${S.shots.length > 0}`;
      tablet.paint(sig, (g, w, h) => drawScore(g, w, h, {
        ...common, phase: S.state === 'over' ? 'FINAL' : 'SHOOT', shotsMax: SHOTS, shotsLeft: S.shotsLeft,
        shotsText: S.shots.length ? 'shot in flight…' : `${S.shotsLeft} left`,
        note: S.note || (S.state === 'shoot' ? `Next hit pays ${HIT_POINTS[Math.min(S.shotN, SHOTS - 1)]} plus style.` : ''),
        hint: 'trigger: fire · A B: change ball · Y: call off a shot · L trigger: menu',
      }));
    }
  }

  // one line for the little screen on the gun
  function status() {
    switch (S.state) {
      case 'menu': return 'TRICK SHOT · trigger to start';
      case 'setTee': return 'stand on your tee spot · trigger';
      case 'setTarget': return 'aim the target · stick = distance · trigger';
      case 'pass': return `${P().name}: trigger when ready`;
      case 'build': return `${P().name} BUILD · $${P().cash} · shop is on your left hand`;
      case 'shoot':
        if (S.shots.length) return S.shots[0].law.key === 'guided' ? 'right stick steers · Y calls it off' : `${P().name} · shot ${S.shotN} of ${SHOTS} in flight · Y calls it off`;
        if (S.wait) return `${P().name} · ${S.note}`;
        return S.inTee ? `${P().name} · shot ${S.shotN + 1} of ${SHOTS} · $${P().cash} · A/B ball` : `${P().name} · back to the tee to shoot`;
      case 'over': return 'match over · trigger for menu';
      case 'sandbox': return null;
      default: return null;
    }
  }

  // one of every gadget, for shader warm-up
  function warmObjects(group) {
    for (const d of ITEMS) if (d.make) { group.add(d.make(false)); if (d.pair) group.add(d.make(true)); }
    for (const b of BALLS) group.add(b.make().root);
  }
  const busy = () => S.match && S.state !== 'menu' && S.state !== 'sandbox' && S.state !== 'off';

  return {
    warm: warmObjects, busy, BALLS,
    // what the gun is loaded with during a turn at the tee (null: the sandbox's laws)
    ammo: () => (S.state === 'shoot' ? { law: BALLS[S.ball], i: S.ball, n: BALLS.length } : null),
    S, G, ITEMS, inject, frame, onFire, status, timeScale, fields, collide, postStep,
    addItem, removeItem, clearCourse, newMatch, advance, begin, openMenu,
    get banner() { return banner.sig; },
  };
}
