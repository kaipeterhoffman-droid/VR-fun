# VR-fun

WebXR toys for Quest 3, built on Meta's Immersive Web SDK.

**Play:** https://kaipeterhoffman-droid.github.io/VR-fun/ (open in the Quest browser, press Enter AR)

## Weird Physics gun (passthrough)

You stand in your real room holding a gun that fires objects, each obeying a different broken law. Shots pass through each other but bounce off your real floor, walls, ceiling and furniture (from Quest room setup / scene understanding).

Controls: trigger fires (hold for auto), A / X next law, B previous, Y clears all shots. Bare hands: right pinch fires, left pinch cycles. Shots fade after 30 s or when they come to rest.

| Law | Misbehavior |
| --- | --- |
| Newton | Control group. Normal gravity. |
| Rebel | Falls up. |
| Runaway | Accelerates away from you, harder the farther it is. |
| Shy | Inverse-square repulsion from your hands, head, and other shots. |
| Palindrome | On first impact, replays its flight backwards, then forwards, forever. |
| Slowlight | Speed of light is 2.2 m/s: relativistic mass, length contraction, Doppler tint. |
| Tide | Wobbling gravity well that alternately pulls and repels other shots. |
| Bashful | Only moves when you are not looking at it. |
| Contrarian | Negative inertia: comes out of the gun backwards. |
| Cyclotron | Charged in a vertical magnetic field; curves around like a boomerang. |

Physics is a small custom integrator (`src/main.js`, laws in `src/laws.js`) on top of IWSDK XR input and scene understanding.

## Dev

```
npm install
npm run dev    # https://localhost:8081 with Quest 3 + living-room passthrough emulation
npm run build
```
