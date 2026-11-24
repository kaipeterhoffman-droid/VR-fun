# VR-fun

WebXR toys for Quest 3, built on Meta's Immersive Web SDK.

**Play:** https://kaipeterhoffman-droid.github.io/VR-fun/ (open in the Quest browser, press Enter AR)

## Weird Physics gun (passthrough)

You stand in your real room holding a blaster that fires objects, each obeying a different broken law. Shots pass through each other but hit your real room. Every law bounces in its own way.

**Scan first.** The game maps the room itself from the Quest 3 depth sensor. Walk around and look at the walls, the ceiling and the furniture while voxels pile up, then press A (or left pinch) to bake:

- floor, ceiling and walls are fitted as planes from near points and far, coarse ones (out to ~8 m). Walls are treated as infinite, so a wall hidden behind a couch is still there, and they're only cut where the sensor has actually seen through them (doorways, open windows). Vertical faces with room behind them (couch backs, counters) stay finite
- furniture voxels become boxes via a 12 cm height map; things with a gap underneath (tables, shelves, lamps) float, so shots can roll under them
- flicker, flying pixels at silhouettes and samples taken during fast head turns are rejected; anything left over that the model doesn't explain still collides as raw voxels

Hold Y for a second to rescan. If depth sensing is unavailable it falls back to Quest's room scan.

Controls: trigger fires (hold for auto), A / X next law (A bakes the scan while scanning), B previous, Y clears (hold to rescan), thumbstick click shows the room model. Bare hands: right pinch fires, left pinch cycles. The card above the gun shows the loaded law and whether a room scan was found.

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
