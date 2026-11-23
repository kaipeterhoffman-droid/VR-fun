// Every sound is synthesized: no files, no loading, no licensing.
// Spatialized with HRTF panners so impacts come from where they happen.

let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio(listenerSource) {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.ratio.value = 6;
  const out = ctx.createGain();
  out.gain.value = 0.8;
  master.connect(out).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  listenerSource.ready = true;
}

export function updateListener(pos, fwd, up) {
  if (!ctx) return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(pos.x, t, 0.02);
    l.positionY.setTargetAtTime(pos.y, t, 0.02);
    l.positionZ.setTargetAtTime(pos.z, t, 0.02);
    l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
    l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
    l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
    l.upX.setTargetAtTime(up.x, t, 0.02);
    l.upY.setTargetAtTime(up.y, t, 0.02);
    l.upZ.setTargetAtTime(up.z, t, 0.02);
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

function spatial(pos) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 0.6;
  p.rolloffFactor = 1.2;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
  p.connect(master);
  return p;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(dest, { type = 'sine', f0, f1 = f0, dur = 0.15, vol = 0.3, attack = 0.004, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise(dest, { dur = 0.08, vol = 0.2, freq = 3000, q = 0.8, type = 'bandpass', delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.002, vol, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 0.3);
  s.stop(t + dur + 0.05);
}

// pentatonic-ish base pitch per law, so each one has a voice
const PITCH = { newton: 220, rebel: 330, runaway: 247, shy: 440, palindrome: 294, slowlight: 523, tide: 110, bashful: 392, contrarian: 196, cyclotron: 370 };

export function sfxFire(key, pos) {
  if (!ctx) return;
  const d = spatial(pos);
  const f = PITCH[key] ?? 260;
  if (key === 'contrarian') {
    tone(d, { type: 'sawtooth', f0: f * 0.6, f1: f * 3, dur: 0.16, vol: 0.12 });
  } else if (key === 'palindrome') {
    tone(d, { type: 'triangle', f0: f * 4, f1: f, dur: 0.12, vol: 0.18 });
    tone(d, { type: 'triangle', f0: f, f1: f * 4, dur: 0.12, vol: 0.1, delay: 0.1 });
  } else if (key === 'tide') {
    tone(d, { type: 'sine', f0: 160, f1: 45, dur: 0.35, vol: 0.45 });
  } else {
    tone(d, { type: 'square', f0: f * 4, f1: f, dur: 0.11, vol: 0.09 });
    tone(d, { type: 'sine', f0: f * 2, f1: f * 0.5, dur: 0.14, vol: 0.2 });
  }
  noise(d, { dur: 0.05, vol: 0.12, freq: 2400, q: 0.6 });
}

export function sfxImpact(key, pos, speed) {
  if (!ctx) return;
  const vol = Math.min(1, speed / 7);
  if (vol < 0.05) return;
  const d = spatial(pos);
  const f = PITCH[key] ?? 260;
  switch (key) {
    case 'runaway':
      tone(d, { type: 'square', f0: f * 3, f1: f * 6, dur: 0.07, vol: 0.12 * vol });
      noise(d, { dur: 0.05, vol: 0.25 * vol, freq: 5000, q: 2 });
      break;
    case 'slowlight':
      [1, 1.5, 2, 3].forEach((m, i) => tone(d, { type: 'sine', f0: f * m, dur: 0.6, vol: 0.08 * vol, delay: i * 0.03 }));
      break;
    case 'tide':
      tone(d, { type: 'sine', f0: 90, f1: 40, dur: 0.4, vol: 0.5 * vol });
      noise(d, { dur: 0.15, vol: 0.2 * vol, freq: 300, q: 0.7, type: 'lowpass' });
      break;
    case 'bashful':
      noise(d, { dur: 0.18, vol: 0.3 * vol, freq: 900, q: 1.2 });
      break;
    case 'shy':
      tone(d, { type: 'triangle', f0: f * 2, f1: f * 2.6, dur: 0.06, vol: 0.2 * vol });
      tone(d, { type: 'triangle', f0: f * 2.6, f1: f * 3.2, dur: 0.06, vol: 0.12 * vol, delay: 0.05 });
      break;
    case 'contrarian':
      tone(d, { type: 'sawtooth', f0: f, f1: f * 0.5, dur: 0.12, vol: 0.12 * vol });
      tone(d, { type: 'sawtooth', f0: f * 0.5, f1: f, dur: 0.12, vol: 0.1 * vol, delay: 0.08 });
      break;
    default:
      tone(d, { type: 'sine', f0: f * 1.5, f1: f, dur: 0.12, vol: 0.35 * vol });
      noise(d, { dur: 0.04, vol: 0.2 * vol, freq: 1800, q: 1 });
  }
}

export function sfxRewind(pos) {
  if (!ctx) return;
  const d = spatial(pos);
  tone(d, { type: 'triangle', f0: 120, f1: 900, dur: 0.35, vol: 0.14 });
}

export function sfxClick(pos, up = true) {
  if (!ctx) return;
  const d = spatial(pos);
  tone(d, { type: 'square', f0: up ? 900 : 700, f1: up ? 1300 : 500, dur: 0.04, vol: 0.06 });
}

export function sfxVanish(pos) {
  if (!ctx) return;
  const d = spatial(pos);
  tone(d, { type: 'sine', f0: 700, f1: 1600, dur: 0.12, vol: 0.05 });
}
