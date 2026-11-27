// Engine: the renderer, the headset session and the frame loop.
//
// The picture is drawn once, straight into the headset's own frame (both eyes in one pass where the browser can),
// with the headset's multisampling and its foveation left on. Nothing is drawn afterwards: see src/ifing/paint.js.
import * as THREE from 'three';

export class Engine {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, multiviewStereo: true, alpha: false, powerPreference: 'high-performance' });
    this.pixelRatioAsked = parseFloat(new URLSearchParams(location.search).get('pr')) || 0;
    renderer.setPixelRatio(this.pixelRatio()); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 1);
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene(); this.scene.matrixWorldAutoUpdate = true;
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.07, 3200);
    this.rig = new THREE.Group(); this.rig.name = 'rig';            // the rider's place: the headset's floor is this group's floor
    this.rig.add(this.camera); this.scene.add(this.rig);
    this.session = null; this.clock = new THREE.Clock();
    this.frameMs = 0; this.frames = 0;
    window.addEventListener('resize', () => {
      if (renderer.xr.isPresenting) return;
      this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
      renderer.setPixelRatio(this.pixelRatio()); renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get presenting() { return this.renderer.xr.isPresenting; }

  /**
   * In a window: never fewer than one and a half dots of picture to a dot of screen, so that an ordinary monitor is
   * supersampled on top of its multisampling, and never more than about four and a half million of them. ?pr= sets it.
   */
  pixelRatio() {
    if (this.pixelRatioAsked > 0) return this.pixelRatioAsked;
    const dpr = window.devicePixelRatio || 1, area = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.max(1, Math.min(2, Math.max(dpr, 1.5), Math.sqrt(4.5e6 / area)));
  }

  /**
   * How large to draw the eye pictures against the headset's default. It cannot be changed inside a ride, so it is
   * learned between rides: a ride that kept its pace asks for a little more next time, one that dropped frames for less.
   */
  static sharpness() {
    let s = 1.35;
    try { const v = parseFloat(localStorage.getItem('ifing.sharp')); if (v >= 1 && v <= 1.6) s = v; } catch { /* no memory: the default */ }
    return s;
  }
  _judge(dt) {
    const pace = this._pace; if (!pace) return;
    pace.t += dt; if (pace.t < 6) return;                           // the first seconds are compiling, not drawing
    pace.n++; if (dt > pace.frame * 1.35) pace.slow++;
    if (pace.n % 900 === 0) this._learn();
  }
  _learn() {
    const pace = this._pace; if (!pace || pace.n < 600 || pace.fixed) return;
    const slow = pace.slow / pace.n, next = slow > 0.1 ? pace.sharp - 0.15 : slow < 0.015 ? pace.sharp + 0.05 : pace.sharp;
    try { localStorage.setItem('ifing.sharp', String(Math.max(1, Math.min(1.5, next)).toFixed(2))); } catch { /* nothing to remember it in */ }
  }

  async vrSupported() {
    try { return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { return false; }
  }

  /** Go into the headset. `sharp` is the size of the eye pictures against the headset's default (1 = default); null: what the last rides taught. */
  async enterVR(sharp = null, foveation = 0.5) {
    const xr = this.renderer.xr, fixed = sharp != null; if (!fixed) sharp = Engine.sharpness();
    xr.setFramebufferScaleFactor(sharp); xr.setFoveation(foveation);
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    this.session = session;
    session.addEventListener('end', () => { this._learn(); this._pace = null; this.session = null; if (this.onExit) this.onExit(); });
    await xr.setSession(session);
    // A slow river wants dots more than it wants frames: 72 a second where the headset offers it, and the rest of the
    // budget spent on the size of the picture.
    let rate = 72;
    try { const rates = session.supportedFrameRates; if (rates && session.updateTargetFrameRate) { const want = [...rates].filter((r) => r >= 72).sort((a, b) => a - b)[0]; if (want) { await session.updateTargetFrameRate(want); rate = want; } } else if (session.frameRate) rate = session.frameRate; } catch { /* the default is fine */ }
    this._pace = { t: 0, n: 0, slow: 0, frame: 1 / rate, sharp, fixed };
    if (this.onEnter) this.onEnter(session);
    return session;
  }

  start(loop) {
    let last = 0;
    this.renderer.setAnimationLoop((time, frame) => {
      const t = time / 1000, raw = last ? t - last : 1 / 72, dt = Math.min(0.05, raw); last = t;
      this._judge(raw);
      const t0 = performance.now();
      loop(dt, t, frame);
      this.renderer.render(this.scene, this.camera);
      this.frameMs += (performance.now() - t0 - this.frameMs) * 0.05; this.frames++;
    });
  }
}
