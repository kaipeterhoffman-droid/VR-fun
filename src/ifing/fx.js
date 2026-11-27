// Fx: light and air. Everything here is drawn as small pictures that face the eye, many to one drawing.
//
//   Glows    the halo round a flame, a rune, a star, an eye in the dark. A headset cannot afford the full-screen
//            bloom a desktop would use, so each light carries its own bloom as a soft disc added over the picture.
//            In the water a glow is not a disc but a column: light on moving water is drawn down toward the eye.
//   Motes    points of light that wander, rise or fall: fireflies, wisps, sparks, dew, snow of seeds.
//   Mist     torn pieces of fog lying on the water.
//   Leaves   red-gold leaves coming down in the grove.
import * as THREE from 'three';
import { GLSL_FINISH, shared } from './paint.js';
import { glowDisc, mistPuff, region } from './art.js';
import { skyShared } from './sky.js';

const quad = () => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; };

// ------------------------------------------------------------------------------------------------ glows
const GLOW_VERT = /* glsl */`
  attribute vec4 aPlace; attribute vec4 aColor;                  // place: xyz, size in metres. colour: rgb, how much it flickers
  uniform float uTime;
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY; varying float vAir;
  void main() {
    vec4 wp = modelMatrix * vec4(aPlace.xyz, 1.0);
    vec2 size = vec2(abs(aPlace.w)); vAir = step(0.0, aPlace.w);
    float fl = 1.0 - aColor.a * (0.5 + 0.5 * sin(uTime * 13.0 + aPlace.x * 7.0) * sin(uTime * 7.3 + aPlace.z * 5.0)) * 0.45;
    #ifdef MIRROR
      size *= vec2(0.75, 3.2); wp.y -= abs(aPlace.w) * 2.2; fl *= 0.55;   // a column of light lying down the water toward the eye
    #endif
    vec4 mv = viewMatrix * wp;
    vDist = length(mv.xyz); vY = wp.y;
    mv.xy += position.xy * size;
    vP = position.xy; vCol = aColor.rgb * fl;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAG = /* glsl */`
  ${GLSL_FINISH}
  uniform sampler2D tGlow;
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY; varying float vAir;
  void main() {
    float a = texture2D(tGlow, vP * 0.5 + 0.5).a;
    if (vAir < 0.5) {
      // a star: a point, the faintest breath round it, and the four thin rays the eye gives a bright one
      vec2 q = abs(vP);
      a = a * a * a * 1.4 + a * 0.05 + (exp(-q.x * 46.0 - q.y * 5.0) + exp(-q.y * 46.0 - q.x * 5.0)) * 0.3 * a;
    }
    if (a < 0.004) discard;
    #ifdef MIRROR
      a *= 0.5 + 0.5 * sin(vP.y * 23.0 + uTime * 3.0 + vP.x * 5.0);   // broken by the wavelets
    #endif
    float fog = fogAmount(abs(vY), vDist, 0.55) * vAir;          // light carries through the air further than things do; a star is beyond the air
    gl_FragColor = vec4(developAdd(vCol * a * (1.0 - fog)), 1.0);
  }
`;

export class Glows {
  constructor(max = 160) {
    this.max = max; this.count = 0; this.list = [];
    this.place = new Float32Array(max * 4); this.color = new Float32Array(max * 4);
    const g = quad();
    this.aPlace = new THREE.InstancedBufferAttribute(this.place, 4); this.aColor = new THREE.InstancedBufferAttribute(this.color, 4);
    this.aPlace.setUsage(THREE.DynamicDrawUsage); this.aColor.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPlace', this.aPlace); g.setAttribute('aColor', this.aColor);
    const make = (mirror) => new THREE.ShaderMaterial({
      defines: mirror ? { MIRROR: '' } : {}, uniforms: { ...shared, tGlow: { value: Glows.disc || (Glows.disc = glowDisc()) } },
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, make(false)); this.mesh.frustumCulled = false; this.mesh.renderOrder = 30; this.mesh.name = 'glows';
    this.twin = new THREE.Mesh(g, make(true)); this.twin.frustumCulled = false; this.twin.renderOrder = 5;
    g.instanceCount = 0;
  }
  /** Add a glow: { position: Vector3, size (m), color: Color, power, flicker 0..1, star: false }. Change its fields at will. */
  add(o) { const gl = { size: 1, power: 1, flicker: 0, on: 1, star: false, ...o }; this.list.push(gl); return gl; }
  update() {
    let n = 0;
    for (const g of this.list) {
      const k = g.power * g.on; if (k <= 0.001 || n >= this.max) continue;
      this.place[n * 4] = g.position.x; this.place[n * 4 + 1] = g.position.y; this.place[n * 4 + 2] = g.position.z; this.place[n * 4 + 3] = g.star ? -g.size : g.size;
      this.color[n * 4] = g.color.r * k; this.color[n * 4 + 1] = g.color.g * k; this.color[n * 4 + 2] = g.color.b * k; this.color[n * 4 + 3] = g.flicker;
      n++;
    }
    this.mesh.geometry.instanceCount = n; this.aPlace.needsUpdate = true; this.aColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------------ motes
// Each mote is given a home and a seed; where it is at any moment is worked out in the shader, so a thousand of
// them cost the processor nothing. kind: 0 wanders round its home, 1 rises and dies (sparks), 2 falls (dew, seeds).
const MOTE_VERT = /* glsl */`
  attribute vec4 aHome; attribute vec4 aSeed;                    // home xyz + how far it roams; seed: phase, size, speed, kind
  attribute vec3 aTint;
  uniform float uTime; uniform vec3 uMoteP;                      // brightness, -, -
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY;
  void main() {
    float ph = aSeed.x * 6.2832, sp = aSeed.z, t = uTime * sp;
    vec3 p = aHome.xyz; float life = 1.0;
    if (aSeed.w < 0.5) {
      p += vec3(sin(t * 0.7 + ph) + 0.5 * sin(t * 1.9 + ph * 3.0), 0.5 * sin(t * 0.9 + ph * 2.0), cos(t * 0.6 + ph * 1.3) + 0.5 * cos(t * 1.7 + ph)) * aHome.w * 0.6;
      life = 0.55 + 0.45 * sin(t * 1.3 + ph * 5.0); life *= life;
    } else if (aSeed.w < 1.5) {
      float u = fract(t * 0.25 + aSeed.x);
      p += vec3(sin(u * 9.0 + ph) * 0.25 * u, u * aHome.w, cos(u * 7.0 + ph) * 0.25 * u) ;
      life = (1.0 - u) * (1.0 - u) * smoothstep(0.0, 0.05, u);
    } else {
      float u = fract(t * 0.08 + aSeed.x);
      p += vec3(sin(u * 5.0 + ph) * 0.6, (1.0 - u) * aHome.w, cos(u * 4.0 + ph) * 0.6);
      life = smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.9, u);
    }
    vec4 wp = modelMatrix * vec4(p, 1.0);
    #ifdef MIRROR
      wp.y = min(wp.y, -0.02);
    #endif
    vec4 mv = viewMatrix * wp;
    vDist = length(mv.xyz); vY = wp.y;
    mv.xy += position.xy * aSeed.y * (1.0 + 0.012 * vDist);       // never smaller than a point of light can be
    vP = position.xy; vCol = aTint * life * uMoteP.x;
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */`
  ${GLSL_FINISH}
  varying vec2 vP; varying vec3 vCol; varying float vDist; varying float vY;
  void main() {
    float r = dot(vP, vP); if (r > 1.0) discard;
    float a = exp(-r * 5.0) + 0.25 * exp(-r * 1.4);
    gl_FragColor = vec4(developAdd(vCol * a * (1.0 - fogAmount(abs(vY), vDist, 0.5))), 1.0);
  }
`;
/** motes: [{ x, y, z, roam, size, speed, kind, color: [r, g, b] }]. One drawing (and one more in the water). */
export function makeMotes(motes, { mirror = true } = {}) {
  const n = motes.length, g = quad(), home = new Float32Array(n * 4), seed = new Float32Array(n * 4), tint = new Float32Array(n * 3);
  motes.forEach((m, i) => {
    home.set([m.x, m.y, m.z, m.roam ?? 1], i * 4); seed.set([(i * 0.61803) % 1, m.size ?? 0.03, m.speed ?? 1, m.kind ?? 0], i * 4);
    tint.set(m.color, i * 3);
  });
  g.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = n;
  const uniforms = { ...shared, uMoteP: { value: new THREE.Vector3(1, 0, 0) } };
  const make = (mir) => new THREE.ShaderMaterial({ defines: mir ? { MIRROR: '' } : {}, uniforms, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, make(false)); mesh.frustumCulled = false; mesh.renderOrder = 31;
  const mat = mesh.material; mat.mirrorVariant = () => make(true);
  mesh.userData.mirrorOrder = 6; mesh.userData.uniforms = uniforms;
  if (!mirror) mesh.userData.noMirror = true;
  return mesh;
}

// ------------------------------------------------------------------------------------------------ mist
const MIST_VERT = /* glsl */`
  attribute vec4 aPlace; attribute vec4 aLook;                   // xyz + width; height, opacity, drift speed, phase
  uniform float uTime;
  varying vec2 vUv; varying float vA; varying float vDist; varying vec3 vW;
  void main() {
    vec3 c = aPlace.xyz; c.x += sin(uTime * 0.05 * aLook.z + aLook.w * 6.28) * 2.5; c.z += cos(uTime * 0.04 * aLook.z + aLook.w * 4.0) * 2.5;
    vec4 wp = modelMatrix * vec4(c, 1.0);
    vec4 mv = viewMatrix * wp;
    vDist = length(mv.xyz);
    mv.x += position.x * aPlace.w; mv.y += position.y * aLook.x;
    vUv = position.xy * 0.5 + 0.5; vW = wp.xyz;
    vA = aLook.y * smoothstep(1.5, 9.0, vDist) * (1.0 - smoothstep(60.0, 150.0, vDist));     // it parts before the boat, and is lost in the air far off
    gl_Position = projectionMatrix * mv;
  }
`;
const MIST_FRAG = /* glsl */`
  ${GLSL_FINISH}
  uniform sampler2D tPuff; uniform vec3 uLanternPos, uLanternColor; uniform float uLanternRadius; uniform float uMistGain;
  varying vec2 vUv; varying float vA; varying float vDist; varying vec3 vW;
  void main() {
    float a = texture2D(tPuff, vUv).a * vA * uMistGain;
    if (a < 0.004) discard;
    vec3 V = normalize(vW - cameraPosition);
    vec3 c = fogTint(V, 0.0) * 1.15 + uMistColor * 0.25;
    float ld = length(uLanternPos - vW); float la = 1.0 - smoothstep(0.0, uLanternRadius * 1.6, ld);
    c += uLanternColor * la * la * 0.22;                           // the lantern makes a room of light in the mist
    vec4 o = develop(c, 1.0);
    gl_FragColor = vec4(o.rgb, a * (1.0 - uVeil));
  }
`;
/** puffs: [{ x, y, z, width, height, opacity, drift }] */
export function makeMist(puffs) {
  const n = puffs.length, g = quad(), place = new Float32Array(n * 4), look = new Float32Array(n * 4);
  puffs.forEach((p, i) => { place.set([p.x, p.y, p.z, p.width], i * 4); look.set([p.height, p.opacity ?? 0.5, p.drift ?? 1, (i * 0.37) % 1], i * 4); });
  g.setAttribute('aPlace', new THREE.InstancedBufferAttribute(place, 4)); g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
  g.instanceCount = n;
  const uniforms = { ...shared, tPuff: { value: makeMist.puff || (makeMist.puff = mistPuff()) }, uMistGain: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 20; mesh.userData.noMirror = true; mesh.userData.uniforms = uniforms;
  return mesh;
}

// ------------------------------------------------------------------------------------------------ falling leaves
const LEAF_VERT = /* glsl */`
  attribute vec4 aHome; attribute vec4 aSeed; attribute vec3 aTint;   // home xyz + the height it falls from; phase, size, speed, -
  uniform float uTime; uniform vec4 uLeafUv;
  varying vec2 vUv; varying vec3 vCol; varying float vDist; varying float vY;
  ${''}
  void main() {
    float ph = aSeed.x * 6.2832, u = fract(uTime * 0.045 * aSeed.z + aSeed.x);
    vec3 c = aHome.xyz + vec3(sin(u * 11.0 + ph) * 1.1 + u * 1.6, (1.0 - u) * aHome.w, cos(u * 9.0 + ph * 1.7) * 1.1);
    float spin = uTime * (1.5 + aSeed.x * 2.0) + ph, tip = sin(u * 20.0 + ph) * 1.2;
    vec3 ax = vec3(cos(spin), sin(tip) * 0.6, sin(spin)), ay = normalize(cross(ax, vec3(sin(tip), cos(tip), 0.3)));
    vec3 p = c + (ax * position.x + ay * position.y) * aSeed.y;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    #ifdef MIRROR
      wp.y = min(wp.y, -0.02);
    #endif
    vec4 mv = viewMatrix * wp; vDist = length(mv.xyz); vY = wp.y;
    vUv = mix(uLeafUv.xy, uLeafUv.zw, position.xy * 0.5 + 0.5);
    float lit = 0.6 + 0.4 * abs(ay.y);
    vCol = aTint * lit * smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.97, u);
    gl_Position = projectionMatrix * mv;
  }
`;
const LEAF_FRAG = /* glsl */`
  ${GLSL_FINISH}
  uniform sampler2D tMap; uniform vec3 uHalf, uLit; uniform float uLightGain;
  varying vec2 vUv; varying vec3 vCol; varying float vDist; varying float vY;
  void main() {
    vec4 t = texture2D(tMap, vUv); if (t.a < 0.5) discard;
    vec3 c = t.rgb * vCol * (uHalf + uLit * 0.6) * uLightGain;
    c = mix(c, fogTint(vec3(0.0, 0.0, -1.0), vY), fogAmount(abs(vY), vDist, 1.0));
    gl_FragColor = develop(c, 1.0);
  }
`;
/** leaves: [{ x, y, z, fall, size, speed, color }], drawn from the flora sheet's leaf. */
export function makeLeaves(leaves, sheet) {
  const n = leaves.length, g = quad(), home = new Float32Array(n * 4), seed = new Float32Array(n * 4), tint = new Float32Array(n * 3);
  leaves.forEach((m, i) => { home.set([m.x, m.y, m.z, m.fall ?? 8], i * 4); seed.set([(i * 0.61803) % 1, m.size ?? 0.07, m.speed ?? 1, 0], i * 4); tint.set(m.color, i * 3); });
  g.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = n;
  const r = region('leaf'), uniforms = { ...shared, tMap: { value: sheet }, uLeafUv: { value: new THREE.Vector4(r[0], r[1], r[2], r[3]) } };
  const make = (mir) => new THREE.ShaderMaterial({ defines: mir ? { MIRROR: '' } : {}, uniforms, vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, make(false)); mesh.frustumCulled = false; mesh.material.mirrorVariant = () => make(true);
  return mesh;
}

// ------------------------------------------------------------------------------------------------ flames
// A fire is a few tongues of flame: each a card that turns to face the eye, its shape torn out of moving noise.
const FLAME_VERT = /* glsl */`
  attribute vec4 aPlace; attribute vec4 aLook;                   // the foot xyz + height; width, phase, brightness, -
  uniform float uTime;
  varying vec2 vUv; varying vec3 vL; varying float vDist; varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(aPlace.xyz, 1.0);
    float upSign = 1.0;
    #ifdef MIRROR
      upSign = -1.0;
    #endif
    vec2 uv = vec2(position.x, position.y * 0.5 + 0.5);
    vec4 mv = viewMatrix * wp; vDist = length(mv.xyz); vY = wp.y;
    vec3 upV = (viewMatrix * vec4(0.0, upSign, 0.0, 0.0)).xyz;
    float lean = sin(uTime * 5.3 + aLook.y * 20.0 + uv.y * 2.5) * 0.09 * uv.y * uv.y;
    mv.xyz += vec3(1.0, 0.0, 0.0) * (uv.x * aLook.x * 0.5 + lean * aPlace.w) + upV * uv.y * aPlace.w;
    vUv = uv; vL = aLook.yzw;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLAME_FRAG = /* glsl */`
  ${GLSL_FINISH}
  uniform sampler2D tNoise;
  varying vec2 vUv; varying vec3 vL; varying float vDist; varying float vY;
  void main() {
    float n1 = texture2D(tNoise, vec2(vUv.x * 0.22 + vL.x * 3.1, vUv.y * 0.42 - uTime * 0.85 + vL.x)).r;
    float n2 = texture2D(tNoise, vec2(vUv.x * 0.6 - vL.x * 5.0, vUv.y * 1.0 - uTime * 1.7)).g;
    float body = 1.0 - abs(vUv.x) * (1.0 + vUv.y * 1.6);
    float f = body + (n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.6 - vUv.y * 0.75;
    f *= smoothstep(0.0, 0.07, vUv.y);
    float a = smoothstep(0.02, 0.4, f);
    if (a < 0.01) discard;
    vec3 c = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.55, 0.1), smoothstep(0.1, 0.45, f));
    c = mix(c, vec3(1.0, 0.9, 0.55), smoothstep(0.45, 0.95, f));
    #ifdef MIRROR
      a *= 0.6;
    #endif
    gl_FragColor = vec4(developAdd(c * a * vL.y * (1.0 - fogAmount(abs(vY), vDist, 0.5))), 1.0);
  }
`;
/** flames: [{ x, y, z, height, width, power }]. The returned mesh has userData.power (a uniform-free dimmer is not needed: change the list and call .userData.set()). */
export function makeFlames(flames) {
  const n = flames.length, g = quad(), place = new Float32Array(n * 4), look = new Float32Array(n * 4);
  flames.forEach((f, i) => { place.set([f.x, f.y, f.z, f.height], i * 4); look.set([f.width, (i * 0.377) % 1, f.power ?? 1.6, 0], i * 4); });
  g.setAttribute('aPlace', new THREE.InstancedBufferAttribute(place, 4)); g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4)); g.instanceCount = n;
  const uniforms = { ...shared, tNoise: skyShared.tCloud };
  const make = (mir) => new THREE.ShaderMaterial({ defines: mir ? { MIRROR: '' } : {}, uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, make(false)); mesh.frustumCulled = false; mesh.renderOrder = 29; mesh.userData.mirrorOrder = 5; mesh.material.mirrorVariant = () => make(true);
  return mesh;
}

// ------------------------------------------------------------------------------------------------ threads of light
// The warp of the loom in the golden grove: each thread a hair of light hanging straight down, with glints that
// travel along it. Drawn as thin cards that turn to the eye, so that a thread is never thinner than the screen can show.
const THREAD_VERT = /* glsl */`
  attribute vec4 aTop; attribute vec4 aLook;                     // the top xyz + length; phase, brightness, width, sway
  uniform float uTime; uniform vec3 uThreadGain;
  varying vec2 vUv; varying vec2 vL; varying float vDist; varying float vY; varying float vThin;
  void main() {
    float t = position.y * 0.5 + 0.5;                             // 0 at the top .. 1 at the weight
    vec3 p = aTop.xyz - vec3(0.0, aTop.w * t, 0.0);
    float sw = sin(3.14159 * t) * aLook.w;
    p.x += sin(uTime * 0.7 + aLook.x * 40.0) * sw; p.z += cos(uTime * 0.53 + aLook.x * 27.0) * sw;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    #ifdef MIRROR
      wp.y = min(wp.y, -0.02);
    #endif
    vec4 mv = viewMatrix * wp; vDist = length(mv.xyz); vY = wp.y;
    float w = max(aLook.z, 0.003 * vDist);                        // the card is never narrower than a few pixels; the thread on it is drawn below
    mv.x += position.x * w;
    vUv = vec2(position.x, t); vL = vec2(aLook.x, aLook.y * uThreadGain.x); vThin = aLook.z / w;
    gl_Position = projectionMatrix * mv;
  }
`;
const THREAD_FRAG = /* glsl */`
  ${GLSL_FINISH}
  uniform vec3 uThreadColor;
  varying vec2 vUv; varying vec2 vL; varying float vDist; varying float vY; varying float vThin;
  void main() {
    // A thread far off is thinner than a pixel. Drawn as a tent exactly one pixel to either side it gives the same light
    // wherever it falls on the grid, so a whole warp of them does not beat against the screen; it only grows fainter.
    float px = 1.0 / max(fwidth(vUv.x), 1e-4), thick = px * vThin;
    float core = max(0.0, 1.0 - abs(vUv.x) * px / max(thick, 1.0)) * min(1.0, thick);
    float run = fract(vUv.y * 1.7 - uTime * (0.05 + 0.08 * fract(vL.x * 7.0)) + vL.x * 13.0);
    float glint = pow(max(0.0, 1.0 - abs(run - 0.5) * 9.0), 2.0);
    float a = core * (0.3 + 1.6 * glint) * (0.55 + 0.45 * sin(vL.x * 90.0 + uTime * 0.6)) * smoothstep(0.0, 0.02, vUv.y);
    gl_FragColor = vec4(developAdd(uThreadColor * a * vL.y * (1.0 - fogAmount(abs(vY), vDist, 0.4))), 1.0);
  }
`;
/** threads: [{ x, y, z (the top), length, power, width, sway }] */
export function makeThreads(threads, color = '#ffd27a') {
  const n = threads.length, g = quad(), top = new Float32Array(n * 4), look = new Float32Array(n * 4);
  threads.forEach((f, i) => { top.set([f.x, f.y, f.z, f.length], i * 4); look.set([Math.abs(Math.sin(i * 127.1 + 3.7) * 43758.5453) % 1, f.power ?? 1, f.width ?? 0.008, f.sway ?? 0.02], i * 4); });
  g.setAttribute('aTop', new THREE.InstancedBufferAttribute(top, 4)); g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4)); g.instanceCount = n;
  const uniforms = { ...shared, uThreadColor: { value: new THREE.Color(color) }, uThreadGain: { value: new THREE.Vector3(1, 0, 0) } };
  const make = (mir) => new THREE.ShaderMaterial({ defines: mir ? { MIRROR: '' } : {}, uniforms, vertexShader: THREAD_VERT, fragmentShader: THREAD_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });   // the card hangs downward, which turns its winding
  const mesh = new THREE.Mesh(g, make(false)); mesh.frustumCulled = false; mesh.renderOrder = 28; mesh.userData.mirrorOrder = 5; mesh.material.mirrorVariant = () => make(true); mesh.userData.uniforms = uniforms;
  return mesh;
}
