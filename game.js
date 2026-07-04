'use strict';
/* ============================================================
   PRINCE OF THE LOST TOWER
   A Prince-of-Persia-style cinematic platformer. One full level:
   three floors of a dungeon tower — loose tiles, spike pits,
   chomper gates, pressure plates, a sword to find, a guard to
   duel, a lever, and the exit door. 60 minutes on the clock.
   ============================================================ */

// ---------- constants ----------
const TILE = 32;
const VIEW_W = 960, VIEW_H = 540;
const GRAV = 2300;
const RUN_SPD = 235, WALK_SPD = 80;
const JUMP_V = -690;
const TIME_LIMIT = 60 * 60; // seconds, like the original

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- input ----------
const keys = {};
let anyKeyPressed = false;
addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) keyEdge[e.code] = true;
  keys[e.code] = true;
  anyKeyPressed = true;
  initAudio();
});
addEventListener('keyup', e => { keys[e.code] = false; });
let keyEdge = {}; // pressed-this-frame, cleared each update

const held = {
  left:  () => keys['ArrowLeft']  || keys['KeyA'],
  right: () => keys['ArrowRight'] || keys['KeyD'],
  up:    () => keys['ArrowUp']    || keys['KeyW'] || keys['Space'],
  down:  () => keys['ArrowDown']  || keys['KeyS'],
  walk:  () => keys['ShiftLeft']  || keys['ShiftRight'],
  block: () => keys['KeyZ']       || keys['KeyK'],
};
const edge = {
  up:     () => keyEdge['ArrowUp'] || keyEdge['KeyW'] || keyEdge['Space'],
  down:   () => keyEdge['ArrowDown'] || keyEdge['KeyS'],
  attack: () => keyEdge['KeyX'] || keyEdge['KeyJ'],
  enter:  () => keyEdge['Enter'],
};

// ---------- tiny synth sfx ----------
let AC = null;
function initAudio(){ if (!AC) { try { AC = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} } }
function sfx(kind){
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.connect(g); g.connect(AC.destination);
  const P = {
    jump:   [ 'square', 300, 520, 0.08, 0.05 ],
    land:   [ 'triangle', 120, 60, 0.1, 0.08 ],
    potion: [ 'sine', 500, 980, 0.25, 0.08 ],
    sword:  [ 'sawtooth', 800, 200, 0.12, 0.06 ],
    clang:  [ 'square', 1200, 900, 0.06, 0.05 ],
    hurt:   [ 'sawtooth', 220, 90, 0.2, 0.1 ],
    gate:   [ 'triangle', 90, 140, 0.5, 0.06 ],
    crumble:[ 'sawtooth', 150, 40, 0.3, 0.08 ],
    chomp:  [ 'square', 100, 50, 0.12, 0.09 ],
    lever:  [ 'square', 200, 350, 0.15, 0.06 ],
    win:    [ 'sine', 440, 880, 0.9, 0.08 ],
    die:    [ 'sawtooth', 300, 40, 0.7, 0.1 ],
  }[kind];
  if (!P) return;
  o.type = P[0];
  o.frequency.setValueAtTime(P[1], t);
  o.frequency.exponentialRampToValueAtTime(Math.max(P[2],1), t + P[3]);
  g.gain.setValueAtTime(P[4], t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
  o.start(t); o.stop(t + P[3] + 0.02);
}

// ---------- level ----------
const W = 96, H = 24;
let grid, gates, plates, chompers, looseTiles, potions, lever, door, sword,
    checkpoints, guard, player, particles, fallingTiles, torches;
let camX = 0, camY = 0, shake = 0;
let timeLeft, message, messageT, state, winT, deathT = 0, hitstop = 0;
let bestTime = null;
try { bestTime = +localStorage.getItem('pop_best_time') || null; } catch (e) {}

function makeGrid(){
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(' '));
  const set = (x,y,c) => { if (x>=0&&x<W&&y>=0&&y<H) g[y][x] = c; };
  const rect = (x,y,w,h,c='#') => { for (let j=y;j<y+h;j++) for (let i=x;i<x+w;i++) set(i,j,c); };

  // shell
  rect(0,0,W,1); rect(0,H-1,W,1); rect(0,0,1,H); rect(W-1,0,1,H);

  // ===== TOP FLOOR (surface y=7) — the escape begins =====
  rect(1,7,13,1);            // ledge 1..13
  // gap 14..16 (running jump)
  rect(17,7,7,1);            // ledge 17..23
  set(24,7,'L'); set(25,7,'L'); set(26,7,'L');  // loose tiles (shortcut down, at a price)
  rect(27,7,19,1);           // corridor 27..45
  set(2,6,'S');              // start
  set(30,6,'c');             // chomper gate
  set(34,6,'p');             // small potion
  set(36,6,'1');             // pressure plate -> gate A
  set(40,5,'A'); set(40,6,'A'); // gate A
  rect(44,11,7,1);           // descent platform 44..50

  // ===== MIDDLE FLOOR (surface y=15) — the sword and the guard =====
  rect(1,15,79,1);           // 1..79
  // gap 80..82 (descent; long-jump it for the secret)
  rect(83,15,12,1);          // secret ledge 83..94
  set(90,14,'P');            //   big potion (max HP up)
  set(4,14,'w');             // THE SWORD — backtrack left to claim it
  set(58,14,'^'); set(59,14,'^'); set(60,14,'^'); // spike bed
  set(64,14,'M');            // checkpoint
  set(68,14,'g');            // the guard
  set(72,14,'2');            // pressure plate -> gate B
  set(76,13,'B'); set(76,14,'B'); // gate B
  rect(77,19,9,1);           // descent platform 77..85

  // ===== BOTTOM FLOOR (surface y=23) — the gauntlet, travel LEFT =====
  set(70,22,'c'); set(66,22,'c');                 // twin chompers
  set(60,22,'^'); set(58,22,'^'); set(56,22,'^'); set(54,22,'^'); // spike gauntlet
  set(48,22,'M');            // checkpoint
  set(44,22,'p');            // small potion
  set(36,22,'V');            // the lever
  set(28,21,'E'); set(28,22,'E'); // the exit door
  return g;
}

function resetLevel(){
  grid = makeGrid();
  gates = {}; plates = []; chompers = []; looseTiles = {}; potions = [];
  lever = null; door = { cells: [], open: false, anim: 0 };
  sword = null; checkpoints = []; particles = []; fallingTiles = []; torches = [];
  let start = { x: 2, y: 6 };
  let guardPos = null;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c === 'S') { start = { x, y }; grid[y][x] = ' '; }
    else if (c === 'M') { checkpoints.push({ x, y }); grid[y][x] = ' '; }
    else if (c === 'g') { guardPos = { x, y }; grid[y][x] = ' '; }
    else if (c === 'c') { chompers.push({ x, y, offset: (x * 0.37) % 1 }); grid[y][x] = ' '; }
    else if (c === 'p') { potions.push({ x, y, big: false, taken: false }); grid[y][x] = ' '; }
    else if (c === 'P') { potions.push({ x, y, big: true, taken: false }); grid[y][x] = ' '; }
    else if (c === 'w') { sword = { x, y, taken: false }; grid[y][x] = ' '; }
    else if (c === 'V') { lever = { x, y, pulled: false, anim: 0 }; grid[y][x] = ' '; }
    else if (c === '1' || c === '2') { plates.push({ x, y, gateId: c === '1' ? 'A' : 'B', pressed: 0 }); grid[y][x] = ' '; }
    else if (c === 'A' || c === 'B') {
      if (!gates[c]) gates[c] = { cells: [], open: 0, holdT: 0 };
      gates[c].cells.push({ x, y });
    }
    else if (c === 'E') door.cells.push({ x, y });
    else if (c === 'L') looseTiles[x + ',' + y] = { x, y, state: 'idle', t: 0 };
  }

  // decorative torches on back walls above each floor
  for (const fy of [7, 15, 23]) {
    for (let x = 4; x < W - 2; x += 9) {
      if (grid[fy][x] === '#' && grid[fy-1][x] === ' ' && grid[fy-2][x] === ' ')
        torches.push({ x, y: fy - 2 });
    }
  }

  player = {
    x: start.x * TILE + 6, y: (start.y + 1) * TILE - 46,
    w: 20, h: 45, vx: 0, vy: 0, dir: 1,
    onGround: false, hp: 3, maxHp: 3,
    hasSword: false, attackT: 0, hurtT: 0, dead: false, deathMsg: '',
    hang: null, climbT: 0, climbFrom: null, climbTo: null,
    peakY: 0, runPhase: 0, coyote: 0, jumpBuf: 0, look: 0,
    checkpoint: { x: start.x, y: start.y },
  };
  player.peakY = player.y;

  guard = guardPos ? {
    x: guardPos.x * TILE + 4, y: (guardPos.y + 1) * TILE - 46,
    w: 22, h: 45, vx: 0, vy: 0, dir: -1,
    onGround: false, hp: 3, dead: false, blockT: 0,
    homeX: guardPos.x * TILE, thinkT: 1.2, telegraphT: 0, strikeT: 0, hurtT: 0,
  } : null;

  timeLeft = TIME_LIMIT;
  message = ''; messageT = 0;
  camX = Math.max(0, player.x - VIEW_W / 2); camY = Math.max(0, player.y - VIEW_H / 2);
  levelBake = bakeLevel();
}

function showMessage(txt, secs = 3.5){ message = txt; messageT = secs; }

// ---------- collision ----------
function charAt(tx, ty){
  if (tx < 0 || tx >= W || ty < 0 || ty >= H) return '#';
  return grid[ty][tx];
}
function solid(tx, ty){
  const c = charAt(tx, ty);
  if (c === '#') return true;
  if (c === 'L') { const lt = looseTiles[tx + ',' + ty]; return lt && lt.state !== 'gone'; }
  if (c === 'A' || c === 'B') return gates[c].open < 0.7;
  if (c === 'E') return door.anim < 0.7;
  return false;
}
function rectHitsSolid(x, y, w, h){
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (solid(tx, ty)) return { tx, ty };
  return null;
}
function moveEnt(e, dt){
  e.vy = Math.min(e.vy + GRAV * dt, 950);
  e.x += e.vx * dt;
  let hit, guardCount = 0;
  while ((hit = rectHitsSolid(e.x, e.y, e.w, e.h)) && guardCount++ < 8) {
    if (e.vx > 0) e.x = hit.tx * TILE - e.w - 0.01;
    else if (e.vx < 0) e.x = (hit.tx + 1) * TILE + 0.01;
    else break;
  }
  const wasGround = e.onGround;
  e.y += e.vy * dt; e.onGround = false;
  guardCount = 0;
  while ((hit = rectHitsSolid(e.x, e.y, e.w, e.h)) && guardCount++ < 8) {
    if (e.vy >= 0) { e.y = hit.ty * TILE - e.h - 0.01; e.onGround = true; e.vy = 0; }
    else { e.y = (hit.ty + 1) * TILE + 0.01; e.vy = 20; }
  }
  return wasGround;
}
function feetTiles(e){
  const y = Math.floor((e.y + e.h + 2) / TILE);
  const x0 = Math.floor((e.x + 2) / TILE), x1 = Math.floor((e.x + e.w - 2) / TILE);
  const out = [];
  for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

// ---------- player ----------
function hurtPlayer(n, deathMsg){
  if (player.hurtT > 0 || player.dead) return;
  player.hp -= n;
  player.hurtT = 1.1;
  shake = Math.max(shake, 6);
  sfx('hurt');
  if (player.hp <= 0) killPlayer(deathMsg || 'The prince has fallen.');
}
function killPlayer(msg){
  if (player.dead) return;
  player.dead = true; player.deathMsg = msg;
  player.hp = 0;
  sfx('die');
  shake = 10;
  deathT = 0.8;
  state = 'dying';
}
function respawn(){
  const cp = player.checkpoint;
  player.x = cp.x * TILE + 6; player.y = (cp.y + 1) * TILE - player.h - 1;
  player.vx = 0; player.vy = 0; player.hp = player.maxHp;
  player.dead = false; player.hurtT = 1.5; player.hang = null; player.climbT = 0;
  player.peakY = player.y;
  // close gates again so puzzles re-arm
  for (const id in gates) { gates[id].holdT = 0; }
  state = 'play';
}

function updatePlayer(dt){
  const p = player;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.attackT > 0) p.attackT -= dt;

  // --- climbing animation (locked) ---
  if (p.climbT > 0) {
    p.climbT -= dt;
    const t = 1 - Math.max(p.climbT, 0) / 0.45;
    p.x = p.climbFrom.x + (p.climbTo.x - p.climbFrom.x) * t;
    p.y = p.climbFrom.y + (p.climbTo.y - p.climbFrom.y) * t * t; // ease
    if (p.climbT <= 0) { p.vx = 0; p.vy = 0; p.onGround = true; p.peakY = p.y; }
    return;
  }

  // --- hanging from a ledge ---
  if (p.hang) {
    p.vx = 0; p.vy = 0;
    if (edge.up()) {
      const { tx, ty } = p.hang;
      const standX = tx * TILE + (TILE - p.w) / 2;
      const standY = ty * TILE - p.h - 0.5;
      if (!rectHitsSolid(standX, standY, p.w, p.h)) {
        p.climbFrom = { x: p.x, y: p.y };
        p.climbTo = { x: standX, y: standY };
        p.climbT = 0.45;
        p.hang = null;
        p.peakY = standY;
      }
    } else if (edge.down()) {
      p.hang = null; p.vy = 60; p.peakY = p.y;
    }
    return;
  }

  // --- horizontal intent ---
  let dx = 0;
  if (held.left()) dx -= 1;
  if (held.right()) dx += 1;
  const speed = held.walk() ? WALK_SPD : RUN_SPD;
  const target = dx * speed;
  const accel = p.onGround ? 2600 : 1400;
  if (p.vx < target) p.vx = Math.min(p.vx + accel * dt, target);
  else if (p.vx > target) p.vx = Math.max(p.vx - accel * dt, target);
  if (dx !== 0) p.dir = dx;

  // --- jump: coyote time + input buffer + variable height ---
  if (p.onGround) p.coyote = 0.1; else p.coyote -= dt;
  if (edge.up()) p.jumpBuf = 0.13; else p.jumpBuf -= dt;
  if (p.jumpBuf > 0 && p.coyote > 0 && p.attackT <= 0) {
    p.vy = JUMP_V;
    p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
    sfx('jump');
  }
  if (!held.up() && p.vy < -280) p.vy = -280; // release early for a shorter hop

  // --- attack ---
  if (edge.attack() && p.hasSword && p.onGround && p.attackT <= 0) {
    p.attackT = 0.38;
    sfx('sword');
    if (guard && !guard.dead) {
      const gx = guard.x + guard.w / 2, px = p.x + p.w / 2;
      const sameFloor = Math.abs((guard.y + guard.h) - (p.y + p.h)) < 20;
      if (sameFloor && Math.abs(gx - px) < TILE * 1.5 && Math.sign(gx - px) === p.dir) {
        // the guard can block when he isn't mid-attack
        const guardBlocks = guard.telegraphT <= 0 && guard.strikeT <= 0 &&
                            Math.sin(tNow * 9.7 + guard.homeX) > 0.25;
        if (guardBlocks) {
          guard.blockT = 0.3;
          hitstop = Math.max(hitstop, 0.06);
          sfx('clang');
          p.x -= p.dir * 6; // bounced off
        } else {
          guard.hp -= 1; guard.hurtT = 0.4; guard.telegraphT = 0; guard.strikeT = 0;
          guard.x += p.dir * 10;
          hitstop = Math.max(hitstop, 0.09);
          sfx('clang'); shake = Math.max(shake, 3);
          if (guard.hp <= 0) {
            guard.dead = true;
            showMessage('The guard is defeated.');
          }
        }
      }
    }
  }

  // --- track fall apex ---
  if (!p.onGround) p.peakY = Math.min(p.peakY, p.y);

  const wasAirborne = !p.onGround;
  moveEnt(p, dt);

  // --- landing: fall damage + loose tile trigger + plates ---
  if (p.onGround) {
    if (wasAirborne) {
      const fallTiles = (p.y - p.peakY) / TILE;
      if (fallTiles >= 13) killPlayer('A fall from that height is certain death.');
      else if (fallTiles >= 5.5) { hurtPlayer(1, 'The fall broke the prince.'); sfx('land'); }
      else if (fallTiles > 1.5) sfx('land');
    }
    p.peakY = p.y;
    for (const ft of feetTiles(p)) {
      const key = ft.x + ',' + ft.y;
      const lt = looseTiles[key];
      if (lt && lt.state === 'idle') { lt.state = 'shaking'; lt.t = 0.38; sfx('crumble'); }
      const c = charAt(ft.x, ft.y);
    }
    // pressure plates: pressed if feet on the plate cell (plates sit at floor-1)
    const footY = Math.floor((p.y + p.h - 4) / TILE);
    const footX = Math.floor((p.x + p.w / 2) / TILE);
    for (const pl of plates) {
      if (pl.x === footX && pl.y === footY) {
        if (pl.pressed <= 0) { sfx('gate'); showMessage('A gate rumbles open...', 2.5); }
        pl.pressed = 0.2;
        gates[pl.gateId].holdT = 6.0;
      }
    }
  }

  // --- ledge grab while falling ---
  if (!p.onGround && p.vy > 40 && dx !== 0 && p.climbT <= 0) {
    const fx = dx > 0 ? p.x + p.w + 3 : p.x - 3;
    const tx = Math.floor(fx / TILE);
    const handY = p.y + 6;
    const ty = Math.floor(handY / TILE);
    if (solid(tx, ty) && !solid(tx, ty - 1) && (handY - ty * TILE) < 16) {
      p.hang = { tx, ty, dir: dx };
      p.x = dx > 0 ? tx * TILE - p.w - 0.5 : (tx + 1) * TILE + 0.5;
      p.y = ty * TILE - 6;
      p.vx = 0; p.vy = 0;
    }
  }

  // --- run animation phase ---
  if (p.onGround && Math.abs(p.vx) > 20) p.runPhase += dt * Math.abs(p.vx) / 26;

  // --- pickups & interactions ---
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const ptx = Math.floor(pcx / TILE), pty = Math.floor(pcy / TILE);

  for (const pot of potions) {
    if (!pot.taken && Math.abs(pot.x * TILE + 16 - pcx) < 22 && Math.abs(pot.y * TILE + 20 - (p.y + p.h - 10)) < 26) {
      pot.taken = true; sfx('potion');
      if (pot.big) { p.maxHp += 1; p.hp = p.maxHp; showMessage('A great potion! Your vitality grows.'); }
      else { p.hp = Math.min(p.hp + 1, p.maxHp); showMessage('A healing draught.'); }
    }
  }
  if (sword && !sword.taken && Math.abs(sword.x * TILE + 16 - pcx) < 24 && Math.abs(sword.y - pty) < 2) {
    sword.taken = true; p.hasSword = true; sfx('sword');
    showMessage('You found a sword! X to attack, Z to parry.', 5);
  }
  if (lever && !lever.pulled && ptx === lever.x && Math.abs(pty - lever.y) <= 1 && edge.down()) {
    lever.pulled = true; lever.anim = 1; sfx('lever');
    door.open = true;
    showMessage('Far away, the exit door grinds open.', 4);
  }
  // checkpoints
  for (const cp of checkpoints) {
    if (Math.abs(cp.x - ptx) <= 0 && Math.abs(cp.y - pty) <= 1 && (p.checkpoint.x !== cp.x || p.checkpoint.y !== cp.y)) {
      p.checkpoint = { x: cp.x, y: cp.y };
      showMessage('The way is remembered. (checkpoint)', 2.5);
    }
  }
  // exit door
  if (door.open && door.anim > 0.9) {
    for (const c of door.cells) {
      if (ptx === c.x && Math.abs(pty - c.y) <= 1 && state === 'play') {
        state = 'win'; winT = 0; sfx('win');
        const used = TIME_LIMIT - timeLeft;
        if (!bestTime || used < bestTime) {
          bestTime = used;
          try { localStorage.setItem('pop_best_time', String(bestTime)); } catch (e) {}
        }
      }
    }
  }

  // --- hazards ---
  // spikes: deadly unless creeping (walk) slowly and not falling onto them
  for (const ft of feetTiles(p)) {
    const cAbove = charAt(ft.x, ft.y - 1);
    if (cAbove === '^') {
      const fastFall = p.vy > 260 || (p.peakY < p.y - TILE * 1.2 && !p.onGround);
      const running = Math.abs(p.vx) > WALK_SPD + 25;
      if (fastFall || running) killPlayer('Impaled upon the spikes.');
    }
  }
  // also direct overlap with a spike cell while moving fast
  if (charAt(ptx, Math.floor((p.y + p.h - 6) / TILE)) === '^') {
    if (Math.abs(p.vx) > WALK_SPD + 25 || p.vy > 260) killPlayer('Impaled upon the spikes.');
  }
  // chompers
  for (const ch of chompers) {
    if (chomperClosed(ch)) {
      const cx0 = ch.x * TILE, cx1 = cx0 + TILE;
      if (p.x + p.w > cx0 + 6 && p.x < cx1 - 6 && Math.abs((p.y + p.h) - (ch.y + 1) * TILE) < TILE * 1.6) {
        killPlayer('The slicer claims another victim.');
        shake = 10;
      }
    }
  }
  // fell out of the world (shouldn't happen, but be safe)
  if (p.y > H * TILE + 100) killPlayer('Lost to the abyss.');
}

// ---------- guard ----------
function updateGuard(dt){
  const g = guard;
  if (!g || g.dead) return;
  if (g.blockT > 0) g.blockT -= dt;
  if (g.hurtT > 0) { g.hurtT -= dt; g.vx = 0; moveEnt(g, dt); return; }
  const p = player;
  const gx = g.x + g.w / 2, px = p.x + p.w / 2;
  const sameFloor = Math.abs((g.y + g.h) - (p.y + p.h)) < 24;
  const dist = Math.abs(gx - px);
  const engaged = sameFloor && dist < TILE * 7 && !p.dead;

  g.vx = 0;
  if (engaged) {
    g.dir = px > gx ? 1 : -1;
    if (dist > TILE * 1.35) {
      g.vx = g.dir * 95;
      g.telegraphT = 0;
    } else {
      // in striking range
      if (g.strikeT > 0) {
        g.strikeT -= dt;
      } else if (g.telegraphT > 0) {
        g.telegraphT -= dt;
        if (g.telegraphT <= 0) {
          // strike lands now
          if (dist < TILE * 1.7 && sameFloor) {
            if (held.block() && p.onGround) {
              sfx('clang'); showMessage('Parried!', 1); shake = Math.max(shake, 2);
              hitstop = Math.max(hitstop, 0.08);
              g.thinkT += 0.4; // a parry staggers him
            } else {
              hurtPlayer(1, 'Cut down by the guard.');
              p.vx = g.dir * 190; p.vy = Math.min(p.vy, -110); // knockback
            }
          }
          g.strikeT = 0.35;
          g.thinkT = 0.9 + (Math.abs(Math.sin(g.x * 12.9)) * 0.9);
        }
      } else {
        g.thinkT -= dt;
        if (g.thinkT <= 0) g.telegraphT = 0.4;
      }
    }
  } else {
    // patrol near home
    g.telegraphT = 0; g.thinkT = Math.max(g.thinkT, 0.8);
    const drift = g.homeX - g.x;
    if (Math.abs(drift) > 8) g.vx = Math.sign(drift) * 40;
  }
  // don't walk off edges or into walls
  if (g.vx !== 0) {
    const aheadX = g.vx > 0 ? g.x + g.w + 4 : g.x - 4;
    const tx = Math.floor(aheadX / TILE);
    const footTy = Math.floor((g.y + g.h + 4) / TILE);
    const bodyTy = Math.floor((g.y + g.h / 2) / TILE);
    if (!solid(tx, footTy) || solid(tx, bodyTy)) g.vx = 0;
  }
  moveEnt(g, dt);
}

// ---------- world objects ----------
function chomperPhase(ch){
  return (tNow * 0.55 + ch.offset) % 1;
}
function chomperClosed(ch){
  const ph = chomperPhase(ch);
  return ph > 0.42 && ph < 0.62;
}
let tNow = 0;

function updateWorld(dt){
  tNow += dt;
  // gates
  for (const id in gates) {
    const gt = gates[id];
    if (gt.holdT > 0) { gt.holdT -= dt; gt.open = Math.min(1, gt.open + dt * 1.6); }
    else gt.open = Math.max(0, gt.open - dt * 0.7);
  }
  // plates decay
  for (const pl of plates) if (pl.pressed > 0) pl.pressed -= dt;
  // exit door
  if (door.open) door.anim = Math.min(1, door.anim + dt * 0.8);
  // lever settle
  if (lever && lever.anim > 0) lever.anim = Math.max(0, lever.anim - dt * 2);
  // loose tiles
  for (const key in looseTiles) {
    const lt = looseTiles[key];
    if (lt.state === 'shaking') {
      lt.t -= dt;
      if (lt.t <= 0) {
        lt.state = 'gone';
        grid[lt.y][lt.x] = ' ';
        fallingTiles.push({ x: lt.x * TILE, y: lt.y * TILE, vy: 50 });
        sfx('crumble');
      }
    }
  }
  // falling tile debris
  for (let i = fallingTiles.length - 1; i >= 0; i--) {
    const f = fallingTiles[i];
    f.vy += GRAV * 0.7 * dt;
    f.y += f.vy * dt;
    const ty = Math.floor((f.y + TILE) / TILE), tx = Math.floor((f.x + TILE / 2) / TILE);
    if (solid(tx, ty)) {
      for (let d = 0; d < 8; d++) particles.push({
        x: f.x + TILE / 2, y: ty * TILE, vx: (d - 4) * 40, vy: -120 - (d % 3) * 60, life: 0.6, c: '#6a5a44'
      });
      shake = Math.max(shake, 4); sfx('land');
      fallingTiles.splice(i, 1);
    }
  }
  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    pt.vy += GRAV * 0.5 * dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    if (pt.life <= 0) particles.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 18);
  if (messageT > 0) { messageT -= dt; if (messageT <= 0) message = ''; }
}

// ---------- rendering ----------
function hash2(x, y){ const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }

// ---------- baked level layer ----------
// The static world (back wall, windows, bricks) renders once per level into an
// offscreen canvas; per-frame drawing is a single blit plus the dynamic objects.
let levelBake = null;
const WINDOWS = [];
function bakeLevel(){
  const c = document.createElement('canvas');
  c.width = W * TILE; c.height = H * TILE;
  const g = c.getContext('2d');
  // back wall
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (charAt(tx, ty) === '#') continue;
    const h = hash2(tx, ty);
    g.fillStyle = h > 0.66 ? '#262019' : (h > 0.33 ? '#231d16' : '#201a13');
    g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1;
    g.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE, TILE * 0.5);
    if (h > 0.92) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(tx * TILE + 6, ty * TILE + 9, 8, 4); }
  }
  // moonlit windows + light shafts
  WINDOWS.length = 0;
  for (const bandTop of [1, 8, 16]) {
    for (const wx of [20, 46, 72]) {
      const px = wx * TILE, py = (bandTop + 1) * TILE;
      const wW = TILE * 1.6, wH = TILE * 2;
      WINDOWS.push({ x: px + wW / 2, y: py + wH * 0.5 });
      // shaft of moonlight slanting to the floor
      g.beginPath();
      g.moveTo(px + 4, py + 8);
      g.lineTo(px + wW - 4, py + 8);
      g.lineTo(px + wW - 4 - TILE * 1.7, py + TILE * 4.7);
      g.lineTo(px + 4 - TILE * 1.7, py + TILE * 4.7);
      g.closePath();
      g.fillStyle = 'rgba(168,190,230,0.05)';
      g.fill();
      // arched recess
      g.fillStyle = '#0c1220';
      g.beginPath();
      g.moveTo(px, py + wH);
      g.lineTo(px, py + wW * 0.35);
      g.quadraticCurveTo(px + wW / 2, py - wW * 0.3, px + wW, py + wW * 0.35);
      g.lineTo(px + wW, py + wH);
      g.closePath(); g.fill();
      // moon glow
      const mg = g.createRadialGradient(px + wW / 2, py + wH * 0.4, 2, px + wW / 2, py + wH * 0.4, wW);
      mg.addColorStop(0, 'rgba(190,210,245,0.45)');
      mg.addColorStop(1, 'rgba(190,210,245,0)');
      g.fillStyle = mg;
      g.fillRect(px - 8, py - 10, wW + 16, wH + 18);
      // bars
      g.strokeStyle = '#10151f'; g.lineWidth = 3;
      g.beginPath();
      for (let b = 1; b <= 2; b++) { g.moveTo(px + (wW / 3) * b, py - 4); g.lineTo(px + (wW / 3) * b, py + wH); }
      g.stroke();
      // sill
      g.fillStyle = '#39301f';
      g.fillRect(px - 4, py + wH, wW + 8, 5);
    }
  }
  // solid bricks, edge-aware
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (charAt(tx, ty) !== '#') continue;
    const h = hash2(tx * 3, ty * 7);
    const px = tx * TILE, py = ty * TILE;
    g.fillStyle = h > 0.66 ? '#4e4030' : (h > 0.33 ? '#483a2b' : '#443626');
    g.fillRect(px, py, TILE, TILE);
    // running-bond mortar
    g.strokeStyle = 'rgba(20,12,6,0.55)'; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px, py + TILE / 2); g.lineTo(px + TILE, py + TILE / 2);
    const off = (ty % 2 === 0) ? TILE / 2 : 0;
    g.moveTo(px + (off || 0.01), py); g.lineTo(px + (off || 0.01), py + TILE / 2);
    g.moveTo(px + ((off + TILE / 2) % TILE), py + TILE / 2); g.lineTo(px + ((off + TILE / 2) % TILE), py + TILE);
    g.stroke();
    const openTop = charAt(tx, ty - 1) !== '#', openBottom = charAt(tx, ty + 1) !== '#';
    const openLeft = charAt(tx - 1, ty) !== '#', openRight = charAt(tx + 1, ty) !== '#';
    if (openTop) { // worn walking surface
      g.fillStyle = '#705e45';
      g.fillRect(px, py, TILE, 4);
      g.fillStyle = 'rgba(255,240,210,0.10)';
      g.fillRect(px, py + 4, TILE, 2);
      if (h > 0.75) { g.fillStyle = '#3a2f20'; g.fillRect(px + 4 + h * 14, py, 5, 3); } // chipped edge
    }
    if (openBottom) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, py + TILE - 3, TILE, 3); }
    if (openLeft)  { g.fillStyle = 'rgba(255,235,200,0.08)'; g.fillRect(px, py, 2, TILE); }
    if (openRight) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px + TILE - 2, py, 2, TILE); }
    if (h > 0.88) { // crack
      g.strokeStyle = 'rgba(15,8,4,0.6)'; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px + 8, py + 4); g.lineTo(px + 14, py + 14); g.lineTo(px + 10, py + 24);
      g.stroke();
    }
    if (h < 0.09 && openTop) { // moss creeping over the edge
      g.fillStyle = 'rgba(88,118,62,0.4)';
      g.fillRect(px + 3, py, 9, 5);
      g.fillRect(px + 18, py, 7, 4);
      g.fillRect(px + 8, py + 5, 4, 3);
    }
  }
  return c;
}

// ---------- lighting & atmosphere ----------
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VIEW_W; lightCanvas.height = VIEW_H;
const lctx = lightCanvas.getContext('2d');
const vignette = document.createElement('canvas');
vignette.width = VIEW_W; vignette.height = VIEW_H;
{
  const vg = vignette.getContext('2d');
  const grad = vg.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  vg.fillStyle = grad; vg.fillRect(0, 0, VIEW_W, VIEW_H);
}
function punchLight(x, y, r, a){
  if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) return;
  const gr = lctx.createRadialGradient(x, y, r * 0.12, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${a})`);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  lctx.fillStyle = gr;
  lctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawLighting(sx, sy){
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VIEW_W, VIEW_H);
  lctx.fillStyle = 'rgba(5,3,12,0.58)';
  lctx.fillRect(0, 0, VIEW_W, VIEW_H);
  lctx.globalCompositeOperation = 'destination-out';
  for (const t of torches)
    punchLight(t.x * TILE + TILE / 2 - sx, t.y * TILE + 6 - sy, 128 + Math.sin(tNow * 8.5 + t.x) * 8, 0.95);
  for (const wnd of WINDOWS) punchLight(wnd.x - sx, wnd.y - sy, 95, 0.5);
  for (const pot of potions) if (!pot.taken) punchLight(pot.x * TILE + 16 - sx, pot.y * TILE + 22 - sy, 46, 0.5);
  if (sword && !sword.taken) punchLight(sword.x * TILE + 16 - sx, sword.y * TILE + 16 - sy, 58, 0.6);
  if (door.open && door.cells.length) punchLight(door.cells[0].x * TILE + 16 - sx, door.cells[0].y * TILE + 32 - sy, 115, 0.85);
  punchLight(player.x + player.w / 2 - sx, player.y + player.h / 2 - sy, 95, 0.55);
  if (guard && !guard.dead) punchLight(guard.x + guard.w / 2 - sx, guard.y + guard.h / 2 - sy, 60, 0.35);
  ctx.drawImage(lightCanvas, sx, sy);
}
function drawMotes(sx, sy){
  for (let i = 0; i < 42; i++) {
    const seed = i * 37.7;
    const mx = ((seed * 91 + tNow * (5 + (i % 5) * 3)) % (VIEW_W + 40)) - 20;
    const my = ((seed * 53) % VIEW_H) + Math.sin(tNow * 0.7 + i) * 26;
    const tw = 0.5 + 0.5 * Math.sin(tNow * (1.3 + (i % 3) * 0.4) + seed);
    ctx.globalAlpha = 0.08 + tw * 0.15;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(190,205,235,1)' : 'rgba(255,235,190,1)';
    ctx.fillRect(sx + mx, sy + my, i % 3 === 0 ? 2 : 1.5, i % 3 === 0 ? 2 : 1.5);
  }
  ctx.globalAlpha = 1;
}

function drawWorld(){
  ctx.fillStyle = '#0e0a07';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const sx = Math.round(camX + (Math.random() - 0.5) * shake);
  const sy = Math.round(camY + (Math.random() - 0.5) * shake);
  ctx.save();
  ctx.translate(-sx, -sy);

  const x0 = Math.floor(sx / TILE) - 1, x1 = Math.floor((sx + VIEW_W) / TILE) + 1;
  const y0 = Math.floor(sy / TILE) - 1, y1 = Math.floor((sy + VIEW_H) / TILE) + 1;

  // static world (back wall, windows, bricks) — baked once per level
  if (levelBake) ctx.drawImage(levelBake, 0, 0);

  // torches (behind everything else)
  for (const t of torches) {
    const bx = t.x * TILE + TILE / 2, by = t.y * TILE + TILE / 2;
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(bx - 3, by, 6, 16);
    const fl = Math.sin(tNow * 9 + t.x) * 2.5;
    const grad = ctx.createRadialGradient(bx, by - 4, 2, bx, by - 4, 46);
    grad.addColorStop(0, 'rgba(255,180,70,0.32)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx - 46, by - 50, 92, 92);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath(); ctx.ellipse(bx, by - 6 + fl * 0.3, 4, 7 + fl, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.ellipse(bx, by - 4, 2, 3.5, 0, 0, 7); ctx.fill();
  }

  // spikes
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (charAt(tx, ty) !== '^') continue;
    const bx = tx * TILE, by = (ty + 1) * TILE;
    ctx.fillStyle = '#b9b3a8';
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.moveTo(bx + s * 8 + 1, by);
      ctx.lineTo(bx + s * 8 + 4, by - 18);
      ctx.lineTo(bx + s * 8 + 7, by);
      ctx.fill();
    }
    ctx.fillStyle = '#7a7468';
    ctx.fillRect(bx, by - 3, TILE, 3);
  }

  // potions, sword, lever, plates, door, gates, chompers
  for (const pot of potions) {
    if (pot.taken) continue;
    const bx = pot.x * TILE + TILE / 2, by = (pot.y + 1) * TILE;
    const bob = Math.sin(tNow * 3 + pot.x) * 1.5;
    ctx.fillStyle = pot.big ? '#4a72d0' : '#c03a30';
    ctx.beginPath(); ctx.ellipse(bx, by - 8 + bob, pot.big ? 8 : 6, pot.big ? 9 : 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(bx - 2, by - (pot.big ? 22 : 19) + bob, 4, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(bx - 2, by - 10 + bob, 2, 3, 0, 0, 7); ctx.fill();
  }
  if (sword && !sword.taken) {
    const bx = sword.x * TILE + TILE / 2, by = (sword.y + 1) * TILE - 4;
    const gl = 0.5 + Math.sin(tNow * 4) * 0.3;
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(-0.5);
    ctx.fillStyle = `rgba(220,225,235,${0.85 + gl * 0.15})`;
    ctx.fillRect(-2, -26, 4, 26);
    ctx.fillStyle = '#8a6a30';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.fillRect(-2, 0, 4, 8);
    ctx.restore();
    const grad = ctx.createRadialGradient(bx, by - 12, 2, bx, by - 12, 30);
    grad.addColorStop(0, `rgba(200,220,255,${0.12 * gl})`);
    grad.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx - 30, by - 42, 60, 60);
  }
  if (lever) {
    const bx = lever.x * TILE + TILE / 2, by = (lever.y + 1) * TILE;
    ctx.fillStyle = '#54473a';
    ctx.fillRect(bx - 6, by - 10, 12, 10);
    const ang = lever.pulled ? 0.7 : -0.7;
    ctx.strokeStyle = '#9a8a70'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bx, by - 8);
    ctx.lineTo(bx + Math.sin(ang) * 20, by - 8 - Math.cos(ang) * 20);
    ctx.stroke();
    ctx.fillStyle = '#c03a30';
    ctx.beginPath(); ctx.arc(bx + Math.sin(ang) * 20, by - 8 - Math.cos(ang) * 20, 4, 0, 7); ctx.fill();
  }
  for (const pl of plates) {
    const bx = pl.x * TILE, by = (pl.y + 1) * TILE;
    const down = pl.pressed > 0 ? 3 : 0;
    ctx.fillStyle = '#8f8474';
    ctx.fillRect(bx + 3, by - 5 + down, TILE - 6, 5 - down + 2);
    ctx.fillStyle = '#5f574c';
    ctx.fillRect(bx + 3, by - 2, TILE - 6, 2);
  }
  // exit door
  if (door.cells.length) {
    const dc = door.cells.reduce((a, b) => a.y < b.y ? a : b);
    const bx = dc.x * TILE, byTop = dc.y * TILE, hgt = door.cells.length * TILE;
    ctx.fillStyle = '#171009';
    ctx.fillRect(bx, byTop, TILE, hgt);
    // frame
    ctx.fillStyle = '#5c4a30';
    ctx.fillRect(bx - 5, byTop - 6, TILE + 10, 6);
    ctx.fillRect(bx - 5, byTop, 5, hgt);
    ctx.fillRect(bx + TILE, byTop, 5, hgt);
    // portcullis rising with anim
    const rise = door.anim * hgt;
    ctx.fillStyle = '#3d3225';
    ctx.fillRect(bx, byTop, TILE, hgt - rise);
    ctx.strokeStyle = '#20180f'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(bx + i * 8, byTop); ctx.lineTo(bx + i * 8, byTop + hgt - rise); ctx.stroke();
    }
    if (door.anim > 0.9) {
      const grad = ctx.createLinearGradient(bx, byTop, bx, byTop + hgt);
      grad.addColorStop(0, 'rgba(255,230,160,0.25)');
      grad.addColorStop(1, 'rgba(255,230,160,0.02)');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, byTop, TILE, hgt);
    }
  }
  // gates
  for (const id in gates) {
    const gt = gates[id];
    const top = gt.cells.reduce((a, b) => a.y < b.y ? a : b);
    const hgt = gt.cells.length * TILE;
    const bx = top.x * TILE, byTop = top.y * TILE;
    const rise = gt.open * (hgt - 6);
    ctx.fillStyle = '#4a4034';
    ctx.fillRect(bx - 4, byTop - 6, TILE + 8, 6);
    ctx.fillStyle = '#6e6252';
    ctx.fillRect(bx + 2, byTop - rise, 4, hgt);
    ctx.fillRect(bx + TILE - 6, byTop - rise, 4, hgt);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, byTop, TILE, hgt); ctx.clip();
    ctx.fillStyle = '#7d7060';
    for (let i = 0; i < 4; i++) ctx.fillRect(bx + 2 + i * 8, byTop - rise, 4, hgt);
    for (let j = 0; j < gt.cells.length * 2; j++) ctx.fillRect(bx, byTop - rise + j * 16 + 4, TILE, 3);
    ctx.restore();
  }
  // chompers
  for (const ch of chompers) {
    const bx = ch.x * TILE, floorY = (ch.y + 1) * TILE;
    const ph = chomperPhase(ch);
    // jaw extension 0..1 (closed at ~0.5)
    let ext = 0;
    if (ph > 0.34 && ph <= 0.45) ext = (ph - 0.34) / 0.11;
    else if (ph > 0.45 && ph < 0.6) ext = 1;
    else if (ph >= 0.6 && ph < 0.72) ext = 1 - (ph - 0.6) / 0.12;
    const span = TILE * 1.7;
    // frame
    ctx.fillStyle = '#3c3226';
    ctx.fillRect(bx - 2, floorY - span - 14, TILE + 4, 12);
    // teeth from the top
    const jawLen = ext * (span * 0.55);
    ctx.fillStyle = '#c9c2b4';
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.moveTo(bx + s * 8 + 1, floorY - span - 2);
      ctx.lineTo(bx + s * 8 + 4, floorY - span - 2 + jawLen + 12);
      ctx.lineTo(bx + s * 8 + 7, floorY - span - 2);
      ctx.fill();
    }
    // teeth from the bottom
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.moveTo(bx + s * 8 + 1, floorY);
      ctx.lineTo(bx + s * 8 + 4, floorY - jawLen - 6);
      ctx.lineTo(bx + s * 8 + 7, floorY);
      ctx.fill();
    }
    if (chomperClosed(ch)) {
      ctx.fillStyle = 'rgba(255,60,40,0.12)';
      ctx.fillRect(bx, floorY - span, TILE, span);
    }
  }

  // loose tiles (dynamic — the rest of the terrain lives in the bake)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = charAt(tx, ty);
    if (c !== 'L') continue;
    { const lt = looseTiles[tx + ',' + ty]; if (!lt || lt.state === 'gone') continue; }
    const h = hash2(tx * 3, ty * 7);
    let px = tx * TILE, py = ty * TILE;
    if (c === 'L') {
      const lt = looseTiles[tx + ',' + ty];
      if (lt.state === 'shaking') { px += Math.sin(tNow * 60) * 2; py += Math.sin(tNow * 47) * 1.5; }
    }
    const topOpen = !solid(tx, ty - 1);
    ctx.fillStyle = c === 'L' ? (h > 0.5 ? '#5d4c38' : '#57462f') : (h > 0.5 ? '#4c3e2d' : '#463929');
    ctx.fillRect(px, py, TILE, TILE);
    // brick pattern
    ctx.strokeStyle = 'rgba(20,12,6,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py + TILE / 2); ctx.lineTo(px + TILE, py + TILE / 2);
    const off = (ty % 2 === 0) ? TILE / 2 : 0;
    ctx.moveTo(px + off || px + 0.01, py); ctx.lineTo(px + (off || 0.01), py + TILE / 2);
    ctx.moveTo(px + ((off + TILE / 2) % TILE), py + TILE / 2); ctx.lineTo(px + ((off + TILE / 2) % TILE), py + TILE);
    ctx.stroke();
    if (topOpen) { // walkable surface highlight
      ctx.fillStyle = c === 'L' ? '#79654a' : '#6d5c44';
      ctx.fillRect(px, py, TILE, 4);
      if (c === 'L') { // cracks marking loose tiles
        ctx.strokeStyle = 'rgba(15,8,4,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 1); ctx.lineTo(px + 12, py + 9); ctx.lineTo(px + 9, py + 15);
        ctx.moveTo(px + 22, py + 2); ctx.lineTo(px + 18, py + 10);
        ctx.stroke();
      }
    }
  }

  // falling tiles
  ctx.fillStyle = '#57462f';
  for (const f of fallingTiles) ctx.fillRect(f.x, f.y, TILE, TILE * 0.6);

  // particles
  for (const pt of particles) {
    ctx.globalAlpha = Math.max(pt.life / 0.6, 0);
    ctx.fillStyle = pt.c;
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  if (guard && !(guard.dead && guard.deadFaded)) drawFigure(guard, true);
  drawFigure(player, false);

  // atmosphere: dynamic lighting, dust motes, vignette
  drawLighting(sx, sy);
  drawMotes(sx, sy);
  ctx.drawImage(vignette, sx, sy);

  ctx.restore();
}

// ---------- pixel-art sprites ----------
// 16x24 frames, authored facing right, baked to offscreen canvases at load.
const FRAME_W = 16, FRAME_H = 24, SPR_SCALE = 2;
const FRAMES = {
idle: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.t....",
"....s.tttt.s....",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......f..f......",
".....ff..ff.....",
],
run0: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.ts...",
"...s..tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l.ll......",
".....ll...l.....",
"....ll....l.....",
"....l......l....",
"...ll......ll...",
"...f........l...",
".............l..",
".............l..",
".............f..",
],
run1: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.t....",
"....s.tttt.s....",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......lll.......",
"......ll........",
"......ll........",
"......l.l.......",
"......l.l.......",
"......l..l......",
"......l..f......",
"......l.........",
"......f.........",
],
run2: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.t....",
"....s.tttt.s....",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......ll.l......",
".....l...ll.....",
".....l....ll....",
"....l......l....",
"..ll......ll....",
"..l........f....",
"..l.............",
"..l.............",
"..f.............",
],
run3: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.t....",
"....s.tttt.s....",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
".......lll......",
"........ll......",
"........ll......",
".......l.l......",
".......l.l......",
"......l..l......",
"......f..l......",
".........l......",
".........f......",
],
jump: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt..s...",
"....tttttttt....",
"..s.t.tttt......",
"......tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
".....ll..ll.....",
"....ll....ll....",
"...ll......ll...",
"...f........ll..",
".............f..",
"................",
"................",
"................",
"................",
],
fall: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"...s..tttt..s...",
"....tttttttt....",
"...t.tttt..t....",
"......tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l..l......",
".....l....l.....",
".....l....l.....",
"......l..l......",
"......f..f......",
"................",
"................",
"................",
"................",
],
hang: [
"....s......s....",
"....t......t....",
"....t.hhhh.t....",
"....t.hhhh.t....",
"....t.ssss.t....",
"......ssse......",
".......ss.......",
"......tttt......",
".....tttttt.....",
"......tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
"......l..l......",
"......l..l......",
"......l..l......",
".....l...l......",
".....l..l.......",
".....f..f.......",
"................",
"................",
"................",
"................",
"................",
],
climb: [
"................",
"................",
"................",
"................",
"................",
"................",
"......hhhh......",
".....hhhhhh.s...",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
"......tttt......",
"....tttttttt....",
"....s.tttt......",
"......dddd......",
"......bbbb......",
".....llllll.....",
"....ll....ll....",
"....l......l....",
"....f......f....",
"................",
"................",
"................",
"................",
],
raise: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.s...",
"......ssss..t...",
".......ss..t....",
"......tttt.t....",
"....tttttttt....",
"....t.tttt......",
"....s.tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......f..f......",
".....ff..ff.....",
],
thrust: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.ttttttsss.",
"....s.tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l.ll......",
".....ll...l.....",
"....ll....l.....",
"....l......l....",
"...ll......ll...",
"...f........l...",
".............l..",
".............l..",
".............f..",
],
block: [
"................",
"......hhhh......",
".....hhhhhh.....",
".....hhssss.....",
".....hsssse.....",
"......ssss......",
".......ss.......",
"......tttt......",
"....tttttttt....",
"....t.tttt.ts...",
"....s.tttt......",
"......dddd......",
"......bbbb......",
".....tttttt.....",
".....tttttt.....",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......l..l......",
"......f..f......",
".....ff..ff.....",
],
slump: [
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"................",
"......tttt......",
"..hh.tttttttt...",
".hsstttttttttl..",
".tttttttttttll..",
"..t..........f..",
],
};
// hand pixel (sprite coords) per frame, anchoring the sword overlay
const HAND = {
  idle: [11,10], run0: [12,9], run1: [11,10], run2: [11,10], run3: [11,10],
  jump: [12,7], fall: [12,7], climb: [12,7],
  raise: [12,4], thrust: [14,9], block: [12,9],
};
const PAL_PRINCE = { h:'#3a2a18', s:'#d8a878', e:'#1c1008', t:'#e8e0d0', d:'#c8bda3', b:'#8a5a28', l:'#ded6c2', f:'#7a5a2c' };
const PAL_GUARD  = { h:'#4a4a58', s:'#c08a58', e:'#140b04', t:'#8a2a22', d:'#5e1c16', b:'#caa84a', l:'#3c3140', f:'#241a14' };

function bakeFrame(rows, pal, white){
  const c = document.createElement('canvas');
  c.width = FRAME_W; c.height = FRAME_H;
  const g = c.getContext('2d');
  for (let y = 0; y < FRAME_H; y++) {
    const row = (rows[y] || '').padEnd(FRAME_W, '.');
    for (let x = 0; x < FRAME_W; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      g.fillStyle = white ? '#ffffff' : (pal[ch] || '#ff00ff');
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
const SPRITES = { prince: {}, guard: {}, princeW: {}, guardW: {} };
for (const name in FRAMES) {
  SPRITES.prince[name]  = bakeFrame(FRAMES[name], PAL_PRINCE, false);
  SPRITES.guard[name]   = bakeFrame(FRAMES[name], PAL_GUARD, false);
  SPRITES.princeW[name] = bakeFrame(FRAMES[name], PAL_PRINCE, true);
  SPRITES.guardW[name]  = bakeFrame(FRAMES[name], PAL_GUARD, true);
}

function pickFrame(f, isGuard){
  if (f.dead) return 'slump';
  if (f.hang) return 'hang';
  if (f.climbT > 0) return 'climb';
  if ((f.blockT || 0) > 0) return 'block';
  const attacking = (f.attackT || 0) > 0 || (f.telegraphT || 0) > 0 || (f.strikeT || 0) > 0;
  if (attacking) {
    const raised = (f.attackT || 0) > 0.2 || (f.telegraphT || 0) > 0;
    return raised ? 'raise' : 'thrust';
  }
  if (!isGuard && held.block() && f.hasSword && f.onGround) return 'block';
  if (!f.onGround) return f.vy < 0 ? 'jump' : 'fall';
  if (Math.abs(f.vx) > 20) return 'run' + (Math.floor(f.runPhase || 0) % 4);
  return 'idle';
}

function drawFigure(f, isGuard){
  const cx = f.x + f.w / 2;
  const bottom = f.y + f.h;
  const flash = (f.hurtT > 0 && Math.floor(tNow * 14) % 2 === 0);
  const frame = pickFrame(f, isGuard);
  const set = flash ? (isGuard ? 'guardW' : 'princeW') : (isGuard ? 'guard' : 'prince');
  const img = SPRITES[set][frame];

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(bottom));
  if (f.onGround || f.dead) { // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 1, f.dead ? 17 : 12, 3.2, 0, 0, 7); ctx.fill();
  }
  ctx.scale(f.dir || 1, 1);
  const bob = (frame === 'idle') ? Math.round(Math.sin(tNow * 2.2) + 0.5) : 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -FRAME_W, -FRAME_H * SPR_SCALE + bob, FRAME_W * SPR_SCALE, FRAME_H * SPR_SCALE);

  // sword overlay, anchored to the hand pixel of the current frame
  const hasSword = (isGuard || f.hasSword) && !f.dead && !f.hang && HAND[frame];
  if (hasSword) {
    const hx = -FRAME_W + HAND[frame][0] * SPR_SCALE;
    const hy = -FRAME_H * SPR_SCALE + HAND[frame][1] * SPR_SCALE + bob;
    ctx.strokeStyle = '#dfe3ea'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (frame === 'raise') { ctx.moveTo(hx, hy); ctx.lineTo(hx + 4, hy - 16); }
    else if (frame === 'thrust') { ctx.moveTo(hx, hy + 1); ctx.lineTo(hx + 19, hy + 1); }
    else if (frame === 'block') { ctx.moveTo(hx + 3, hy - 10); ctx.lineTo(hx + 3, hy + 9); }
    else { ctx.moveTo(hx, hy); ctx.lineTo(hx + 9, hy - 12); }
    ctx.stroke();
    ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx - 2, hy + 2); ctx.lineTo(hx + 2, hy - 2); ctx.stroke();
    // telegraph gleam at the raised blade tip
    if ((f.telegraphT || 0) > 0) {
      ctx.fillStyle = 'rgba(255,220,120,0.8)';
      ctx.beginPath(); ctx.arc(hx + 4, hy - 16, 3 + Math.sin(tNow * 30) * 1.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

function heartGem(bx, by, lit, litColor, dimColor){
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; // outline
  ctx.beginPath();
  ctx.moveTo(bx - 1.5, by - 7.5); ctx.lineTo(bx + 13.5, by - 7.5); ctx.lineTo(bx + 6, by + 7.5);
  ctx.fill();
  ctx.fillStyle = lit ? litColor : dimColor;
  ctx.beginPath();
  ctx.moveTo(bx, by - 6); ctx.lineTo(bx + 12, by - 6); ctx.lineTo(bx + 6, by + 6);
  ctx.fill();
  if (lit) { // gleam
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(bx + 2.5, by - 4.5, 3, 2);
  }
}

function drawHUD(){
  // bottom bar, PoP style
  const bg = ctx.createLinearGradient(0, VIEW_H - 34, 0, VIEW_H);
  bg.addColorStop(0, 'rgba(10,6,3,0.88)'); bg.addColorStop(1, 'rgba(0,0,0,0.94)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, VIEW_H - 34, VIEW_W, 34);
  ctx.fillStyle = 'rgba(201,168,106,0.45)';
  ctx.fillRect(0, VIEW_H - 34, VIEW_W, 1);
  // player health
  for (let i = 0; i < player.maxHp; i++)
    heartGem(14 + i * 18, VIEW_H - 17, i < player.hp, '#d03028', '#3a1512');
  // guard health
  if (guard && !guard.dead) {
    const gx = guard.x + guard.w / 2, px = player.x + player.w / 2;
    if (Math.abs(gx - px) < TILE * 9 && Math.abs(guard.y - player.y) < TILE * 3) {
      for (let i = 0; i < 3; i++)
        heartGem(VIEW_W - 26 - i * 18, VIEW_H - 17, i < guard.hp, '#4a72d0', '#16203a');
    }
  }
  // timer
  const mins = Math.floor(timeLeft / 60), secs = Math.floor(timeLeft % 60);
  ctx.fillStyle = '#c9a86a';
  ctx.font = '14px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(`${mins}:${String(secs).padStart(2, '0')} remaining`, VIEW_W / 2, VIEW_H - 12);
  // message
  if (message) {
    ctx.fillStyle = '#e8e0d0';
    ctx.font = '15px Georgia';
    ctx.fillText(message, VIEW_W / 2, VIEW_H - 44);
  }
  ctx.textAlign = 'left';
}

function drawOverlay(title, sub, sub2){
  ctx.fillStyle = 'rgba(5,3,2,0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // ornate panel
  const pw = 660, ph = 234, px0 = (VIEW_W - pw) / 2, py0 = VIEW_H / 2 - 128;
  ctx.fillStyle = 'rgba(12,8,5,0.93)';
  ctx.fillRect(px0, py0, pw, ph);
  ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 2;
  ctx.strokeRect(px0 + 6.5, py0 + 6.5, pw - 13, ph - 13);
  ctx.strokeStyle = 'rgba(201,168,106,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(px0 + 12.5, py0 + 12.5, pw - 25, ph - 25);
  ctx.fillStyle = '#c9a86a';
  for (const [dx2, dy2] of [[px0 + 6, py0 + 6], [px0 + pw - 6, py0 + 6], [px0 + 6, py0 + ph - 6], [px0 + pw - 6, py0 + ph - 6]]) {
    ctx.save(); ctx.translate(dx2, dy2); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
  }
  ctx.textAlign = 'center';
  const tg = ctx.createLinearGradient(0, py0 + 44, 0, py0 + 82);
  tg.addColorStop(0, '#f2dcac'); tg.addColorStop(1, '#a87f3c');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = '34px Georgia';
  ctx.fillText(title, VIEW_W / 2 + 2, py0 + 78);
  ctx.fillStyle = tg;
  ctx.fillText(title, VIEW_W / 2, py0 + 76);
  ctx.fillStyle = '#e8e0d0';
  ctx.font = '15px Georgia';
  if (sub) ctx.fillText(sub, VIEW_W / 2, py0 + 126, pw - 70);
  if (sub2) { ctx.fillStyle = '#9a8a68'; ctx.fillText(sub2, VIEW_W / 2, py0 + 164, pw - 70); }
  ctx.textAlign = 'left';
}

// ---------- main loop ----------
state = 'title';
resetLevel();
let lastT = performance.now();

function frame(now){
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  if (state === 'title') {
    drawWorld(); drawHUD();
    const b = bestTime ? ` · Best escape: ${Math.floor(bestTime / 60)}:${String(Math.floor(bestTime % 60)).padStart(2, '0')}` : '';
    drawOverlay('Prince of the Lost Tower',
      'Escape the dungeon before the hour runs out. Find the sword — you will need it.',
      'Press Enter to begin' + b);
    if (edge.enter()) { state = 'play'; showMessage('Escape. You have one hour.', 4); }
  } else if (state === 'play') {
    if (keyEdge['KeyP'] || keyEdge['Escape']) {
      state = 'paused';
    } else if (hitstop > 0) {
      hitstop -= dt; // frozen frame for impact
    } else {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; state = 'timeup'; }
      updateWorld(dt);
      updatePlayer(dt);
      updateGuard(dt);
      // camera follows, looking ahead of the prince
      const lookTarg = (Math.abs(player.vx) > 60 && player.onGround) ? player.dir * 70 : player.look * 0.9;
      player.look += (lookTarg - player.look) * Math.min(dt * 2.5, 1);
      const targX = Math.max(0, Math.min(player.x + player.w / 2 + player.look - VIEW_W / 2, W * TILE - VIEW_W));
      const targY = Math.max(0, Math.min(player.y + player.h / 2 - VIEW_H / 2, H * TILE - VIEW_H));
      camX += (targX - camX) * Math.min(dt * 8, 1);
      camY += (targY - camY) * Math.min(dt * 6, 1);
    }
    drawWorld(); drawHUD();
    if (player.hurtT > 0.95) { // red sting on taking a hit
      ctx.fillStyle = 'rgba(180,20,10,0.22)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  } else if (state === 'paused') {
    drawWorld(); drawHUD();
    drawOverlay('Paused', 'The tower waits.', 'P or Esc to resume');
    if (keyEdge['KeyP'] || keyEdge['Escape'] || edge.enter()) state = 'play';
  } else if (state === 'dying') {
    deathT -= dt;
    updateWorld(dt);
    drawWorld(); drawHUD();
    ctx.fillStyle = `rgba(140,10,0,${0.45 * (1 - Math.max(deathT, 0) / 0.8)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (deathT <= 0) state = 'dead';
  } else if (state === 'dead') {
    updateWorld(dt);
    drawWorld(); drawHUD();
    drawOverlay('You Have Died', player.deathMsg, 'Press Enter to rise again');
    if (edge.enter()) respawn();
  } else if (state === 'timeup') {
    drawWorld(); drawHUD();
    drawOverlay('The Hour Has Passed', 'The princess is lost. The tower keeps its secrets.', 'Press Enter to try once more');
    if (edge.enter()) { resetLevel(); state = 'play'; }
  } else if (state === 'win') {
    winT += dt;
    updateWorld(dt);
    drawWorld(); drawHUD();
    const used = TIME_LIMIT - timeLeft;
    const m = Math.floor(used / 60), s = Math.floor(used % 60);
    const isBest = bestTime && Math.abs(used - bestTime) < 0.5;
    drawOverlay('Freedom!',
      `The prince escapes the lost tower in ${m}:${String(s).padStart(2, '0')}.` + (isBest ? ' A new best!' : ''),
      'Press Enter to play again');
    if (edge.enter() && winT > 1) { resetLevel(); state = 'title'; }
  }

  keyEdge = {};
  requestAnimationFrame(frame);
}

if (location.hash === '#sprites') {
  // debug: render the whole sprite sheet instead of the game
  ctx.fillStyle = '#1c1c22'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.imageSmoothingEnabled = false;
  const names = Object.keys(FRAMES);
  names.forEach((n, i) => {
    const x = 14 + i * 72;
    ctx.fillStyle = '#9a9a9a'; ctx.font = '10px monospace';
    ctx.fillText(n, x, 30);
    ctx.drawImage(SPRITES.prince[n], x, 40, FRAME_W * 4, FRAME_H * 4);
    ctx.drawImage(SPRITES.guard[n], x, 160, FRAME_W * 4, FRAME_H * 4);
  });
} else {
  requestAnimationFrame(frame);
}
