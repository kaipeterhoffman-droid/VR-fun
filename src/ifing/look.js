// Look: the colour of each reach of the river, and the blend from one to the next as the boat goes down it.
//
// Each reach is a chord of a few colours, chosen the way a painter limits a palette, and each keeps warm light scarce
// so that a fire, when one comes, is the brightest and warmest thing in the picture:
//   naust   blue hour. Ultramarine over a lemon-green afterglow that lies in the notch the river runs toward.
//   iron    the Ironwood. Night under spruce: black-greens, grey mist on the water, the lantern's amber alone.
//   ve      the sanctuary. The moon is up over the mere: silver-blue, long cloud bars, hard white on the stones.
//   glasir  the golden grove. The leaves give their own red-gold light over black water; the sky is forgotten.
//   arch    under the white root: close, dark and wet, so that what comes after is wide.
//   well    the well of Urd. Starlight and northern lights on still water, and the white tree over everything.
import * as THREE from 'three';
import { shared } from './paint.js';
import { river, LENGTH } from './river.js';
import { smooth } from './noise.js';

const C = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
function toward(s0, s1, lift, d1 = 0) {                 // the direction from one place on the river to another, raised by `lift`
  const a = river.point(s0, 0, []), b = river.point(s1, d1, []);
  const v = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize(); v.y = lift; return v.normalize();
}

const moonDir = toward(388, 500, 0.2, -6.5);            // from under the gate the moon stands over the stone ship (src/ifing/ve.js), and its road leads there
const treeDir = toward(860, LENGTH + 300, 0.0);
// Glasir, the tree whose leaves are red gold (src/ifing/glasir.js): it stands where the long straight of its reach ends, and lights the air there
const glasirDir = (() => { const a = river.point(640, 0, []), b = river.point(746, river.halfWidth(746) + 5.5, []); const v = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize(); v.y = 0.16; return v.normalize(); })();
// the stone jotun of the Ironwood (src/ifing/ironwood.js) stands against what light the night has left: seen from the pool
const jotunDir = (() => { const a = river.point(238, 0, []), b = river.point(312, -(river.halfWidth(312) + 20), []); const v = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize(); v.y = 0.12; return v.normalize(); })();

export const LOOKS = {
  naust: {
    zenith: C('#0c1c42'), mid: C('#27497a'), horizon: C('#4a8f93'),
    glowDir: dir(-0.1, 0.02, -1), glow: C('#f8e592', 1.7), glowSize: 8, halo: C('#69b09a', 0.6), haloSize: 2.2,
    moonDir, moon: C('#000000'), moonSize: 0.02, stars: 0.16, clouds: 0.85, cloudLit: C('#f3b98a', 1.15), cloudDark: C('#2c3a62'), aurora: 0,
    fog: C('#243f5c'), fogDensity: 0.0062, mist: C('#6f9fa8'), mistAmount: 0.16, mistHeight: 2.2, fogGlow: C('#c9d58a', 0.5),
    keyDir: dir(0.12, -0.3, 1), shade: C('#15243e'), half: C('#33495f'), lit: C('#aebfbe', 1.0), skyLight: C('#2a4260', 0.55), groundLight: C('#16222f'), gain: 2.6,
    exposure: 1.25, tint: C('#ffffff'), lift: C('#02040a'), sat: 0.96, contrast: 1.04,
    deep: C('#07142a'), mirrorDark: 0.22, mirrorSat: 1.0, waver: 0.7, mirrorTint: C('#e6f0ff'), waves: 0.24, fresnel: 0.42, clarity: 0.75,
    lantern: C('#ffb054'), lanternPower: 0.9, lanternRadius: 8, wind: 0.5, canopy: 0.7,
  },
  iron: {
    zenith: C('#060f22'), mid: C('#0d2233'), horizon: C('#173a40'),
    glowDir: jotunDir, glow: C('#4f8f86', 0.5), glowSize: 2.4, halo: C('#16403c', 0.5), haloSize: 0.9,
    moonDir, moon: C('#000000'), moonSize: 0.02, stars: 0.5, clouds: 0.3, cloudLit: C('#35506a'), cloudDark: C('#0b1626'), aurora: 0,
    fog: C('#10242c'), fogDensity: 0.0175, mist: C('#6a8a8c'), mistAmount: 0.5, mistHeight: 1.6, fogGlow: C('#3a6e68', 0.6),
    keyDir: dir(0.25, -0.9, 0.3), shade: C('#07131a'), half: C('#1a3238'), lit: C('#7d9a8e', 1.0), skyLight: C('#0f2c36', 0.7), groundLight: C('#050e0c'), gain: 3.4,
    exposure: 1.3, tint: C('#f6fbff'), lift: C('#020506'), sat: 0.86, contrast: 1.05,
    deep: C('#030b0c'), mirrorDark: 0.3, mirrorSat: 1.0, waver: 0.9, mirrorTint: C('#dff5ea'), waves: 0.22, fresnel: 0.36, clarity: 0.8,
    lantern: C('#ffa544'), lanternPower: 1.5, lanternRadius: 11, wind: 0.35, canopy: 0.85,
  },
  ve: {
    zenith: C('#06102c'), mid: C('#11305a'), horizon: C('#487296'),
    glowDir: moonDir, glow: C('#b9c9f2', 0.8), glowSize: 5, halo: C('#33547e', 0.7), haloSize: 1.6,
    moonDir, moon: C('#f4f1e2', 2.4), moonSize: 0.062, stars: 0.75, clouds: 0.7, cloudLit: C('#c9d6f5', 0.9), cloudDark: C('#11223c'), aurora: 0,
    fog: C('#14304e'), fogDensity: 0.0046, mist: C('#8aa6cf'), mistAmount: 0.3, mistHeight: 1.3, fogGlow: C('#86a4cc', 0.55),
    keyDir: moonDir.clone().multiplyScalar(-1).setY(-0.42).normalize(), shade: C('#0a1a30'), half: C('#254462'), lit: C('#b9cbe8', 1.0), skyLight: C('#17304e', 0.6), groundLight: C('#08111e'), gain: 2.6,
    exposure: 1.2, tint: C('#f7f8ff'), lift: C('#02030a'), sat: 0.9, contrast: 1.06,
    deep: C('#040b1c'), mirrorDark: 0.14, mirrorSat: 0.95, waver: 0.45, mirrorTint: C('#eef2ff'), waves: 0.3, fresnel: 0.5, clarity: 0.8,
    lantern: C('#ffab4c'), lanternPower: 1.0, lanternRadius: 9, wind: 0.25, canopy: 0.7,
  },
  glasir: {
    zenith: C('#04061a'), mid: C('#0a1030'), horizon: C('#1b1d3c'),
    glowDir: glasirDir, glow: C('#ffb648', 0.34), glowSize: 9, halo: C('#5a3a16', 0.4), haloSize: 4.5,
    moonDir, moon: C('#000000'), moonSize: 0.02, stars: 0.9, clouds: 0.1, cloudLit: C('#6a4a2a'), cloudDark: C('#0a0c1c'), aurora: 0,
    fog: C('#131224'), fogDensity: 0.0105, mist: C('#7a5a2a'), mistAmount: 0.2, mistHeight: 1.8, fogGlow: C('#c8882a', 0.42),
    keyDir: dir(-0.15, -0.97, 0.2), shade: C('#0e0e26'), half: C('#3a2b1c'), lit: C('#ffd488', 0.74), skyLight: C('#3a2a10', 0.6), groundLight: C('#16152c'), gain: 2.3,
    exposure: 1.1, tint: C('#fffaf0'), lift: C('#03030a'), sat: 1.02, contrast: 1.06,
    deep: C('#04040a'), mirrorDark: 0.16, mirrorSat: 1.05, waver: 0.6, mirrorTint: C('#fff4e4'), waves: 0.22, fresnel: 0.42, clarity: 0.8,
    lantern: C('#ffb860'), lanternPower: 0.8, lanternRadius: 8, wind: 0.6, canopy: 0.25,
  },
  arch: {
    zenith: C('#03040c'), mid: C('#070a18'), horizon: C('#0d1426'),
    glowDir: treeDir.clone().setY(0.12).normalize(), glow: C('#7fa8d8', 0.35), glowSize: 6, halo: C('#1a2a50', 0.4), haloSize: 1.6,
    moonDir, moon: C('#000000'), moonSize: 0.02, stars: 0.4, clouds: 0, cloudLit: C('#20304a'), cloudDark: C('#06080f'), aurora: 0,
    fog: C('#0a1020'), fogDensity: 0.02, mist: C('#3a4c72'), mistAmount: 0.4, mistHeight: 1.2, fogGlow: C('#5a80b8', 0.6),
    keyDir: treeDir.clone().multiplyScalar(-1).setY(-0.25).normalize(), shade: C('#05070f'), half: C('#141c36'), lit: C('#8fa6d0', 1.0), skyLight: C('#0a1228', 0.8), groundLight: C('#04060c'), gain: 3.0,
    exposure: 1.25, tint: C('#f2f5ff'), lift: C('#020308'), sat: 0.95, contrast: 1.05,
    deep: C('#02040a'), mirrorDark: 0.3, mirrorSat: 1.0, waver: 0.6, mirrorTint: C('#e6ecff'), waves: 0.25, fresnel: 0.4, clarity: 0.9,
    lantern: C('#ffa848'), lanternPower: 1.4, lanternRadius: 10, wind: 0.15, canopy: 0,
  },
  well: {
    zenith: C('#04061c'), mid: C('#0c1848'), horizon: C('#2c5486'),
    glowDir: treeDir.clone().setY(0.05).normalize(), glow: C('#8fd0c8', 0.45), glowSize: 7, halo: C('#20466e', 0.5), haloSize: 1.8,
    moonDir, moon: C('#000000'), moonSize: 0.02, stars: 1.0, clouds: 0.12, cloudLit: C('#5a7ab0'), cloudDark: C('#0a1230'), aurora: 1,
    fog: C('#10244e'), fogDensity: 0.0019, mist: C('#6f95c0'), mistAmount: 0.16, mistHeight: 0.9, fogGlow: C('#4fa49c', 0.3),
    keyDir: dir(0.2, -0.75, 0.5), shade: C('#2a3560'), half: C('#56689a'), lit: C('#e4eeff', 1.3), skyLight: C('#1c3470', 0.6), groundLight: C('#0c1638'), gain: 2.2,
    exposure: 1.2, tint: C('#f6fbff'), lift: C('#02030a'), sat: 1.05, contrast: 1.05,
    deep: C('#030818'), mirrorDark: 0.08, mirrorSat: 1.05, waver: 0.22, mirrorTint: C('#f2f6ff'), waves: 0.14, fresnel: 0.6, clarity: 0.6,
    lantern: C('#ffb054'), lanternPower: 0.8, lanternRadius: 8, wind: 0.1, canopy: 0,
  },
};

// Where each look holds, along the river. Between two stops the look is a blend.
const STOPS = [
  [0, 'naust'], [64, 'naust'], [128, 'iron'], [338, 'iron'], [398, 've'], [566, 've'], [628, 'glasir'], [776, 'glasir'],
  [818, 'arch'], [850, 'arch'], [898, 'well'], [LENGTH, 'well'],
];
// The air thickens where one reach gives way to the next: a bank of mist to pass through, [s, half length, how much].
// (A bank can be less than nothing: over the pool in the Ironwood the trees stand back and the air clears.)
const BANKS = [[104, 26, 1.1], [272, 76, -0.4], [376, 20, 0.9], [606, 22, 0.8]];

const KEYS = Object.keys(LOOKS.naust);
/** A look to blend into: one of every value. */
export function blankLook() {
  const o = {};
  for (const k of KEYS) { const v = LOOKS.naust[k]; o[k] = v.isColor || v.isVector3 ? v.clone() : v; }
  return o;
}
function mixLook(out, a, b, t) {
  for (const k of KEYS) {
    const x = a[k], y = b[k];
    if (x.isColor) out[k].copy(x).lerp(y, t);
    else if (x.isVector3) out[k].copy(x).lerp(y, t).normalize();
    else out[k] = x + (y - x) * t;
  }
  return out;
}

/** The look at s metres down the river, written into `out`. */
export function lookAt(s, out) {
  let i = 1;
  while (i < STOPS.length - 1 && s > STOPS[i][0]) i++;
  const [s0, n0] = STOPS[i - 1], [s1, n1] = STOPS[i];
  out.from = n0; out.to = n1; out.blend = n0 === n1 ? 0 : smooth(s0, s1, s);                  // (which reaches these are: the ear wants to know too)
  mixLook(out, LOOKS[n0], LOOKS[n1], out.blend);
  let bank = 0;
  for (const [c, half, k] of BANKS) { const u = Math.abs(s - c) / half; if (u < 1) bank += k * (1 - u * u) * (1 - u * u); }
  out.bank = bank;
  out.fogDensity *= 1 + bank * 1.5; out.mistAmount = Math.min(0.9, out.mistAmount + bank * 0.35);
  return out;
}

/** Give a look to the paint (and to the sky and the water, which keep their own numbers: see their files). */
export function applyLook(L, sky, water) {
  const u = shared;
  u.uFogColor.value.copy(L.fog); u.uFogDensity.value = L.fogDensity; u.uFogHeight.value.set(L.mistAmount, L.mistHeight, 0);
  u.uFogGlowDir.value.copy(L.glowDir); u.uFogGlowColor.value.copy(L.fogGlow); u.uMistColor.value.copy(L.mist);
  u.uExposure.value = L.exposure; u.uGradeTint.value.copy(L.tint); u.uGradeLift.value.copy(L.lift); u.uGradeSat.value = L.sat; u.uGradeContrast.value = L.contrast;
  u.uKeyDir.value.copy(L.keyDir); u.uShade.value.copy(L.shade); u.uHalf.value.copy(L.half); u.uLit.value.copy(L.lit);
  u.uSkyLight.value.copy(L.skyLight); u.uGroundLight.value.copy(L.groundLight); u.uLightGain.value = L.gain;
  u.uLanternRadius.value = L.lanternRadius;
  u.uWind.value.z = L.wind;
  u.uCanopyGain.value = L.canopy;
  u.uMirror.value.set(L.mirrorDark, L.mirrorSat, L.waver, 0); u.uMirrorTint.value.copy(L.mirrorTint);
  if (sky) {
    const k = sky.uniforms;
    k.uZenith.value.copy(L.zenith); k.uSkyMid.value.copy(L.mid); k.uHorizon.value.copy(L.horizon);
    k.uGlowDir.value.copy(L.glowDir); k.uGlowColor.value.copy(L.glow); k.uHaloColor.value.copy(L.halo);
    k.uMoonDir.value.copy(L.moonDir); k.uMoonColor.value.copy(L.moon);
    k.uCloudLit.value.copy(L.cloudLit); k.uCloudDark.value.copy(L.cloudDark);
    k.uAuroraDir.value.copy(treeDir);
    k.uSkyP.value.set(L.glowSize, L.haloSize, L.moonSize, L.stars); k.uSkyQ.value.x = L.clouds; k.uSkyQ.value.y = L.aurora;
  }
  if (water) {
    const k = water.uniforms;
    k.uDeep.value.copy(L.deep); k.uWaterP.value.set(L.waves, L.fresnel, L.clarity, 0);
  }
}

/** How far the air lets the rider see, in metres, for a look: beyond it nothing need be drawn. */
export const sightOf = (L) => Math.min(520, 2.15 / L.fogDensity);
