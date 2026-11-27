// The water: a sheet of dark glass over the mirror world (src/ifing/world.js), and the rings that anything
// touching it leaves.
//
// THE GLASS. What is under the sheet when it is drawn is already the reflection: the world upside down, or, where
// nothing stands, the sky dome's lower half. The sheet decides how much of that to keep. Looking down, little
// (you see into the dark of the river). Looking along it, nearly all. Where a wavelet tips the surface, the mirror
// breaks, and that piece of the water shows a higher, brighter piece of sky instead, as real water does. That one
// rule gives the long quiet reflections, the streaks of light across them, the moon's road and the glitter of a
// fire on the far bank. It is one blended drawing, with no second picture of the scene behind it.
//
// THE RINGS. A small square of water (24 m) that follows the boat is simulated: the hull, the paddle and whatever
// else calls touch() push it, and the rings travel. Where the water has been touched it glints gold: the old poets'
// name for gold was "fire of the river".
import * as THREE from 'three';
import { GLSL_FINISH, GLSL_FRONT, shared, MAX_LIGHTS } from './paint.js';
import { GLSL_SKY, skyShared } from './sky.js';
import { waveTile } from './art.js';
import { river, LENGTH } from './river.js';

// ------------------------------------------------------------------------------------------------ the rings
const SIM = 256, WINDOW = 24, MAX_TOUCH = 8;
const SIM_VERT = /* glsl */`
  in vec3 position; out vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const SIM_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tState; uniform vec2 uShift; uniform float uTexel; uniform vec4 uSrc[${MAX_TOUCH}];
  in vec2 vUv; out vec4 o;
  void main() {
    vec2 uv = vUv + uShift;                                   // the square has moved with the boat: look where this water was
    vec2 s = texture(tState, uv).rg;                          // height now, height a step ago
    float sum = texture(tState, uv + vec2(uTexel, 0.0)).r + texture(tState, uv - vec2(uTexel, 0.0)).r
              + texture(tState, uv + vec2(0.0, uTexel)).r + texture(tState, uv - vec2(0.0, uTexel)).r;
    float h = (2.0 * s.r - s.g + 0.085 * (sum - 4.0 * s.r)) * 0.9915;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { h = 0.0; s.r = 0.0; }
    for (int i = 0; i < ${MAX_TOUCH}; i++) { vec4 q = uSrc[i]; vec2 d = (vUv - q.xy) / max(q.z, 1e-4); h += q.w * exp(-dot(d, d) * 2.4); }
    vec2 e = smoothstep(vec2(0.0), vec2(0.07), vUv) * smoothstep(vec2(0.0), vec2(0.07), 1.0 - vUv);
    h *= mix(0.86, 1.0, e.x * e.y);                           // the rings die at the square's edge and do not come back
    o = vec4(clamp(h, -4.0, 4.0), s.r, 0.0, 1.0);
  }
`;
const NORMAL_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tState; uniform float uTexel;
  in vec2 vUv; out vec4 o;
  void main() {
    vec2 c = texture(tState, vUv).rg;
    float l = texture(tState, vUv - vec2(uTexel, 0.0)).r, r = texture(tState, vUv + vec2(uTexel, 0.0)).r;
    float d = texture(tState, vUv - vec2(0.0, uTexel)).r, u = texture(tState, vUv + vec2(0.0, uTexel)).r;
    vec2 slope = vec2(r - l, u - d) * 1.6;
    float stir = clamp(abs(c.r - c.g) * 22.0 + abs(c.r) * 0.35, 0.0, 1.0);        // water that is moving now, far more than water that merely stands high
    vec2 e = smoothstep(vec2(0.0), vec2(0.1), vUv) * smoothstep(vec2(0.0), vec2(0.1), 1.0 - vUv);
    o = vec4(clamp(slope * e.x * e.y * 0.5 + 0.5, 0.0, 1.0), stir * e.x * e.y, 1.0);
  }
`;

export class Ripples {
  constructor(renderer) {
    this.ok = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.rect = new THREE.Vector4(0, 0, 1 / WINDOW, 0);
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, THREE.RGBAFormat); flat.needsUpdate = true;
    this.texture = flat;
    this.touches = []; this.center = new THREE.Vector2(); this.acc = 0; this.first = true;
    if (!this.ok) return;
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    this.a = new THREE.WebGLRenderTarget(SIM, SIM, opts); this.b = new THREE.WebGLRenderTarget(SIM, SIM, opts);
    this.out = new THREE.WebGLRenderTarget(SIM, SIM, { ...opts, type: THREE.UnsignedByteType });
    for (const t of [this.a, this.b, this.out]) t.texture.colorSpace = THREE.NoColorSpace;
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.simMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SIM_VERT, fragmentShader: SIM_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tState: { value: null }, uShift: { value: new THREE.Vector2() }, uTexel: { value: 1 / SIM }, uSrc: { value: Array.from({ length: MAX_TOUCH }, () => new THREE.Vector4(0, 0, 1, 0)) } } });
    this.normalMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SIM_VERT, fragmentShader: NORMAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tState: { value: null }, uTexel: { value: 1 / SIM } } });
    this.quad = new THREE.Mesh(tri, this.simMat); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.texture = this.out.texture; this.rect.w = 1;
  }

  /** Push the water at a place: radius in metres; strength up to about 1 (a paddle stroke), negative pulls it down. */
  touch(x, z, radius, strength) { if (this.ok && this.touches.length < MAX_TOUCH * 2) this.touches.push(x, z, radius, strength); }

  update(renderer, cx, cz, dt) {
    if (!this.ok) return;
    const cell = WINDOW / SIM, nx = Math.round(cx / cell) * cell, nz = Math.round(cz / cell) * cell;
    this.acc = Math.min(this.acc + dt * 60, 2.5);
    const xr = renderer.xr.enabled, rt = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    let steps = 0;
    while (this.acc >= 1 && steps < 2) {
      this.acc -= 1; steps++;
      const u = this.simMat.uniforms;
      u.uShift.value.set(this.first ? 0 : (nx - this.center.x) / WINDOW, this.first ? 0 : (nz - this.center.y) / WINDOW);
      this.center.set(nx, nz); this.first = false;
      for (let i = 0; i < MAX_TOUCH; i++) {
        const q = u.uSrc.value[i];
        if (i * 4 < this.touches.length) q.set((this.touches[i * 4] - nx) / WINDOW + 0.5, (this.touches[i * 4 + 1] - nz) / WINDOW + 0.5, this.touches[i * 4 + 2] / WINDOW, this.touches[i * 4 + 3]);
        else q.set(0, 0, 1, 0);
      }
      this.touches.splice(0, MAX_TOUCH * 4);
      u.tState.value = this.a.texture;
      this.quad.material = this.simMat; renderer.setRenderTarget(this.b); renderer.render(this.scene, this.camera);
      const t = this.a; this.a = this.b; this.b = t;
    }
    if (steps) {
      this.normalMat.uniforms.tState.value = this.a.texture;
      this.quad.material = this.normalMat; renderer.setRenderTarget(this.out); renderer.render(this.scene, this.camera);
    }
    renderer.setRenderTarget(rt); renderer.xr.enabled = xr;
    this.rect.set(this.center.x, this.center.y, 1 / WINDOW, 1);
  }
}

// ------------------------------------------------------------------------------------------------ the glass
const VERT = /* glsl */`
  attribute vec3 aEdge;
  varying vec3 vWPos; varying vec3 vView; varying vec3 vEdge;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWPos = wp.xyz; vEdge = aEdge;
    vec4 mv = viewMatrix * wp; vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  ${GLSL_FINISH}
  ${GLSL_SKY}
  ${GLSL_FRONT}
  uniform vec3 uDeep, uTouch; uniform vec4 uWaterP, uRippleRect;
  uniform sampler2D tWave, tRipple;
  uniform vec3 uLanternPos, uLanternColor; uniform float uLanternRadius;
  uniform vec4 uLights[${MAX_LIGHTS}]; uniform vec3 uLightColors[${MAX_LIGHTS}]; uniform vec4 uLightGlint;
  varying vec3 vWPos; varying vec3 vView; varying vec3 vEdge;                  // (how near the bank, the sheet's own rim, metres out from the waterline)
  // a flame over water: the light it lays on the surface, and its glitter on the wavelets that face the eye
  vec3 flame(vec3 P, vec3 N, vec3 V, vec3 lp, vec3 lc, float r) {
    vec3 d = lp - P; float dist = length(d); vec3 L = d / max(dist, 1e-3);
    float att = 1.0 - smoothstep(r * 0.15, r * 2.2, dist); att *= att;
    float sp = pow(max(dot(N, normalize(L + V)), 0.0), 240.0);
    return lc * att * (sp * 2.6 + 0.014 * max(L.y, 0.0));
  }
  void main() {
    float dist = length(vView);
    vec3 V = normalize(cameraPosition - vWPos);
    vec2 p = vWPos.xz;
    float near = 1.0 / (1.0 + dist * 0.05);
    vec2 slope = ((texture2D(tWave, p * 0.047 + vec2(0.004, 0.009) * uTime).rg - 0.5) * 0.5
               + (texture2D(tWave, p * 0.19 + vec2(-0.017, 0.013) * uTime).rg - 0.5) * 0.7) * uWaterP.x * (0.35 + 0.65 * near);
    float stir = 0.0;
    vec2 ru = (p - uRippleRect.xy) * uRippleRect.z + 0.5;
    if (uRippleRect.w > 0.5 && ru.x > 0.0 && ru.x < 1.0 && ru.y > 0.0 && ru.y < 1.0) { vec4 rp = texture2D(tRipple, ru); slope += (rp.rg - 0.5) * 2.0; stir = rp.b; }
    // a front going over: a cat's-paw. The water under it is ruffled fine and stops being a mirror, so that a pale
    // band crosses the dark of the river
    float fr = uFrontP.y + uFrontP.z > 0.0 ? frontAt(vWPos) : 0.0, paw = min(fr * uFrontP.y * 0.22, 1.0);
    if (paw > 0.01) { slope += (texture2D(tWave, p * 0.61 + vec2(0.09, -0.07) * uTime).rg - 0.5) * (1.5 * paw); }
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    float cosT = max(dot(N, V), 0.0);
    float F = uWaterP.y + (1.0 - uWaterP.y) * pow(1.0 - cosT, 4.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.015; R = normalize(R);
    float broken = clamp(length(slope) * 4.2 * uWaterP.z + stir * 0.35 + paw * 0.3, 0.0, 0.88);       // how far this piece of water is from a mirror
    float m = 1.0 - broken;
    vec3 sky = skyClouded(R);
    float mh = dot(R, uMoonDir), mr = uSkyP.z;
    sky += uMoonColor * smoothstep(1.0 - mr * mr * 1.6, 1.0 - mr * mr * 0.3, mh) * 1.4;      // the moon's road
    float shore = vEdge.x * vEdge.x;
    vec3 body = uDeep * (1.0 + 1.6 * shore) + uFogColor * 0.05 * shore;
    float shoal = 1.0 - smoothstep(0.0, 1.7, vEdge.z);
    body += (uDeep * 1.5 + uFogColor * 0.11) * shoal * shoal;                // the last of the water is thin, and the bed shows through it
    vec3 c = body * (1.0 - F) + sky * (F * broken);
    // and the pillar of it: a column of broken light from under the moon to the bow, each piece of it lying across
    // the way one looks (it is what Munch painted every summer of his life). The pieces are laid out by bearing and
    // by the logarithm of distance, so that they are the same size to the eye near and far
    vec2 md = normalize(uMoonDir.xz + vec2(1e-5)), q = p - cameraPosition.xz;
    float along = dot(q, md), ang = (q.x * md.y - q.y * md.x) / max(along, 0.5);
    if (along > 2.5 && abs(ang) < 0.13 && uMoonDir.y > 0.02) {
      float ld = log2(along);
      float d1 = texture2D(tWave, vec2(ang * 0.9, ld * 1.6 + uTime * 0.011)).r - 0.5;
      float d2 = texture2D(tWave, vec2(ang * 1.7 + 0.31, ld * 2.9 - uTime * 0.019)).g - 0.5;
      float road = (1.0 - smoothstep(0.015, 0.1, abs(ang) + d2 * 0.1)) * smoothstep(2.5, 9.0, along);
      c += uMoonColor * road * (0.1 + 0.9 * smoothstep(-0.02, 0.07, d1 + d2)) * 0.5;
    }
    c += uFrontColor * (fr * uFrontP.z * 0.22 * smoothstep(0.5, 3.0, uFrontP.x));      // and a front of light lies on the water as it goes (a broad one: a shuttle's does not)
    c += flame(vWPos, N, V, uLanternPos, uLanternColor, uLanternRadius);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) c += flame(vWPos, N, V, uLights[i].xyz, uLightColors[i], uLights[i].w) * uLightGlint[i];
    // turned water takes the lantern's colour only where the lantern reaches it; further off it is merely less of a mirror
    float reach = 1.0 - smoothstep(uLanternRadius * 0.2, uLanternRadius * 2.0, length(uLanternPos - vWPos));
    c += uTouch * (stir * stir) * (reach * reach);
    // where the water meets the land: a thread of light that comes and goes with the wavelets, and is never a ruled line
    float lapN = texture2D(tWave, p * 0.83 + vec2(0.021, -0.016) * uTime).g - 0.5;
    float lap = (1.0 - smoothstep(0.0, 0.16, abs(vEdge.z - 0.03 - lapN * 0.3 - 0.05 * sin(uTime * 0.8 + p.x * 0.61 + p.y * 0.83)))) * near;
    c += (sky * 0.55 + uFogColor * 0.3 + uTouch * (reach * reach * reach * reach) * 0.3) * lap * 0.55;
    float fog = fogAmount(0.0, dist, 1.0);
    c = mix(c, fogTint(-V, 0.0), fog);
    float keep = F * m * (1.0 - fog) * (1.0 - lap * 0.6);
    c *= vEdge.y; keep = mix(1.0, keep, vEdge.y) * (1.0 - uVeil);            // at its far rim the sheet thins away into the dome's own mirror
    gl_FragColor = develop(c, keep);
  }
`;

export class Water {
  constructor(renderer) {
    this.ripples = new Ripples(renderer);
    this.uniforms = {
      ...shared, ...skyShared,
      uDeep: { value: new THREE.Color('#06142c') }, uTouch: { value: new THREE.Color('#ffb648').multiplyScalar(0.55) },
      uWaterP: { value: new THREE.Vector4(0.5, 0.4, 1, 0) },                 // waves, how much it mirrors looking straight down, how easily the mirror breaks
      tWave: { value: waveTile() }, tRipple: { value: this.ripples.texture }, uRippleRect: { value: this.ripples.rect },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.buildGeometry(), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; this.mesh.name = 'water';
  }

  // A ribbon that follows the river from bank to bank and a little under each, widening into the bay behind the
  // landing and into the well at the end.
  buildGeometry() {
    const cols = [-1.0, -0.86, -0.45, 0, 0.45, 0.86, 1.0], pos = [], edge = [], idx = [];
    const rows = [];
    for (let s = -420; s < -60; s += 30) rows.push(s);
    for (let s = -60; s < LENGTH; s += 2.5) rows.push(s);
    for (let s = LENGTH; s <= LENGTH + 1500; s += 60) rows.push(s);
    const pt = [0, 0];
    rows.forEach((s, r) => {
      const hw = river.halfWidth(s) + 2.2;
      const rim = s < -60 ? Math.max(0, 1 - (-60 - s) / 330) : s > LENGTH ? Math.max(0, 1 - (s - LENGTH) / 1400) : 1;
      for (const c of cols) {
        river.point(s, c * hw, pt);
        pos.push(pt[0], 0, pt[1]);
        const wide = Math.abs(c) > 0.99 ? 1 - Math.min(1, Math.max(0, (hw - 40) / 30)) : 1;   // out on the open water the sheet's side rims fade too
        edge.push(Math.max(0, (Math.abs(c) - 0.45) / 0.55), rim * wide, hw - 2.2 - Math.abs(c) * hw);
      }
      if (r > 0) for (let c = 0; c < cols.length - 1; c++) {
        const a = (r - 1) * cols.length + c, b = a + 1, d = r * cols.length + c, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 3));
    g.setIndex(idx);
    return g;
  }

  update(renderer, x, z, dt) {
    this.ripples.update(renderer, x, z, dt);
    this.uniforms.tRipple.value = this.ripples.texture;
  }
}
