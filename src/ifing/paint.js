// Paint: the one material nearly everything on the river wears, and the finishing that every pixel gets.
//
// A headset cannot afford to draw the picture and then work it over (bloom, a painter's filter, a grading pass):
// each of those is another full-screen drawing for each eye, and switches off the cheap anti-aliasing and the
// foveation the headset gives for nothing. So nothing here is done afterwards. Each surface is painted once, in the
// shader that draws it:
//   - three tones of light instead of smooth shading (the reach's shade, its half-light, its light), dry-brushed
//     at the steps, with a coloured dark that is never grey;
//   - the lights that travel: the lantern on the bow and the four fires or lamps that matter most where the boat is;
//   - moss on what faces up, a wet band where things stand in water, light through leaves, an edge of light;
//   - fog by distance, mist that lies on the water, and a glow in the fog toward the brightest part of the sky;
//   - the film curve, the grade and a breath of dither, so that a night sky does not band on an 8-bit screen.
// The world under the water (src/ifing/world.js, "the mirror") is the same things drawn again upside down: the
// MIRROR variant of this shader lights them as the things they are, wavers them, and keeps them under the surface.
import * as THREE from 'three';

export const MAX_LIGHTS = 4;
const C = (hex) => new THREE.Color(hex);

/** Uniforms every material shares. src/ifing/look.js fills them each frame from where the boat is. */
export const shared = {
  uTime: { value: 0 },
  uFogColor: { value: C('#1c3a55') }, uFogDensity: { value: 0.011 },
  uFogHeight: { value: new THREE.Vector3(0.2, 3.0, 0) },            // mist on the water: amount, the height it thins over
  uFogGlowDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() }, uFogGlowColor: { value: C('#000000') },
  uMistColor: { value: C('#6fa0a8') },
  uVeilColor: { value: C('#000000') }, uVeil: { value: 0 },
  uExposure: { value: 1 }, uGradeTint: { value: C('#ffffff') }, uGradeLift: { value: C('#000000') }, uGradeSat: { value: 1 }, uGradeContrast: { value: 1 },
  uKeyDir: { value: new THREE.Vector3(-0.3, -0.6, -0.5).normalize() },
  uShade: { value: C('#0b1730') }, uHalf: { value: C('#24405a') }, uLit: { value: C('#d6e6c8') },
  uSkyLight: { value: C('#1f3d66') }, uGroundLight: { value: C('#0a1420') }, uLightGain: { value: 3 },
  uLanternPos: { value: new THREE.Vector3(0, -100, 0) }, uLanternColor: { value: C('#000000') }, uLanternRadius: { value: 9 },
  uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -1000, 0, 1)) },
  uLightColors: { value: Array.from({ length: MAX_LIGHTS }, () => C('#000000')) },
  uWind: { value: new THREE.Vector4(0.8, 0.6, 1, 1) },               // direction (x, z), strength, speed
  uMirror: { value: new THREE.Vector4(0.22, 1.12, 1, 0) },           // the water's copy: darker by x, richer by y, how far it wavers
  uMirrorTint: { value: C('#ffffff') },
  tBrush: { value: null },
};

// ------------------------------------------------------------------------------------------------ shared GLSL
export const GLSL_FINISH = /* glsl */`
  uniform float uTime;
  uniform vec3 uFogColor, uFogHeight, uFogGlowDir, uFogGlowColor, uMistColor, uVeilColor;
  uniform float uFogDensity, uVeil;
  uniform float uExposure, uGradeSat, uGradeContrast; uniform vec3 uGradeTint, uGradeLift;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  // how much of a thing the air takes: by distance, and more where the sight runs low over the water
  float fogAmount(float height, float dist, float scale) {
    float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * scale);
    float low = exp(-max(height, 0.0) / max(uFogHeight.y, 0.01));
    f += uFogHeight.x * low * (1.0 - exp(-dist * 0.03)) * (1.0 - f);
    return clamp(f, 0.0, 1.0);
  }
  vec3 fogTint(vec3 dir, float height) {
    float g = max(dot(dir, uFogGlowDir), 0.0); g = g * g * g;
    float low = exp(-max(height, 0.0) / max(uFogHeight.y, 0.01));
    return mix(uFogColor, uMistColor, low * 0.55) + uFogGlowColor * g;
  }
  vec3 filmCurve(vec3 x) { return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); }
  // the picture's last word: exposure, a film curve that keeps a flame's colour as it brightens, the grade, a dither
  vec4 develop(vec3 c, float alpha) {
    c = mix(c, uVeilColor, uVeil);
    c = max(c * uExposure * uGradeTint, 0.0);
    float peak = max(max(c.r, c.g), max(c.b, 1e-5));
    c = clamp(mix(filmCurve(vec3(peak)) * (c / peak), filmCurve(c), 0.5), 0.0, 1.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uGradeSat);
    c = (c - 0.5) * uGradeContrast + 0.5;
    c = c + uGradeLift * (1.0 - c);
    vec4 o = linearToOutputTexel(vec4(clamp(c, 0.0, 1.0), alpha));
    o.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
    return o;
  }
  // the same for light that is added over the picture (a halo, a spark): nothing may be added where there is none
  vec3 developAdd(vec3 c) {
    c = max(c * uExposure * uGradeTint, 0.0);
    float peak = max(max(c.r, c.g), max(c.b, 1e-5));
    c = clamp(mix(filmCurve(vec3(peak)) * (c / peak), filmCurve(c), 0.5), 0.0, 1.0);
    return linearToOutputTexel(vec4(c, 1.0)).rgb * (1.0 - uVeil);
  }
`;

const LIGHT_PARS = /* glsl */`
  uniform vec3 uKeyDir, uShade, uHalf, uLit, uSkyLight, uGroundLight; uniform float uLightGain;
  uniform vec3 uLanternPos, uLanternColor; uniform float uLanternRadius;
  uniform vec4 uLights[${MAX_LIGHTS}]; uniform vec3 uLightColors[${MAX_LIGHTS}];
  vec3 lampLight(vec3 P, vec3 N, vec3 lp, vec3 lc, float r) {
    vec3 d = lp - P; float dist = length(d);
    float att = 1.0 - smoothstep(r * 0.15, r, dist); att *= att;
    return lc * att * max(dot(N, d / max(dist, 1e-3)) * 0.62 + 0.38, 0.0);      // wrapped: paint near a flame warms even when turned a little from it
  }
  // the light that falls on a place. First the reach's own: three flat tones by how the surface faces the key light,
  // with the sky above and the ground's bounce below...
  vec3 toneLight(vec3 N, float stroke) {
    float w = clamp(dot(N, -uKeyDir) * 0.5 + 0.5 + stroke * 0.09, 0.0, 1.0);
    float q = floor(w * 3.0) / 3.0, f = fract(w * 3.0);
    w = mix(w, q + smoothstep(0.38, 0.62, f) / 3.0, 0.82);
    vec3 tone = w < 0.5 ? mix(uShade, uHalf, smoothstep(0.0, 0.5, w)) : mix(uHalf, uLit, smoothstep(0.5, 1.0, w));
    return (tone + mix(uGroundLight, uSkyLight, N.y * 0.5 + 0.5)) * uLightGain;
  }
  // ...then the lights that travel: the lantern on the bow, and the four fires that matter most from here
  vec3 lampsLight(vec3 P, vec3 N) {
    vec3 l = lampLight(P, N, uLanternPos, uLanternColor, uLanternRadius);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) l += lampLight(P, N, uLights[i].xyz, uLightColors[i], uLights[i].w);
    return l;
  }
`;

const VERT = /* glsl */`
  uniform float uTime; uniform vec4 uWind; uniform vec4 uMirror;
  #ifdef SWAY
    attribute float aBend; uniform vec3 uSway;                 // metres at full bend, speed, how much the gusts flutter it
  #endif
  varying vec3 vWPos; varying vec3 vN; varying vec3 vView; varying vec2 vUv; varying vec3 vCol;
  #ifdef VERTEX_LIT
    ${LIGHT_PARS}
    varying vec3 vLight;
  #endif
  void main() {
    vUv = uv;
    vCol = vec3(1.0);
    #ifdef USE_COLOR
      vCol *= color.rgb * color.rgb;                              // corners keep the square root of their colour (src/ifing/build.js)
    #endif
    #ifdef USE_INSTANCING_COLOR
      vCol *= instanceColor;
    #endif
    vec4 wp = vec4(position, 1.0); vec3 wn = normal;
    #ifdef USE_INSTANCING
      wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
    #endif
    wp = modelMatrix * wp; wn = mat3(modelMatrix) * wn;
    #ifdef SWAY
      float ph = wp.x * 0.19 + wp.z * 0.23;
      float sw = sin(uTime * uWind.w * uSway.y + ph) * 0.6 + sin(uTime * uWind.w * uSway.y * 0.43 + ph * 1.7 + 1.7) * 0.4;
      float fl = sin(uTime * uSway.y * 5.1 + ph * 9.0 + position.y * 3.0) * uSway.z;
      wp.xz += uWind.xy * uWind.z * uSway.x * aBend * (sw + fl);
    #endif
    vec3 lp = wp.xyz;                                            // the place that is lit
    #ifdef MIRROR
      // the water's copy: the thing itself is lit, where it stands; its picture wavers a little more the higher
      // above the water the thing reaches, and never comes up through the surface
      float h = -wp.y; lp.y = h; wn.y = -wn.y;
      float k = min(max(h, 0.0), 14.0);
      float amp = (0.012 + 0.006 * k) * uMirror.z;
      wp.x += (sin(h * 2.3 + uTime * 1.25 + wp.z * 0.31) + 0.6 * sin(h * 5.1 - uTime * 1.9 + wp.x * 0.47)) * amp;
      wp.z += (sin(h * 1.9 - uTime * 1.05 + wp.x * 0.27) + 0.6 * sin(h * 4.3 + uTime * 1.6 + wp.z * 0.39)) * amp;
      wp.y = min(wp.y, -0.02);
    #endif
    vWPos = lp; vN = normalize(wn);
    vec4 mv = viewMatrix * wp; vView = mv.xyz;
    #ifdef VERTEX_LIT
      vLight = lampsLight(lp, vN);
    #endif
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  ${GLSL_FINISH}
  ${LIGHT_PARS}
  #ifdef VERTEX_LIT
    varying vec3 vLight;
  #endif
  uniform vec3 uColor, uEmissive, uTopColor, uBackColor; uniform vec4 uTop, uRim, uMirror; uniform vec3 uMirrorTint;
  uniform float uBrush, uBrushScale, uWet, uBack, uFogScale, uAlphaTest, uInside;
  uniform sampler2D tBrush, tMap;
  varying vec3 vWPos; varying vec3 vN; varying vec3 vView; varying vec2 vUv; varying vec3 vCol;
  // the shared dry-brush strokes, laid from above and from the side (two looks at the picture, no seams on round things)
  float strokes(vec3 p, vec3 n) {
    float up = smoothstep(0.35, 0.8, abs(n.y));
    vec2 top = p.xz * uBrushScale, side = vec2(p.x + p.z, p.y * 1.3) * uBrushScale;
    float a = texture2D(tBrush, top).r, b = texture2D(tBrush, side).r;
    // within arm's reach and a little beyond, the same brush again four times finer: the hairs inside the stroke
    float fine = (texture2D(tBrush, (up > 0.5 ? top : side) * 4.3 + 0.37).r - 0.5) * (1.0 - smoothstep(1.5, 9.0, length(vView)));
    return clamp((mix(b, a, up) - 0.5) * 4.0 + fine * 2.2, -1.0, 1.0);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 albedo = uColor * vCol; float alpha = 1.0;
    #ifdef DOUBLE_SIDED
      if (!gl_FrontFacing) { N = -N; albedo *= uInside; }
    #endif
    #ifdef USE_MAP
      vec4 tx = texture2D(tMap, vUv, -0.5); albedo *= tx.rgb; alpha = tx.a;      // (half a level sharper than the mip the screen asks for: the multisampling carries it)
      #ifdef CUTOUT
        // a cut-out with a soft, anti-aliased edge (the headset's multisampling takes the alpha as coverage)
        alpha = clamp((alpha - uAlphaTest) / max(fwidth(alpha), 1e-4) + 0.5, 0.0, 1.0);
        if (alpha < 0.02) discard;
      #endif
    #endif
    float stroke = 0.0;
    #ifdef BRUSH
      stroke = strokes(vWPos, N);
      albedo *= 1.0 + stroke * uBrush;
    #endif
    #ifdef TOP
      // what faces the sky is grown over (moss, needles, snow of lichen): by its lean, broken by the brush
      float up = smoothstep(uTop.x, uTop.y, N.y + stroke * 0.18) * uTop.z;
      albedo = mix(albedo, uTopColor * (0.8 + 0.4 * vCol.g), up);
    #endif
    #ifdef WET
      albedo *= mix(0.42, 1.0, smoothstep(0.0, uWet, vWPos.y + stroke * 0.06));
    #endif
    #ifdef VERTEX_LIT
      vec3 c = albedo * (toneLight(N, stroke) + vLight);
    #else
      vec3 c = albedo * (toneLight(N, stroke) + lampsLight(vWPos, N));
    #endif
    vec3 V = normalize(cameraPosition - vWPos);
    #ifdef MIRROR
      V = normalize(vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z) - vWPos);
      #ifdef CLIP_BELOW
        if (vWPos.y < 0.0) discard;                                 // what is under the water has no picture in it
      #endif
    #endif
    #ifdef BACKLIGHT
      c += albedo * uBackColor * uLit * uLightGain * (pow(max(dot(V, uKeyDir), 0.0), 2.5) * 0.8 + 0.2) * uBack;
    #endif
    #ifdef RIM
      c += uLit * uLightGain * 0.3 * uRim.rgb * pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), uRim.w) * smoothstep(-0.3, 0.6, dot(V, uKeyDir));
    #endif
    c += uEmissive;
    float dist = length(vView);
    #ifdef MIRROR
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, uMirror.y) * (1.0 - uMirror.x) * uMirrorTint;
    #endif
    float fog = fogAmount(vWPos.y, dist, uFogScale);
    c = mix(c, fogTint(-V, vWPos.y), fog);
    gl_FragColor = develop(c, alpha);
  }
`;

const defaults = {
  color: '#ffffff', map: null, cutout: false, alphaTest: 0.5, side: THREE.FrontSide, vertexLit: false, vertexColors: true,
  brush: 0.16, brushScale: 0.3, top: null, wet: 0, backlight: 0, backColor: '#ffffff', rim: null, emissive: '#000000', emissiveIntensity: 1,
  sway: null, fogScale: 1, mirror: false, transparent: false, inside: 0.55, clipBelow: false,
};

/**
 * A painted material. opts:
 *   color               the thing's own colour, as it would look in plain daylight (the reach's light does the rest)
 *   map, cutout         a painted texture on the mesh's UVs; cutout: its alpha cuts the shape out, with a soft edge
 *   brush, brushScale   strength of the shared dry-brush strokes (0 = none) and how many repeats to the metre
 *   top                 { color, from, to, amount }: what faces up is grown over with this colour
 *   wet                 metres above the water over which the thing is dark with wet
 *   backlight, backColor   light through thin things that hang between the eye and the light
 *   rim                 { color, power }: an edge of the reach's light round what stands against it
 *   emissive, emissiveIntensity   paint that gives off light
 *   sway                { amp, speed, flutter }: moves in the wind by its `aBend` attribute (0 fixed .. 1 free)
 *   vertexLit           the lamps' light worked out at the corners, not at every pixel (trees, leaves, grass)
 *   inside              how dark the back of a two-sided thing is (the inside of a skirt of boughs)
 *   fogScale            below 1 for very large far things that must loom through the air
 *   clipBelow           for things that go down into the water (a hull, a paddle): the part under it is not reflected
 *   side
 */
export function makePaint(opts = {}) {
  const o = { ...defaults, ...opts };
  const defines = {};
  if (o.map) defines.USE_MAP = '';
  if (o.map && o.cutout) defines.CUTOUT = '';
  if (o.side === THREE.DoubleSide) defines.DOUBLE_SIDED = '';
  if (o.vertexLit) defines.VERTEX_LIT = '';
  if (o.brush > 0) defines.BRUSH = '';
  if (o.top) defines.TOP = '';
  if (o.wet > 0) defines.WET = '';
  if (o.backlight > 0) defines.BACKLIGHT = '';
  if (o.rim) defines.RIM = '';
  if (o.sway) defines.SWAY = '';
  if (o.mirror) defines.MIRROR = '';
  if (o.clipBelow) defines.CLIP_BELOW = '';
  const top = o.top || {}, rim = o.rim || {}, sw = o.sway || {};
  const rc = C(rim.color ?? '#ffffff');
  const uniforms = {
    ...shared,
    uColor: { value: C(o.color) }, tMap: { value: o.map }, uAlphaTest: { value: o.alphaTest },
    uEmissive: { value: C(o.emissive).multiplyScalar(o.emissiveIntensity) },
    uBrush: { value: o.brush }, uBrushScale: { value: o.brushScale },
    uTopColor: { value: C(top.color ?? '#4a6a2a') }, uTop: { value: new THREE.Vector4(top.from ?? 0.25, top.to ?? 0.7, top.amount ?? 1, 0) },
    uWet: { value: o.wet }, uBack: { value: o.backlight }, uBackColor: { value: C(o.backColor) },
    uRim: { value: new THREE.Vector4(rc.r * (rim.strength ?? 0.5), rc.g * (rim.strength ?? 0.5), rc.b * (rim.strength ?? 0.5), rim.power ?? 3) },
    uSway: { value: new THREE.Vector3(sw.amp ?? 0.2, sw.speed ?? 1, sw.flutter ?? 0.1) },
    uFogScale: { value: o.fogScale }, uInside: { value: o.inside },
  };
  const mat = new THREE.ShaderMaterial({
    defines, uniforms, vertexShader: VERT, fragmentShader: FRAG, side: o.side, vertexColors: o.vertexColors,
    transparent: o.transparent, alphaToCoverage: !!(o.map && o.cutout),
  });
  mat.isPaint = true; mat.paintOpts = o;
  return mat;
}

const mirrors = new WeakMap();
/** The same paint as the water keeps it (one per material, made when first asked for). */
export function mirrorOf(mat) {
  let m = mirrors.get(mat);
  if (!m) {
    if (mat.isPaint) {
      m = makePaint({ ...mat.paintOpts, mirror: true });
      for (const k in mat.uniforms) m.uniforms[k] = mat.uniforms[k];      // one set of numbers for the thing and its picture
    } else if (mat.mirrorVariant) m = mat.mirrorVariant();
    else m = mat;
    mirrors.set(mat, m);
  }
  return m;
}

/** Every geometry painted with vertexColors needs a colour at each corner: white where none was given. */
export function withColor(geo, hex) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3), c = C(hex ?? '#ffffff');
    for (let i = 0; i < n; i++) { a[i * 3] = Math.sqrt(c.r); a[i * 3 + 1] = Math.sqrt(c.g); a[i * 3 + 2] = Math.sqrt(c.b); }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return geo;
}

// ------------------------------------------------------------------------------------------------ lights
const _score = [];
/**
 * The fires and lamps of the river: [{ position: Vector3, color: Color, radius, intensity }]. Each frame the four
 * that matter most from where the rider is are given to the paint; one about to drop out fades first.
 */
export function applyLights(lights, eye) {
  _score.length = 0;
  for (const l of lights) {
    if (!(l.intensity > 0)) continue;
    l._score = l.intensity * l.radius / (1 + eye.distanceToSquared(l.position) / (l.radius * l.radius * 6));
    _score.push(l);
  }
  _score.sort((a, b) => b._score - a._score);
  const cut = _score.length > MAX_LIGHTS ? _score[MAX_LIGHTS]._score : 0;
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const l = _score[i], P = shared.uLights.value[i], Cc = shared.uLightColors.value[i];
    if (!l) { P.set(0, -1000, 0, 1); Cc.setRGB(0, 0, 0); continue; }
    const k = cut > 0 ? Math.min(1, Math.max(0, (l._score - cut) / (0.3 * l._score + 1e-6))) : 1;
    P.set(l.position.x, l.position.y, l.position.z, l.radius);
    Cc.copy(l.color).multiplyScalar(l.intensity * k);
  }
}
