# Prince of the Lost Tower

A Prince-of-Persia-style cinematic platformer that runs entirely in the browser —
one full dungeon level across three floors. No build step, no dependencies.

## Play

Open `index.html` in any modern browser — desktop or mobile. That's it.

## Controls

| Key | Action |
|---|---|
| ← / → (or A / D) | Run |
| Shift (hold) | Careful walk — the only safe way past **spikes** |
| ↑ / W / Space | Jump · climb up while hanging |
| ↓ / S | Drop from a ledge · pull the **lever** |
| X / J | Sword attack (once you have a sword) |
| Z / K (hold) | Parry the guard's strike |
| P / Esc | Pause |
| Enter | Start / respawn / restart |

On a touch device, an on-screen D-pad and action buttons appear automatically
(walk/attack/parry/jump), and tapping the tower advances the title, death, and
win screens in place of Enter. A speaker icon in the top-right corner of the
tower mutes all sound and remembers your preference between visits.

Jumps are forgiving: a short **coyote window** after running off a ledge, a
**buffered** jump if you press slightly before landing, and **variable height**
(release early for a hop). Your best escape time is remembered between visits.
Checkpoints are marked by a rune sigil that lights up gold once you reach it.

## The level

- **Top floor** — running-jump gap, cracked *loose tiles* (cross fast, or fall
  through as a painful shortcut), a chomper gate, and a pressure-plate gate.
- **Middle floor** — backtrack left to find **the sword**. A spike bed, a
  checkpoint, a sword **guard** to duel (attack with X, parry with Z — he
  blocks and fights back, and **enrages** into a faster, more aggressive phase
  once he's down to his last hit), and a second plate-gate. A running jump
  over the descent gap hides a **great potion** (+1 max health).
- **Bottom floor** — travel *left* through twin chompers and a spike gauntlet,
  pull the lever to raise the exit door, and escape.

You have **60 minutes**, like the original. Long falls hurt; very long falls
kill. Deaths return you to the last checkpoint — the clock keeps running.

## Tech

Single `game.js` (vanilla JavaScript, Canvas 2D, WebAudio synth sound effects).
Tile-based physics with ledge-grab & climb, timed gates, pressure plates,
loose-tile debris, a patrol/duel guard AI, camera with screen-shake, and
torch-lit dungeon rendering with a real-time lighting pass (flickering torch
pools punched out of a darkness layer), a level pre-baked to an offscreen
canvas with edge-aware brickwork, moonlit barred windows with light shafts,
drifting dust motes, contact shadows, sword-swing arcs, and a vignette.
Characters are hand-authored 16×24 pixel-art sprite sheets (idle, 4-frame run
cycle, jump, fall, hang, climb, sword poses) baked to offscreen canvases with
palette swaps for the prince and the guard — no external assets, everything
is drawn in code. Open `index.html#sprites` to view the sprite sheet.

A procedural WebAudio ambience (a low drone plus filtered wind noise) plays
underneath the synth sound effects, all routed through a single mutable
master gain. Touch input reuses the same key-state machine as the keyboard,
so on-screen buttons and physical keys are interchangeable. Movement kicks up
dust particles on running and landing, and every sword swing — prince or
guard — leaves a brief motion-arc trail.
