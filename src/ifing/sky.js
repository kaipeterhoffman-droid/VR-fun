// The sky: one dome that goes with the rider. Its lower half is the upper half upside down, which is what still
// water shows where nothing stands on the shore (src/ifing/water.js lays the dark glass over it).
//
// Painted in the shader, per pixel, from a handful of numbers per reach (src/ifing/look.js): three bands of colour,
// the afterglow that lies along the horizon where the sun went down, long bars of cloud lit from below on the side
// of the light, the stars and their river, the moon with its seas and its ring, and the northern lights.
import * as THREE from 'three';
import { GLSL_FINISH, shared } from './paint.js';
import { cloudTile } from './art.js';

const C = (h) => new THREE.Color(h);

export const skyShared = {
  uZenith: { value: C('#0a1c4a') }, uSkyMid: { value: C('#1f4a86') }, uHorizon: { value: C('#3f8f95') },
  uGlowDir: { value: new THREE.Vector3(0, 0, -1) }, uGlowColor: { value: C('#000000') }, uHaloColor: { value: C('#000000') },
  uMoonDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() }, uMoonColor: { value: C('#000000') },
  uCloudLit: { value: C('#ffffff') }, uCloudDark: { value: C('#000000') },
  uSkyP: { value: new THREE.Vector4(8, 2, 0.05, 0.5) },      // glow: how low it hugs; halo: the same; the moon's size; stars
  uSkyQ: { value: new THREE.Vector4(0.5, 0, 0, 0) },         // clouds, northern lights, the clouds' drift, -
  uAuroraDir: { value: new THREE.Vector3(0, 0, -1) },
  tCloud: { value: null },
};

/** The sky's colour in a direction (GLSL): what the water needs of it too. */
export const GLSL_SKY = /* glsl */`
  uniform vec3 uZenith, uSkyMid, uHorizon, uGlowDir, uGlowColor, uHaloColor, uMoonDir, uMoonColor, uCloudLit, uCloudDark;
  uniform vec4 uSkyP, uSkyQ;
  uniform sampler2D tCloud;
  // the bands, the afterglow and its halo. d.y is taken as already above the horizon.
  vec3 skyBase(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 c = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.3, h));
    c = mix(c, uZenith, smoothstep(0.2, 0.9, h));
    float az = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uGlowDir.xz + vec2(1e-5))), 0.0);
    float dh = abs(h - max(uGlowDir.y, 0.0));
    float a2 = az * az;
    c += uGlowColor * (a2 * a2 * a2 * exp(-dh * uSkyP.x)) + uHaloColor * (a2 * (0.4 + 0.6 * az) * exp(-dh * uSkyP.y));
    return c;
  }
  // the clouds over a direction: x = how much, y = how much of the light they catch
  vec2 skyCloud(vec3 d) {
    float h = max(d.y, 0.0);
    vec2 p = d.xz / (h + 0.16);                                // a ceiling: the bars draw together toward the horizon, as they do
    float a = texture2D(tCloud, p * vec2(0.021, 0.075) + vec2(uSkyQ.z, 0.0)).r;
    float b = texture2D(tCloud, p * vec2(0.06, 0.19) + vec2(-uSkyQ.z * 1.7, 0.37)).g;
    float lo = 0.66 - 0.14 * uSkyQ.x;
    float den = smoothstep(lo, lo + 0.17, a * 0.78 + b * 0.3) * min(uSkyQ.x * 1.6, 1.0);
    den *= smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.34, 0.7, h));
    float g = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uGlowDir.xz + vec2(1e-5))), 0.0);
    float lit = g * g * exp(-abs(h - max(uGlowDir.y, 0.0)) * 3.2) * (1.15 - 0.6 * a);
    return vec2(den, lit);
  }
  vec3 skyClouded(vec3 d) {
    vec3 c = skyBase(d);
    vec2 cl = skyCloud(d);
    return mix(c, mix(uCloudDark, uCloudLit, clamp(cl.y, 0.0, 1.0)), cl.x * 0.9);
  }
`;

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * (viewMatrix * vec4(cameraPosition + position * 900.0, 1.0));
    gl_Position = p.xyww;                                       // as far as anything can be
  }
`;

const FRAG = /* glsl */`
  ${GLSL_FINISH}
  ${GLSL_SKY}
  varying vec3 vDir;
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  // stars: one to a cell of the sky here and there, most of them faint, each with its own slow shiver
  float starField(vec3 d, float scale, float share) {
    vec3 p = d * scale, ip = floor(p), fp = p - ip - 0.5;
    float h = hash13(ip);
    if (h > share) return 0.0;
    vec3 o = (vec3(hash13(ip + 7.1), hash13(ip + 13.7), hash13(ip + 23.3)) - 0.5) * 0.7;
    float mag = 1.0 - h / share; mag = mag * mag; mag = mag * mag * mag;
    float tw = 0.72 + 0.28 * sin(uTime * (1.3 + h * 40.0) + h * 900.0);
    return smoothstep(0.13, 0.02, length(fp - o)) * (0.22 + 1.9 * mag) * tw;
  }
  // The northern lights: curtains hanging in the sky beyond the tree. Each is a wall of light standing across the
  // view at a distance, wandering as it goes, bright along its lower hem and fading upward, striped by the rays it
  // is made of. Because it is a real wall, seen in perspective, its rays stand upright and its hem arcs down toward
  // the horizon on either hand, as the real thing does.
  uniform vec3 uAuroraDir;
  vec3 curtain(vec3 d, float dist, float low, float tall, float phase) {
    vec2 f = normalize(uAuroraDir.xz), sd = vec2(-f.y, f.x);
    float along = dot(d.xz, f);
    if (along < 0.04) return vec3(0.0);
    float t = dist / along, x = dot(d.xz, sd) * t;
    float tm = uTime * 0.03;
    float wander = sin(x * 0.0021 + phase + tm) * 0.26 + sin(x * 0.0057 - phase * 1.7 - tm * 0.7) * 0.1;
    t *= 1.0 + wander; x = dot(d.xz, sd) * t;
    float y = d.y * t;
    float up = (y - low) / tall;
    float body = smoothstep(0.0, 0.06, up) * exp(-max(up, 0.0) * 2.6) * (1.0 - smoothstep(0.7, 1.25, up));
    float rays = 0.5 + 0.5 * sin(x * 0.045 + sin(x * 0.011 + tm * 4.0 + phase) * 3.0);
    rays = 0.3 + 0.7 * rays * (0.6 + 0.4 * sin(x * 0.19 + phase * 3.0 - tm * 6.0));
    float folds = 0.6 + 0.4 * sin(x * 0.004 + phase * 2.0 + tm * 1.5);
    vec3 col = mix(vec3(0.22, 1.0, 0.52), vec3(0.2, 0.75, 0.85), smoothstep(0.1, 0.5, up));
    col = mix(col, vec3(0.8, 0.3, 0.75), smoothstep(0.4, 1.0, up));
    return col * body * rays * folds * (1.0 - smoothstep(1400.0, 3000.0, abs(x)));
  }
  vec3 aurora(vec3 d) {
    vec3 a = curtain(d, 900.0, 170.0, 420.0, 0.0) + 0.7 * curtain(d, 1500.0, 260.0, 620.0, 2.3) + 0.5 * curtain(d, 620.0, 210.0, 300.0, 4.1);
    return a * smoothstep(0.02, 0.12, d.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    d.y = abs(d.y);                                             // below the horizon: the same sky, as still water gives it back
    float h = d.y;
    vec3 c = skyBase(d);
    vec2 cl = skyCloud(d);
    float open = 1.0 - cl.x;
    // the stars, and their river across the top of the sky
    if (uSkyP.w > 0.01) {
      float river = exp(-pow(dot(d, normalize(vec3(0.82, 0.25, 0.5))), 2.0) * 16.0);
      float st = starField(d, 88.0, 0.09 + 0.06 * river) + 0.7 * starField(d.zxy, 141.0, 0.09 + 0.1 * river);
      float lum = dot(c, vec3(0.3, 0.5, 0.2));
      vec3 starCol = mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.9, 0.74), hash13(floor(d * 88.0) + 3.3));
      c += starCol * st * uSkyP.w * smoothstep(0.03, 0.22, h) * open * clamp(1.0 - lum * 2.2, 0.0, 1.0);
      c += vec3(0.16, 0.2, 0.34) * river * uSkyP.w * 0.22 * smoothstep(0.1, 0.5, h) * open;
    }
    if (uSkyQ.y > 0.01) c += aurora(d) * uSkyQ.y * (0.35 + 0.65 * open);
    // the moon: a disc with its seas, a ring close round it, a wide soft light in the air
    float md = dot(d, uMoonDir), r = uSkyP.z;
    if (uMoonColor.r + uMoonColor.g > 0.001) {
      float disc = smoothstep(1.0 - r * r * 0.5, 1.0 - r * r * 0.5 * 0.86, md);
      vec3 side = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), up = cross(side, uMoonDir);
      vec2 q = vec2(dot(d, side), dot(d, up)) / r;
      float seas = texture2D(tCloud, q * 0.19 + 0.31).g;
      vec3 face = uMoonColor * (0.74 + 0.36 * smoothstep(0.35, 0.7, seas)) * (1.0 - 0.22 * dot(q, q));
      float ring = exp(-pow((acos(clamp(md, -1.0, 1.0)) - r * 2.6) / (r * 0.5), 2.0)) * 0.035;
      float corona = pow(max(md, 0.0), 2.0 / (r * r)) * 0.2 + pow(max(md, 0.0), 0.09 / (r * r)) * 0.06;
      c += uMoonColor * (corona + ring) * (0.4 + 0.6 * open);
      c = mix(c, face, disc * (0.25 + 0.75 * open));
    }
    c = mix(c, mix(uCloudDark, uCloudLit, clamp(cl.y, 0.0, 1.0)), cl.x * 0.92);
    // the air lying on the horizon
    float g = max(dot(d, uFogGlowDir), 0.0);
    c = mix(c, uFogColor + uFogGlowColor * g * g * g, exp(-h * 11.0) * 0.42);
    gl_FragColor = develop(c, 1.0);
  }
`;

export class Sky {
  constructor() {
    skyShared.tCloud.value = cloudTile();
    this.uniforms = { ...shared, ...skyShared };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 900; this.mesh.name = 'sky';
  }
  update(dt) { this.uniforms.uSkyQ.value.z += dt * 0.0016; }
}
