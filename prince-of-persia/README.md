# Prince of the Lost Tower

A Prince-of-Persia-style cinematic platformer that runs entirely in the browser —
one full dungeon level across three floors. No build step, no dependencies.

## Play

Open `index.html` in any modern browser. That's it.

## Controls

| Key | Action |
|---|---|
| ← / → (or A / D) | Run |
| Shift (hold) | Careful walk — the only safe way past **spikes** |
| ↑ / W / Space | Jump · climb up while hanging |
| ↓ / S | Drop from a ledge · pull the **lever** |
| X / J | Sword attack (once you have a sword) |
| Z / K (hold) | Parry the guard's strike |
| Enter | Start / respawn / restart |

## The level

- **Top floor** — running-jump gap, cracked *loose tiles* (cross fast, or fall
  through as a painful shortcut), a chomper gate, and a pressure-plate gate.
- **Middle floor** — backtrack left to find **the sword**. A spike bed, a
  checkpoint, a sword **guard** to duel (attack with X, parry with Z), and a
  second plate-gate. A running jump over the descent gap hides a **great potion**
  (+1 max health).
- **Bottom floor** — travel *left* through twin chompers and a spike gauntlet,
  pull the lever to raise the exit door, and escape.

You have **60 minutes**, like the original. Long falls hurt; very long falls
kill. Deaths return you to the last checkpoint — the clock keeps running.

## Tech

Single `game.js` (~900 lines of vanilla JavaScript, Canvas 2D, WebAudio synth
sound effects). Tile-based physics with ledge-grab & climb, timed gates,
pressure plates, loose-tile debris, a patrol/duel guard AI, camera with
screen-shake, and torch-lit dungeon rendering — no assets, everything drawn in code.
