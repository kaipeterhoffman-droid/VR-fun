// Additive glow that is honest about passthrough.
// three's AdditiveBlending also adds to the framebuffer's alpha, and in AR the compositor reads alpha
// as "how much of the real room to hide". So every soft glow dragged a dark smudge of blocked-out
// room along with it, and dead (black) particles showed up as dark dots. Light should only add:
// leave alpha alone and the glow lands on top of the room like actual light.
import * as THREE from 'three';

export function trueAdditive(m) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

export function fixAdditive(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) if (x.blending === THREE.AdditiveBlending) trueAdditive(x);
  });
  return root;
}
