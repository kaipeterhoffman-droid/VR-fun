# VR-fun

WebXR toys for Quest 3, built on Meta's Immersive Web SDK.

**Play:** https://kaipeterhoffman-droid.github.io/VR-fun/ (open in the Quest browser, press Enter AR)

## Weird Physics gun (passthrough)

You stand in your real room holding a blaster that fires objects, each obeying a different broken law. Shots pass through each other but hit your real room. The game builds its own live map from the Quest 3 depth sensor: a 6 cm voxel grid with surface normals, updated six times a second as you look around, with free space carved out so moved objects disappear. Irregular shapes work because anything the sensor has seen is solid. Quest's wall/floor/ceiling planes back it up for corners you haven't looked at; if depth sensing is unavailable it falls back to Quest's room scan. Every law bounces in its own way.

Controls: trigger fires (hold for auto), A / X next law, B previous, Y clears, thumbstick click shows the live room map. Bare hands: right pinch fires, left pinch cycles. The card above the gun shows the loaded law and whether a room scan was found.

| Law | In flight | On impact |
| --- | --- | --- |
| Newton | Normal gravity | Ordinary bounce |
| Rebel | Falls up | Super bouncy |
| Runaway | Accelerates away from you | Ricochets 22% faster every hit |
| Shy | Inverse-square repulsion from your hands, head, other shots | Flinches off at a random angle |
| Palindrome | Normal | Replays its whole flight backwards, then forwards, forever |
| Slowlight | Light speed is 2.2 m/s: relativistic mass, contraction, Doppler tint | Perfectly elastic, big flash |
| Tide | Wobbling gravity well that pulls and repels other shots | Sticks where it lands and keeps pulling |
| Bashful | Only moves when you are not looking | Slides along surfaces |
| Contrarian | Comes out of the gun backwards | Bounces straight back the way it came |
| Cyclotron | Curves in a magnetic field | Flips its curl every bounce |

All sounds are synthesized live (Web Audio, HRTF-spatialized). Gun model: Quaternius "Sci-Fi Modular Gun Pack" (quaternius.com), CC0.

Physics is a small custom integrator (`src/main.js`, laws in `src/laws.js`, room collision in `src/collide.js`) on top of IWSDK XR input and scene understanding.

## Dev

```
npm install
npm run dev    # https://localhost:8081 with Quest 3 + living-room passthrough emulation
npm run build
```
