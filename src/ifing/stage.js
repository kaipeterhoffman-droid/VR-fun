// Stage: the five places the river was made for, and the small things between them. Each place is built by its own
// file (naust.js, ironwood.js, ve.js, glasir.js, well.js); this one gives them what they share and runs them.
import * as THREE from 'three';
import { makePaint } from './paint.js';
import { woodSheet, runeSheet } from './art.js';
import { Builder } from './build.js';
import { buildNaust } from './naust.js';
import { buildIronwood } from './ironwood.js';
import { buildVe } from './ve.js';
import { buildGlasir } from './glasir.js';
import { buildLife } from './life.js';

export function buildStage({ world, glows, water, engine }) {
  const two = { side: THREE.DoubleSide };
  const mats = {
    // stone that the moss has found; stone that it has not; worked wood; things painted corner by corner
    stone: makePaint({ brush: 0.34, brushScale: 0.4, top: { color: '#55702c', from: 0.5, to: 0.92, amount: 0.85 }, wet: 0.25, ...two, inside: 0.7 }),
    bare: makePaint({ brush: 0.3, brushScale: 0.4, wet: 0.2, ...two, inside: 0.8 }),
    wood: makePaint({ map: woodSheet(), brush: 0.16, brushScale: 0.5, ...two, inside: 0.8 }),
    plain: makePaint({ brush: 0.22, brushScale: 0.45, ...two, inside: 0.7 }),
    runes: makePaint({ map: runeSheet(), cutout: true, alphaTest: 0.5, brush: 0, ...two, inside: 1 }),
  };
  const ctx = {
    world, glows, water, engine, mats,
    clearings: [], obstacles: [], lights: [], ticks: [], planters: [], wallGaps: [], sounds: [], hits: [], lamps: [],
    /** Put what a builder holds into the world as one drawing, in the section at s (null: always there). */
    mesh(b, mat, s, mirror = true, opts = {}) {
      if (!b.nv) return null;
      const m = new THREE.Mesh(b.build({ uv: opts.uv !== false, bend: !!opts.bend }), mat); m.name = opts.name || 'piece';
      if (opts.order !== undefined) m.renderOrder = opts.order;
      world.add(m, s, mirror);
      return m;
    },
    /**
     * Something that stands at `pos` and keeps sounding, to be heard within `reach` metres (src/ifing/audio.js knows
     * what each kind sounds like). The piece that owns it sets its level, 0..1. awe: the reach's chord opens to it.
     */
    voice(kind, pos, reach, awe = false) { const v = { kind, pos, reach, awe, level: 0, node: null }; this.sounds.push(v); return v; },
    /** Something that happens once, at `pos`. (Nothing is kept if nobody is listening.) */
    hit(kind, pos, power = 1) { if (this.hits.length < 24) this.hits.push({ kind, x: pos.x, y: pos.y, z: pos.z, power }); },
    /** Runes that give light: a material of their own, whose brightness the piece that owns them turns up and down. */
    litRunes(color) {
      const m = makePaint({ map: runeSheet(), cutout: true, alphaTest: 0.5, brush: 0, color: '#20242c', emissive: color, emissiveIntensity: 1, ...two, inside: 1 });
      m.userData.color = new THREE.Color(color); m.userData.set = (k) => m.uniforms.uEmissive.value.copy(m.userData.color).multiplyScalar(k);
      return m;
    },
  };
  buildNaust(ctx);
  buildIronwood(ctx);
  buildVe(ctx);
  buildGlasir(ctx);
  buildLife(ctx);
  return {
    clearings: ctx.clearings, obstacles: ctx.obstacles, lights: ctx.lights, sounds: ctx.sounds, hits: ctx.hits, ctx,
    /** Once the forest stands: the pieces that need its trees (a lone birch, a giant spruce) plant them. */
    plant(forest) { ctx.forest = forest; for (const p of ctx.planters) p(forest); },
    update(dt, time, boat, look, eye) { ctx.hits.length = 0; for (const t of ctx.ticks) t(dt, time, boat, look, eye); },
  };
}
