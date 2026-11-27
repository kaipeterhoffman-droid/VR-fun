// Ífing: a river through a forest out of the old North, by canoe.
import * as THREE from 'three';
import { Engine } from './engine.js';
import { World } from './world.js';
import { Sky } from './sky.js';
import { Water } from './water.js';
import { shared, applyLights } from './paint.js';
import { brushTile } from './art.js';
import { buildLand } from './land.js';
import { buildForest } from './forest.js';
import { blankLook, lookAt, applyLook, sightOf } from './look.js';
import { Builder } from './build.js';
import { Glows } from './fx.js';
import { Boat, EYE } from './boat.js';
import { buildStage } from './stage.js';
import { START } from './naust.js';
import { river } from './river.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const el = (id) => document.getElementById(id);
const progress = (f, text) => { const bar = el('bar'); if (bar) bar.firstElementChild.style.width = Math.round(f * 100) + '%'; if (text && el('enter')) el('enter').textContent = text; };
const breathe = () => new Promise((r) => setTimeout(r, 0));

async function begin() {
  const engine = new Engine(el('scene'));
  const { scene, camera, renderer } = engine;
  shared.tBrush.value = brushTile();
  const world = new World(scene);
  const sky = new Sky(); scene.add(sky.mesh);
  const water = new Water(renderer); scene.add(water.mesh);
  const glows = new Glows(); scene.add(glows.mesh); world.mirror.add(glows.twin);
  progress(0.1); await breathe();
  const lineup = Q.has('lineup');
  const stage = lineup ? null : buildStage({ world, glows, water, engine });
  progress(0.25); await breathe();
  buildLand(world, stage ? stage.ctx.wallGaps : []);
  progress(0.45); await breathe();
  const forest = buildForest(world, { lineup, clearings: stage ? stage.clearings : [] });
  if (lineup) {
    // a row of every model, for looking at their shapes: ?lineup=spruce|pine|birch|gold|snag&lod=0
    const kind = Q.get('lineup') || 'spruce', lod = num('lod', 0), set = forest.T[kind] || forest.T.spruce;
    set.forEach((tpl, i) => {
      const m = new THREE.Matrix4().makeTranslation((i - (set.length - 1) / 2) * num('gap', 9), 0, -num('far', 22));
      const b = new Builder(); const t = tpl[lod]; b.add(t.solid, m);
      world.add(new THREE.Mesh(b.build({ uv: false }), forest.solidMat), null, true);
      if (t.cut) { const c = new Builder(); c.add(t.cut, m, kind === 'birch' ? [0.4, 0.45, 0.3] : null); world.add(new THREE.Mesh(c.build(), forest.cutMat), null, true); }
      if (t.bark) { const c = new Builder(); c.add(t.bark, m); world.add(new THREE.Mesh(c.build({ bend: false }), forest.barkMat), null, true); }
    });
  }
  if (stage) stage.plant(forest);
  progress(0.9); await breathe();

  const boat = new Boat({ engine, world, water, glows });
  if (stage) boat.obstacles = stage.obstacles;
  const look = blankLook();
  const preview = Q.has('s') || Q.has('shot') || lineup;                // a still for looking at: the boat is put where asked and held there
  boat.place(START.s, START.d, START.turn);
  if (Q.has('from')) boat.place(num('from', START.s), 0, 0);            // ?from=380: set off from further down the river, to try one reach
  if (preview) { boat.frozen = true; if (Q.has('s')) boat.place(num('s', 2), num('d', 0), num('turn', 0) * Math.PI / 180); boat.view.yaw = num('yaw', 0) * Math.PI / 180; boat.view.pitch = num('pitch', 0) * Math.PI / 180; }
  if (Q.has('noboat')) { boat.group.visible = false; for (const o of boat.oars) o.mesh.visible = false; boat.glow.on = 0; }
  let time = num('t', 0);
  const eyeY = num('eye', EYE), eyeW = new THREE.Vector3(), camAt = Q.has('cam') ? Q.get('cam').split(',').map(Number) : null;      // ?cam=x,y,z: look at her from outside

  engine.start((dt) => {
    time += dt; shared.uTime.value = time;
    lookAt(boat.s, look);
    boat.update(dt, time, look);
    if (!engine.presenting && eyeY !== EYE) camera.position.y = eyeY;
    if (!engine.presenting && camAt) camera.position.fromArray(camAt);
    camera.getWorldPosition(eyeW);
    if (stage) { stage.update(dt, time, boat, look, eyeW); applyLights(stage.lights, eyeW); }
    applyLook(look, sky, water);
    const sight = sightOf(look);
    world.update(boat.s, sight, Math.min(sight, 200));
    glows.update();
    sky.update(dt);
    water.update(renderer, boat.pos.x, boat.pos.y, dt);
    if (engine.frames === 6) window.__ready = true;
  });
  if (Q.has('nomirror')) world.mirrorOn = false;
  if (Q.has('noripple')) water.ripples.ok = false;
  if (Q.has('nowater')) water.mesh.visible = false;
  window.__ifing = { engine, world, look, water, sky, boat, stage, glows, river };

  // ---- looking about with the mouse, outside the headset
  const dom = renderer.domElement; let drag = null;
  dom.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointerup', () => { drag = null; });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return;
    boat.view.yaw += (e.clientX - drag[0]) * 0.004; boat.view.pitch = Math.max(-1.3, Math.min(1.3, boat.view.pitch + (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY];
  });

  // ---- the way in
  progress(1);
  const enter = el('enter'), card = el('card');
  const vr = await engine.vrSupported();
  if (enter) {
    enter.disabled = false; enter.textContent = vr ? 'Enter the river' : 'Begin';
    enter.addEventListener('click', async () => {
      if (vr) { try { boat.seat.set = false; await engine.enterVR(Q.has('sharp') ? num('sharp', 1.35) : null, num('fov', 0.5)); } catch (e) { console.warn('could not enter VR', e); } }
      card.classList.add('gone');
    });
    engine.onExit = () => { card.classList.remove('gone'); };
  }
  if (preview && card) card.style.display = 'none';
}
begin();
