# Prince of the Lost Tower — 3D

A real 3D rendering of the same dungeon escape, built with [Three.js](https://threejs.org/)
(vendored locally in `vendor/`, no CDN dependency). The simulation — physics,
level layout, combat, hazards, checkpoints, the 60-minute clock — is the exact
same code as the [2D original](../prince-of-persia/), unchanged; only the
renderer is new. Simulation stays in the original "pixel" coordinate space
(1 tile = 32) so every tuned constant (jump arcs, run speed, fall damage
thresholds) carries over untouched — a single conversion maps pixel-space
into Three.js world units (1 tile = 1 unit) at the point objects are
positioned in the scene.

## Play

Open `index.html` in any modern browser — desktop or mobile. That's it; the
Three.js runtime is bundled in `vendor/three.min.js`, so nothing is fetched
over the network.

## Controls

Identical to the 2D game — arrow keys / WASD to run, Shift to walk safely
past spikes, Space/Up to jump and climb, X to attack, Z to parry, P/Esc to
pause. Touch devices get the same on-screen D-pad automatically, and a mute
button sits in the top-right corner of the tower.

## What's different from the 2D version

- **Real 3D scene**: the level is generated as merged box geometry from the
  same tile grid (contiguous runs of solid tiles collapse into single boxes,
  keeping the level to well under 150 meshes), with a baked brick-pattern
  canvas texture reused from the 2D game's visual language, moonlit window
  insets, and cone-shaped spikes that read far better in 3D than they ever
  could as flat triangles.
- **Blocky low-poly characters**: the prince and guard are procedurally
  animated humanoid rigs (box torso/head/limbs on rotating pivots), posed
  each frame from the same state machine that drove the 2D sprite picker —
  run cycle, jump/fall tuck, attack windup/thrust, block, ledge-hang, climb,
  and a death slump. The guard keeps his cape and helmet plume from the 2D
  upgrade, now as actual 3D geometry instead of a 2D overlay.
- **Real lighting**: torches are point lights with animated flicker (only
  the nearest few to the camera are active at once — see Performance below),
  a warm light follows the prince, and the guard's enrage phase gets a
  pulsing red light instead of a 2D canvas gradient.
- **HUD stays 2D**: hearts, timer, messages, the mute button, and all
  overlay screens (title, pause, death, win) are drawn on a transparent 2D
  canvas layered on top of the WebGL canvas, ported near-verbatim from the
  2D game. This is standard practice even in fully 3D games — text and UI
  chrome don't need to be 3D objects.

## Performance note

With ~20 torches in the level, lighting every pixel against all of them
simultaneously would tank framerate for no visible benefit (a torch three
rooms away is indistinguishable from unlit at that distance). Only the
torches nearest the camera are given non-zero light intensity each frame;
the rest sit dark until the player approaches. Window "moonlight" is a flat
emissive-looking material with no real light source at all, for the same
reason. On real GPU hardware this scene (a few dozen draw calls, well under
a thousand triangles) has enormous headroom — the constraint here is being
deliberate about how many real-time lights touch a shader at once, not raw
scene complexity.

## Tech

Three.js r160, vendored as the last release with a working global
(non-module) build — see `vendor/THREE-LICENSE` (MIT). No build step, no
bundler: `<script src="vendor/three.min.js">` then `<script src="game.js">`.
