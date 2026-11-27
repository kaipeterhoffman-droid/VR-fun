// Audio: what the rider hears. The sounds themselves are made in src/ifing/sounds.js; this file is the mixing desk
// and the ear. It costs the picture nothing: all of it runs on the browser's audio thread.
//
//   the bed    far water either side, the banks talking, wind in the wood (more of it in the needles of the Ironwood)
//   the hull   the river patting her planks, the bow parting it once she has way on
//   the oars   each blade is a place in the world: the catch, the pull, the drops that fall from it after
//   the world  things that stand somewhere and are heard from there (src/ifing/stage.js: voice, hit)
//   the tone   one held chord to a reach, very low, that opens when something great is near
//   the room   a wooded valley for all of it to sound in; a cave of it under the root
//
// Every level here was set by measurement (each layer rendered alone and metered), not by ear: see K.
import { composeSounds, SR } from './sounds.js';
import { river } from './river.js';
import { clamp, smooth, rng, gustAt } from './noise.js';

const TAU = Math.PI * 2;
const NOTE = { D2: 73.42, A2: 110, D3: 146.83, F3: 174.61, Fs3: 185, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440, B4: 493.88, E5: 659.26 };
/** What each reach sounds like: how much water, how much of the wind is needles, how big the room, what chord it holds. */
const REACH = {
  naust: { water: 1.0, needles: 0.5, room: 0.3, owl: 0.6, lyre: 0, chord: { D3: 0.5, A3: 0.45, E4: 0.2 } },
  iron: { water: 0.7, needles: 1.0, room: 0.5, owl: 1.0, lyre: 0, chord: { D2: 0.8, A2: 0.5, D3: 0.3, F3: 0.35 } },
  ve: { water: 0.5, needles: 0.3, room: 0.42, owl: 0.2, lyre: 0.7, chord: { D3: 0.3, A3: 0.4, E4: 0.45, B4: 0.28 } },
  glasir: { water: 0.6, needles: 0.2, room: 0.42, owl: 0, lyre: 0, chord: { D3: 0.5, Fs3: 0.45, A3: 0.5, E4: 0.3, Fs4: 0.2 } },
  arch: { water: 0.3, needles: 0, room: 1.0, owl: 0, lyre: 0, chord: { D2: 0.9, A2: 0.25 } },
  well: { water: 0.25, needles: 0.05, room: 0.6, owl: 0, lyre: 1.0, chord: { D3: 0.5, A3: 0.5, D4: 0.4, Fs4: 0.35, A4: 0.25, E5: 0.12 } },
};
/** The desk: how loud each thing is against the rest. */
export const K = {
  river: 0.135, banks: 0.27, wind: 0.28, needles: 0.2, room: 0.34,
  lap: 0.11, glug: 0.16, bow: 0.22, wash: 0.2,
  swish: 0.5, oarBubbles: 0.22, splash: 0.34, thunk: 0.1, drip: 0.1, bump: 0.5,
  tone: 0.022, lyre: 0.1, owl: 0.1, touch: 0.07,
  fire: 1.15, breath: 1.3, gold: 0.6, goldBed: 0.14, tree: 0.1, ship: 0.38, pluck: 0.26,
  gust: 0.32, plunge: 0.6, drop: 0.22, groan: 0.5, horn: 0.14, croak: 0.15, fish: 0.2, launch: 0.3, wing: 0.4,
};
/** The notes a lyre may pick, as speeds of the one string that was made (which is D): cold fifths for the mere, and the well's own. */
const SCALE = { ve: [0.749, 0.8409, 1, 1.1225, 1.4983], well: [0.5, 0.749, 1, 1.26, 1.4983, 2] };

let T = 0;                                                           // the desk's clock, read once a frame
function aim(p, v, tau = 0.08) {                                    // lean a knob toward a value, unless it is there already
  if (Math.abs(v - (p._v === undefined ? 1e9 : p._v)) < 1e-4 + Math.abs(v) * 0.01) return;
  p._v = v; p.setTargetAtTime(v, T, tau);
}
/** How much of a thing `reach` metres can be heard at d: full within an eighth of its reach, gone at its edge. */
const fall = (d, reach) => clamp(reach * 0.125 / Math.max(d, reach * 0.125)) * (1 - smooth(reach * 0.55, reach, d));

export class Sound {
  constructor({ quiet = false, volume = 1 } = {}) {
    this.S = null; this.ctx = null; this.quiet = quiet; this.volume = volume; this.rnd = rng(9);
    this.frame = 0; this.awe = 0; this.bumped = 0; this.owlIn = 9; this.lyreIn = 6; this.dropIn = 1; this.beat = 0;
    addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.mute(!this.quiet); });
  }

  /** Make the sounds while the river is being painted: on a thread of their own where the browser has one to give, else here, a few at a time. */
  compose(pause) {
    return new Promise((done) => {
      const here = () => composeSounds(pause).then((S) => { this.S = S; done(); });
      try {
        const w = new Worker(new URL('./sounds.worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => { this.S = e.data; w.terminate(); done(); };
        w.onerror = () => { w.terminate(); here(); };
      } catch { here(); }
    });
  }

  /** Begin. A browser lets a page be heard only once somebody has touched it, so this is called from that touch. */
  start(given = null) {
    if (this.ctx || !this.S) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!given && !AC) return;
    const ctx = this.ctx = given || new AC({ latencyHint: 'interactive' }), S = this.S, B = this.B = {};
    for (const k in S) { if (k.startsWith('room')) continue; const b = ctx.createBuffer(1, S[k].length, SR); b.copyToChannel(S[k], 0); B[k] = b; }
    // the room has to be told at the desk's own speed, whatever that is on this machine
    const room = ctx.createBuffer(2, Math.round(S.roomL.length * ctx.sampleRate / SR), ctx.sampleRate), step = SR / ctx.sampleRate;
    [S.roomL, S.roomR].forEach((x, c) => {
      const out = room.getChannelData(c); let e = 0;
      for (let i = 0; i < out.length; i++) { const p = i * step, j = Math.floor(p), t = p - j; out[i] = (x[j] || 0) * (1 - t) + (x[j + 1] || 0) * t; e += out[i] * out[i]; }
      const g = 1 / Math.sqrt(e); for (let i = 0; i < out.length; i++) out[i] *= g;
    });
    const G = this.G = (v = 1, to = null) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filt = (type, f, q, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(to); return b; };
    const pan = (v, to) => { const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(to); return p; };
    const loop = this.loop = (name, to, rate = 1, at = 0) => { const s = ctx.createBufferSource(); s.buffer = B[name]; s.loop = true; s.playbackRate.value = rate; s.connect(to); s.start(0, Math.abs(at) % s.buffer.duration); return s; };
    this.filt = filt;

    // ---- the way out: everything, pressed a little where it is loudest, then the one knob
    this.out = G(0, ctx.destination);
    const press = ctx.createDynamicsCompressor(); press.threshold.value = -16; press.knee.value = 12; press.ratio.value = 4; press.attack.value = 0.012; press.release.value = 0.3; press.connect(this.out);
    this.master = G(1, press);
    const verb = ctx.createConvolver(); verb.normalize = false; verb.buffer = room; this.wet = G(K.room * 0.3, this.master); verb.connect(this.wet); this.room = G(1, verb);
    const bus = (send) => { const b = { in: G(1), send: G(send, this.room) }; b.in.connect(this.master); b.in.connect(b.send); return b; };
    this.bed = bus(0.12); this.hull = bus(0.1); this.world = bus(0.45); this.tone = bus(0.9); this.far = bus(1.5);

    // ---- the bed
    this.river = [-1, 1].map((sd, i) => { const g = G(0, pan(sd * 0.85, this.bed.in)); loop(i ? 'pinkR' : 'pinkL', filt('bandpass', i ? 820 : 640, 0.5, g), 1, i * 1.7); return g; });
    this.banks = [['brook', -0.55, 0.93], ['trickle', 0.6, 1.0], ['brook', 0.3, 1.21]].map(([n, p, r], i) => { const g = G(0, pan(p, this.bed.in)); loop(n, g, r, i * 2.3); return g; });
    this.wind = [-1, 1].map((sd, i) => { const g = G(0, pan(sd * 0.7, this.bed.in)), f = filt('bandpass', 500, 0.9, g); loop(i ? 'pinkL' : 'pinkR', f, 0.9 + i * 0.13, 2.9 + i); return { g, f }; });
    this.needles = [-1, 1].map((sd, i) => { const g = G(0, pan(sd * 0.4, this.bed.in)); loop(i ? 'pinkR' : 'pinkL', filt('highpass', 2600, 0.7, g), 1.07, 0.6 + i * 3); return g; });

    // ---- the hull
    this.lap = G(0, this.hull.in); loop('lap', this.lap);
    this.glug = G(0, this.hull.in); loop('glug', this.glug);
    this.bow = G(0, this.hull.in); loop('trickle', this.bow, 0.9, 3.1);
    this.wash = { g: G(0, this.hull.in) }; this.wash.f = filt('bandpass', 600, 0.6, this.wash.g); loop('pinkL', this.wash.f, 1.21, 4);

    // ---- the oars: each a place in the world, which the blade's tip carries about
    this.oars = [0, 1].map((n) => {
      const p = this.place(null, this.hull.in, true), sw = G(0, p), f = filt('bandpass', 520, 0.7, sw), bub = G(0, p);
      loop(n ? 'pinkR' : 'pinkL', f, 0.8 + n * 0.09, n * 2.2); loop('brook', bub, 1.1 + n * 0.12, n * 3.3);
      return { p, sw, f, bub, in: G(1, p) };
    });

    // ---- the tone: a pair of each note, a hair apart, so that it is never quite still
    const soft = filt('lowpass', 1800, 0.5, this.tone.in); let i = 0;
    this.notes = {};
    for (const k in NOTE) {
      const g = G(0, soft);
      for (const cents of [-4, 5]) { const o = ctx.createOscillator(); o.type = NOTE[k] < 160 ? 'triangle' : 'sine'; o.frequency.value = NOTE[k]; o.detune.value = cents; o.connect(g); o.start(); }
      this.notes[k] = { g, i: i++ };
    }
    this.live = true; this.offline = !!given;
    if (!given) {
      this.out.gain.setTargetAtTime(this.quiet ? 0 : this.volume, ctx.currentTime + 0.2, 1.2);      // it comes up out of nothing
      // when nobody is drawing the river (the headset is off, the tab is away) nobody should be hearing it
      setInterval(() => { if (this.live && ctx.state === 'running' && performance.now() - this.beat > 2500) ctx.suspend(); }, 500);
    } else this.out.gain.value = this.volume;
  }

  mute(on) { this.quiet = on; if (this.ctx) this.out.gain.setTargetAtTime(on ? 0 : this.volume, this.ctx.currentTime, 0.15); }

  /** A place for a sound to come from. `near`: use the ear's own shape (dearer, and worth it only for what is close). */
  place(at, to, near = false) {
    const p = this.ctx.createPanner(); p.panningModel = near ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 0;
    if (at) { p.positionX.value = at.x; p.positionY.value = at.y || 0; p.positionZ.value = at.z; }
    p.connect(to); return p;
  }

  /** Say a thing once. at: where in the world (else it is everywhere); to: which part of the desk; when: seconds from now. */
  say(name, { gain = 1, rate = 1, at = null, to = null, when = 0, near = false } = {}) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = this.B[name]; s.playbackRate.value = rate; g.gain.value = gain; s.connect(g);
    const dest = to || this.world.in;
    if (at) { const p = this.place(at, dest, near); g.connect(p); s.onended = () => p.disconnect(); } else { g.connect(dest); s.onended = () => g.disconnect(); }
    s.start(ctx.currentTime + when);
  }

  update(dt, time, boat, look, camera, stage) {
    const ctx = this.ctx; if (!ctx) return;
    this.beat = performance.now(); if (ctx.state === 'suspended' && this.live && !this.offline) ctx.resume().catch(() => {});
    T = ctx.currentTime;
    const rnd = this.rnd, m = camera.matrixWorld.elements, ex = m[12], ey = m[13], ez = m[14], L = ctx.listener;
    if (L.positionX) { aim(L.positionX, ex, 0.02); aim(L.positionY, ey, 0.02); aim(L.positionZ, ez, 0.02); aim(L.forwardX, -m[8], 0.02); aim(L.forwardY, -m[9], 0.02); aim(L.forwardZ, -m[10], 0.02); aim(L.upX, m[4], 0.02); aim(L.upY, m[5], 0.02); aim(L.upZ, m[6], 0.02); }
    else { L.setPosition(ex, ey, ez); L.setOrientation(-m[8], -m[9], -m[10], m[4], m[5], m[6]); }

    // ---- which reach this is, and how much of the next
    const a = REACH[look.from] || REACH.naust, b = REACH[look.to] || a, t = look.blend || 0, mix = (k) => a[k] + (b[k] - a[k]) * t;
    const snd = boat.sound, water = mix('water'), flow = snd.flow === undefined ? 0.5 : snd.flow, wind = look.wind, way = clamp(snd.speed / 1.6);
    const gust = (ph) => gustAt(time, ph), blow = stage ? stage.gust || 0 : 0;      // the wind as it goes on; and a front of it arriving (a giant's breath)
    this.time = time;

    // ---- the bed
    this.river.forEach((g) => aim(g.gain, K.river * water * (0.4 + 0.6 * flow), 0.6));
    this.banks.forEach((g, i) => aim(g.gain, K.banks * water * (0.25 + 0.75 * flow) * (0.7 + 0.3 * Math.sin(time * 0.13 + i * 2.1)), 0.8));
    // (what sways is moved by gust(3): the two ears hear it a little before and a little after)
    this.wind.forEach((w, i) => { const g = gust(2.6 + i * 0.8); aim(w.g.gain, K.wind * wind * (0.25 + 0.75 * g) + K.gust * blow, 0.18); aim(w.f.frequency, 380 + 420 * g + 60 * Math.sin(time * 0.9 + i) + 260 * blow, 0.25); });
    this.needles.forEach((g, i) => aim(g.gain, K.needles * (wind * mix('needles') * (0.2 + 0.8 * gust(2.8 + i * 0.4)) + 0.5 * blow), 0.3));
    aim(this.wet.gain, K.room * mix('room'), 1);

    // ---- the hull
    aim(this.lap.gain, K.lap * (1 - 0.5 * way), 0.5); aim(this.glug.gain, K.glug * (0.12 + 0.88 * way), 0.3); aim(this.bow.gain, K.bow * way, 0.25);
    aim(this.wash.g.gain, K.wash * way * way, 0.25); aim(this.wash.f.frequency, 450 + 500 * way, 0.3);
    if (snd.bump > this.bumped + 0.2) this.say('bump', { to: this.hull.in, gain: K.bump * snd.bump, rate: 0.9 + 0.2 * rnd() });
    this.bumped = snd.bump;

    // ---- the oars
    for (let n = 0; n < 2; n++) {
      const o = boat.oars[n], h = this.oars[n], pull = o.mode === 'rest' ? 0 : clamp(o.force * 1.3);
      aim(h.p.positionX, o.tip.x, 0.03); aim(h.p.positionY, Math.max(0, o.tip.y), 0.03); aim(h.p.positionZ, o.tip.z, 0.03);
      aim(h.sw.gain, K.swish * pull, 0.05); aim(h.f.frequency, 380 + 520 * pull, 0.08); aim(h.bub.gain, K.oarBubbles * Math.sqrt(pull), 0.08);
    }
    if (snd.hits) for (const [kind, n, power] of snd.hits) {
      const h = this.oars[n];
      if (kind === 'splash') {
        this.say('splash' + Math.floor(rnd() * 4), { to: h.in, gain: K.splash * (0.3 + 0.7 * power), rate: 0.85 + 0.3 * rnd() });
        if (power > 0.4) this.say('thunk' + Math.floor(rnd() * 3), { to: h.in, gain: K.thunk * power, rate: 0.9 + 0.25 * rnd(), when: 0.03 });
      } else if (kind === 'touch') this.say('drop' + Math.floor(rnd() * 3), { to: h.in, gain: K.touch * (0.5 + 0.5 * rnd()), rate: 0.6 + 0.25 * rnd() });      // a trailing blade nodding onto the water
      else if (kind === 'drip' && rnd() < 0.5) this.say('drip' + Math.floor(rnd() * 4), { to: h.in, gain: K.drip * (0.4 + 0.6 * power), rate: 0.8 + 0.5 * rnd() });
    }

    // ---- the world: what stands somewhere, and what has just happened somewhere
    let awe = 0;
    if (stage) {
      for (const v of stage.sounds) {
        const d = Math.hypot(ex - v.pos.x, ey - v.pos.y, ez - v.pos.z);
        if (v.awe) awe = Math.max(awe, v.level * (1 - smooth(v.reach * 0.1, v.reach * 0.6, d)));
        if (!v.node && d < v.reach && v.level > 0.01) v.node = VOICES[v.kind](this, v);
        if (v.node) { if (d > v.reach * 1.25) { v.node.end(); v.node = null; } else v.node.tick(v.level * fall(d, v.reach), time, d, gust(3)); }
      }
      for (const h of stage.hits) {
        const d = Math.hypot(ex - h.x, ey - h.y, ez - h.z), q = HITS[h.kind]; if (!q || d > q.reach) continue;
        q.say(this, h, h.power * fall(d, q.reach), rnd);
      }
      stage.hits.length = 0;
    }
    this.awe += (awe - this.awe) * Math.min(1, dt * 0.5);

    // ---- the tone, attended to a few times a second
    if ((this.frame++ & 7) === 0) for (const k in this.notes) {
      const n = this.notes[k], lv = (a.chord[k] || 0) * (1 - t) + (b.chord[k] || 0) * t;
      aim(n.g.gain, K.tone * lv * (0.55 + 0.9 * this.awe) * (0.75 + 0.25 * Math.sin(time * (0.11 + n.i * 0.013) + n.i * 1.7)), 1.2);
    }

    // ---- things that happen when they like: an owl in the wood, a string over the mere, water falling in the dark under the root
    this.owlIn -= dt * mix('owl');
    if (this.owlIn <= 0) {
      this.owlIn = 20 + 36 * rnd();
      const p = river.point(boat.s + (rnd() - 0.4) * 90, (rnd() < 0.5 ? -1 : 1) * (river.halfWidth(boat.s) + 26 + rnd() * 50), []), k = K.owl * (0.45 + 0.55 * rnd()), r = 0.95 + 0.08 * rnd();
      this.say('owl', { at: { x: p[0], y: 10, z: p[1] }, to: this.far.in, gain: k, rate: r });
      if (rnd() < 0.5) this.say('owl', { at: { x: p[0], y: 10, z: p[1] }, to: this.far.in, gain: k * 0.8, rate: r, when: 4.5 + rnd() * 2 });
    }
    this.lyreIn -= dt * mix('lyre');
    if (this.lyreIn <= 0) {
      this.lyreIn = 16 + 24 * rnd();
      const sc = SCALE[t > 0.5 ? (look.to === 'well' ? 'well' : 've') : (look.from === 'well' ? 'well' : 've')], many = 1 + Math.floor(rnd() * 3); let at = 0, i = Math.floor(rnd() * sc.length);
      for (let q = 0; q < many; q++) { this.say('pluck', { to: this.far.in, gain: K.lyre * (0.6 + 0.4 * rnd()) * (q ? 0.8 : 1), rate: sc[i], when: at }); at += 0.55 + rnd() * 0.5; i = clamp(i + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2)), 0, sc.length - 1); }
    }
    const under = (look.from === 'arch' ? 1 - t : 0) + (look.to === 'arch' ? t : 0);
    if (under > 0.3) {
      this.dropIn -= dt;
      if (this.dropIn <= 0) { this.dropIn = 0.5 + 2.6 * rnd() * rnd(); const an = rnd() * TAU, r = 2 + rnd() * 8; this.say('drop' + Math.floor(rnd() * 3), { at: { x: ex + Math.cos(an) * r, y: 0, z: ez + Math.sin(an) * r }, to: this.far.in, gain: K.drop * under * (0.3 + 0.7 * rnd()), rate: 0.7 + 0.6 * rnd() }); }
    }
  }
}

/**
 * Voices: things that stand in the world and keep sounding (a set piece asks for one with ctx.voice(kind, pos, reach)).
 * Each is built when the rider comes within its reach and taken down when they have left it behind.
 * A voice is { tick(loudness at the ear, time, distance, gust), end() }.
 */
const VOICES = {
  fire(A, v) {
    const p = A.place(v.pos, A.world.in, true), g = A.G(0, p), s = A.loop('fire', g, 0.94 + (Math.abs(v.pos.x) % 1) * 0.12, v.pos.z);
    return { tick: (k) => aim(g.gain, K.fire * k, 0.3), end: () => { s.stop(); p.disconnect(); } };
  },
  /** The sleeping giant: air going in and out of something the size of a hill. */
  breath(A, v) {
    const p = A.place(v.pos, A.far.in), g = A.G(0, p), f = A.filt('bandpass', 300, 1.5, g), s = A.loop('pinkR', f, 0.7, 1);
    return {
      tick: (k, time) => { const c = (time / 7.2) % 1, inn = c < 0.38 ? Math.sin(Math.PI * c / 0.38) : 0, out = c > 0.44 && c < 0.96 ? Math.sin(Math.PI * (c - 0.44) / 0.52) : 0; aim(g.gain, K.breath * k * (0.55 * inn * inn + out * out), 0.12); aim(f.frequency, 300 + 190 * inn - 70 * out, 0.15); },
      end: () => { s.stop(); p.disconnect(); },
    };
  },
  /** Glasir: the leaves themselves from where the crown is, and more of them all round as the rider comes under it. */
  gold(A, v) {
    const p = A.place(v.pos, A.world.in), g = A.G(0, p), s = A.loop('goldL', g), g2 = A.G(0, A.bed.in), s2 = A.loop('goldR', g2, 1.06, 2);
    return { tick: (k, time, d, gust) => { const w = 0.45 + 0.55 * gust; aim(g.gain, K.gold * k * w, 0.5); aim(g2.gain, K.goldBed * (1 - smooth(v.reach * 0.1, v.reach * 0.6, d)) * w, 0.5); }, end: () => { s.stop(); s2.stop(); p.disconnect(); g2.disconnect(); } };
  },
  /** The tree over the well: the same leaves as the grove's, an octave down and a long way up. */
  tree(A, v) {
    const g = A.G(0, A.bed.in), s = A.loop('goldL', g, 0.5, 3), g2 = A.G(0, A.bed.in), s2 = A.loop('goldR', g2, 0.53, 7);
    return { tick: (k, time, d, gust) => { const w = (0.6 + 0.4 * gust) * (1 - smooth(v.reach * 0.35, v.reach, d)); aim(g.gain, K.tree * w, 0.8); aim(g2.gain, K.tree * w, 0.8); }, end: () => { s.stop(); s2.stop(); g.disconnect(); g2.disconnect(); } };
  },
  /** The ship the mere keeps: her crew at the oars, heard as if through the water. */
  ship(A, v) {
    const p = A.place(v.pos, A.far.in), g = A.G(0, p), s = A.loop('crew', g, 1, A.time || 0);      // (begun where the clock is, so that the light that runs her length keeps the stroke: src/ifing/ve.js)
    return { tick: (k) => aim(g.gain, K.ship * k, 0.6), end: () => { s.stop(); p.disconnect(); } };
  },
};

/** Hits: things that happen once, somewhere (ctx.hit(kind, pos, power)). */
const HITS = {
  plunge: { reach: 60, say: (A, h, k) => A.say('plunge', { at: h, gain: K.plunge * k, near: true }) },
  drop: { reach: 40, say: (A, h, k, rnd) => A.say('drop' + Math.floor(rnd() * 3), { at: h, gain: K.drop * k, rate: 0.8 + 0.4 * rnd() }) },
  groan: { reach: 260, say: (A, h) => A.say('groan', { at: h, to: A.far.in, gain: K.groan }) },
  horn: { reach: 1e9, say: (A, h) => A.say('horn', { at: h, to: A.far.in, gain: K.horn }) },
  string: { reach: 260, say: (A, h, k) => A.say('pluck', { at: h, to: A.far.in, gain: K.pluck * Math.min(1, k * 2.5), rate: h.note }) },      // a stone on the mere, a thread of the loom
  fish: { reach: 30, say: (A, h, k, rnd) => A.say('drop' + Math.floor(rnd() * 3), { at: h, gain: K.fish * Math.min(1, k * 2.5), rate: 0.5 + 0.2 * rnd(), near: true }) },
  launch: { reach: 60, say: (A, h, k, rnd) => A.say('splash' + Math.floor(rnd() * 4), { at: h, gain: K.launch * Math.min(1, k * 2.5), rate: 0.8 }) },
  wing: { reach: 70, say: (A, h, k, rnd) => A.say('flap' + Math.floor(rnd() * 2), { at: h, gain: K.wing * Math.min(1, k * 4), rate: 0.9 + 0.2 * rnd() }) },
  croak: { reach: 70, say: (A, h, k, rnd) => { let at = 0; for (let q = 0; q < 2 + Math.floor(rnd() * 2); q++) { A.say('croak' + (q & 1), { at: h, gain: K.croak * Math.min(1, k * 3) * (q ? 0.8 : 1), rate: 0.94 + 0.1 * rnd(), when: at }); at += 0.5 + rnd() * 0.25; } } },
};
