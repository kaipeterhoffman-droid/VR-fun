// Engine: the renderer, the headset session and the frame loop.
//
// The picture is drawn once, straight into the headset's own frame (both eyes in one pass where the browser can),
// with the headset's multisampling and its foveation left on. Nothing is drawn afterwards: see src/ifing/paint.js.
import * as THREE from 'three';

export class Engine {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, multiviewStereo: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
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
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get presenting() { return this.renderer.xr.isPresenting; }

  async vrSupported() {
    try { return !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { return false; }
  }

  /** Go into the headset. `sharp` is the size of the eye pictures against the headset's default (1 = default). */
  async enterVR(sharp = 1.0, foveation = 0.7) {
    const xr = this.renderer.xr;
    xr.setFramebufferScaleFactor(sharp); xr.setFoveation(foveation);
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    this.session = session;
    session.addEventListener('end', () => { this.session = null; if (this.onExit) this.onExit(); });
    await xr.setSession(session);
    // ask for the headset's higher refresh rate where it has a choice, but never above 90: the picture comes first
    try { const rates = session.supportedFrameRates; if (rates && session.updateTargetFrameRate) { const want = [...rates].filter((r) => r <= 90).sort((a, b) => b - a)[0]; if (want) await session.updateTargetFrameRate(want); } } catch { /* the default is fine */ }
    if (this.onEnter) this.onEnter(session);
    return session;
  }

  start(loop) {
    let last = 0;
    this.renderer.setAnimationLoop((time, frame) => {
      const t = time / 1000, dt = Math.min(0.05, last ? t - last : 1 / 72); last = t;
      const t0 = performance.now();
      loop(dt, t, frame);
      this.renderer.render(this.scene, this.camera);
      this.frameMs += (performance.now() - t0 - this.frameMs) * 0.05; this.frames++;
    });
  }
}
