# VR-fun

WebXR toys for Quest 3, built on Meta's Immersive Web SDK.

| Game | Play (open in the Quest browser) |
| --- | --- |
| **Trick Shot**: two players, one headset, your real room | https://kaipeterhoffman-droid.github.io/VR-fun/ |
| **Ífing**: a Norse forest river by canoe | https://kaipeterhoffman-droid.github.io/VR-fun/ifing/ |

## Ífing (a river by canoe)

A kilometre of river through a forest out of the old North, at night, in a small boat with a pair of oars. No score and nothing to win: the boathouse at blue hour, the Ironwood and the giant asleep in its hillside, a gatehouse and a ship of standing stones, a golden grove. Everything in it is made in code; there are no model, image or sound files.

**Play:** https://kaipeterhoffman-droid.github.io/VR-fun/ifing/ then press **Enter the river**. Sit down first.

The river carries you by itself: do nothing and you float the whole way in a little under half an hour. To row, reach forward and take an oar in each hand with the grip or the trigger, dip the blades and push them away from you (you face the way she goes, so a push drives her on and a pull backs her). Row one side to turn. Let go and the oars trail beside her.

On a desktop, drag to look and use the arrow keys to row. Add `?from=370` to the address to set off just above the gatehouse, or `?from=640` at the head of the golden grove.

## Trick Shot (two players, one headset)

An obstacle-course game in your real room, in passthrough. Scan the room (walk around, press A), then from the menu start a match:

1. **Tee and target.** Stand where shots will be taken and pull the trigger. Then aim where the target should float (right stick pushes it out or pulls it in) and pull again.
2. **Opening build.** Each player starts with $100 and gets one build turn before anyone shoots.
3. **Turns.** Take up to five shots at the target from the tee, then spend money on gadgets and leave them on the course. Hand the headset over. Four rounds. Each turn pays another $60.
4. **Nothing is cleared.** Gadgets stay for the whole match, so the course gets worse every turn. You shoot through your own handiwork too.

Scoring: a hit on shot 1 pays 500, then 400, 300, 200, 100. Every gadget the scoring shot touched on the way adds 50, every bonus hoop adds 100, and a bank off the real room adds 50. Points win; unspent cash only breaks ties.

Controls (controllers required):

| | Build | Shoot |
| --- | --- | --- |
| Right trigger | place the gadget | fire (only from the tee) |
| A / B, or left stick | browse the shop | change the ball |
| Right stick | push / pull, turn the gadget | steer a Guided shot |
| Y | undo your last placement, full refund | call off a shot in flight |
| Left trigger | menu | menu |

The shop is a tablet on your left controller. A gadget is held on the end of the gun's ray and takes its orientation from your wrist, so hold it close for fine control or push it out to place across the room.

| Gadget | $ | What it does |
| --- | --- | --- |
| Glass | 10 | Stops one shot, then shatters |
| Wall | 15 | 80 x 60 cm slab, opaque |
| Fog | 15 | A cloud you cannot see through |
| Mine | 15 | Blasts nearby shots away, re-arms in 3 s |
| Spring | 20 | Launches whatever lands on it along the pad |
| Fan | 20 | A 2 m jet that bends arcs |
| Bonus hoop | 20 | +100 for a scoring shot that went through it |
| Booster | 25 | Ring that fires shots straight down its axis |
| Gravity orb / Antigravity | 25 | Pulls / pushes |
| Demolition | 25 | Deletes any one gadget, yours or theirs |
| Piston | 30 | Block slamming back and forth |
| Spin plank | 30 | 1.1 m propeller |
| Pendulum | 30 | Heavy bob on an 80 cm arm |
| Orbiter | 30 | Ball circling a 40 cm ring |
| Time bubble | 30 | Quarter-speed time inside |
| Laser | 35 | Vaporises shots; blinks 1.6 s on, 1 s off |
| Black hole | 45 | Strong pull, and the horizon eats shots |
| Antimatter gun | 50 | Turret that tracks shots and annihilates them |
| Portal pair | 90 | In the orange end, out the blue |

Balls. At the tee the gun loads match balls instead of the sandbox's ten laws. The clever ones cost money, out of the same wallet you build with.

| Ball | $ | Good for | Bad at |
| --- | --- | --- | --- |
| Standard | 0 | Baseline | Everything on the course works on it |
| Superball | 5 | Banks: keeps its speed, bank bonus 150 instead of 50 | Hard to stop |
| Cannonball | 10 | Ignores most of orbs, fans, mines, black holes; smashes glass | Slow, drops, dead on a bounce |
| Floater | 10 | Quarter gravity, nearly straight flight | Fields throw it twice as hard |
| Curveball | 10 | Bends toward the top of the gun: level = flat, rolled = round a wall | Spin dies on the first bounce |
| Shielded | 15 | Survives one laser or antimatter round | Only one |
| Scatter | 20 | Splits into three; any one scoring counts | Spread you do not control |
| Phase | 25 | Passes through the first solid gadget it reaches | Solid after that; hazards still work |
| Guided | 30 | Steer it for three seconds | Slow, so turrets and pendulums get a long look |

A new ball is one entry in `src/game/balls.js`. A new gadget is one entry in `src/game/items.js` (look, plus any of `collide`, `field`, `timeScale`, `post`, `update`). The match flow is `src/game/game.js`, the panels `src/game/ui.js`.

Smoothness notes: depth sampling (a GPU readback plus a few ms of CPU) runs at full rate only while scanning, and stops during a match or while anything is in flight; every material is drawn once at session start so shaders don't compile mid-game; additive glows leave framebuffer alpha alone so they don't punch dark holes in passthrough (`src/blend.js`).

## Weird Physics gun (the sandbox)

Menu > B. The same gun, no rules.

You stand in your real room holding a blaster that fires objects, each obeying a different broken law. Shots pass through each other but hit your real room. Every law bounces in its own way.

**Scan first.** The game maps the room itself from the Quest 3 depth sensor. Walk around and look at the walls, the ceiling and the furniture while voxels pile up, then press A (or left pinch) to bake:

- floor, ceiling and walls are fitted as planes from near points and far, coarse ones (out to ~8 m). Walls are treated as infinite, so a wall hidden behind a couch is still there, and they're only cut where the sensor has actually seen through them (doorways, open windows). Vertical faces with room behind them (couch backs, counters) stay finite
- furniture voxels become boxes via a 12 cm height map; things with a gap underneath (tables, shelves, lamps) float, so shots can roll under them
- flicker, flying pixels at silhouettes and samples taken during fast head turns are rejected; anything left over that the model doesn't explain still collides as raw voxels

The baked room is saved, pinned to a persistent anchor, so next time it snaps back into place on its own (press A while it's looking to scan fresh). Hold Y for a second to throw it away and rescan. Outside AR, a **Download room scan** button saves the stored scan as a JSON file (voxels, planes, boxes) for inspection. If depth sensing is unavailable it falls back to Quest's room scan.

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
