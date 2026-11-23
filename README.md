# VR-fun

WebXR toys for Quest 3, built on Meta's Immersive Web SDK.

**Play:** https://kaipeterhoffman-droid.github.io/VR-fun/ (open in the Quest browser, press Enter VR)

## Weird Physics sandbox

Ten grabbable objects on pedestals, each breaking a different law. Laws switch on after the first throw.

| Object | Misbehavior |
| --- | --- |
| Newton | Control group. Normal gravity. |
| Rebel | Falls up. |
| Runaway | Accelerates away from you, harder the farther it is. |
| Shy | Inverse-square repulsion from your hands, head, and other objects. |
| Palindrome | On first impact, replays its flight backwards, then forwards, forever. |
| Slowlight | Speed of light is 2.2 m/s: relativistic mass, length contraction, Doppler tint. |
| Tide | Wobbling gravity well that alternately pulls and repels everything nearby. |
| Bashful | Only moves when you are not looking at it. |
| Contrarian | Negative inertia: thrown velocity is reversed. |
| Cyclotron | Charged in a vertical magnetic field; flat throws curve back like a boomerang. |

Controls: grip (controllers) or pinch (hands) to grab. B / Y or the red button resets. Thumbstick to move.

Physics is a small custom integrator (`src/main.js`, laws in `src/laws.js`) on top of IWSDK grab, locomotion and XR input, since Havok politely declines to make mass depend on speed.

## Dev

```
npm install
npm run dev    # https://localhost:8081 with Quest 3 emulation
npm run build
```
