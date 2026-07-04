'use strict';
/* ============================================================
   PRINCE OF THE LOST TOWER — 3D
   The same dungeon escape, rendered as a real 3D scene (Three.js,
   vendored locally). The simulation — physics, level layout, combat,
   hazards — is unchanged from the 2D original; only the renderer is
   new. Simulation stays in "pixel" units (1 tile = 32) exactly as
   before so every tuned constant carries over untouched; a single
   toWorld() conversion maps pixel-space into Three.js world units
   (1 tile = 1 unit) at the point objects are positioned.
   ============================================================ */

// ---------- constants ----------
const TILE = 32;
const PXU = TILE; // pixels per world unit, for the toWorld() conversion
const VIEW_W = 960, VIEW_H = 540;
const GRAV = 2300;
const RUN_SPD = 235, WALK_SPD = 80;
const JUMP_V = -690;
const TIME_LIMIT = 60 * 60;

const glCanvas = document.getElementById('gl');
const hud = document.getElementById('hud');
const hctx = hud.getContext('2d');
const stage = document.getElementById('stage');

// ---------- input (identical to the 2D game) ----------
const keys = {};
let anyKeyPressed = false;
let keyEdge = {};
function pressKey(code){
  if (!keys[code]) keyEdge[code] = true;
  keys[code] = true;
  anyKeyPressed = true;
  initAudio();
}
function releaseKey(code){ keys[code] = false; }
addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  pressKey(e.code);
});
addEventListener('keyup', e => releaseKey(e.code));

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

// mute button lives in the top-right corner of the HUD at all times.
// Attached to #stage (not #hud) — the hud canvas is pointer-events:none
// so taps pass through to the game world; #stage sits underneath both
// canvases and actually receives pointer events. Registered before
// index.html's tap-to-start listener (also on #stage) so stopImmediatePropagation
// here correctly suppresses that listener when the mute button is hit.
stage.addEventListener('pointerdown', ev => {
  const rect = stage.getBoundingClientRect();
  const scaleX = VIEW_W / rect.width, scaleY = VIEW_H / rect.height;
  const mx = (ev.clientX - rect.left) * scaleX, my = (ev.clientY - rect.top) * scaleY;
  const dx = mx - (VIEW_W - 26), dy = my - 26;
  if (dx * dx + dy * dy <= 18 * 18) {
    ev.stopImmediatePropagation();
    ev.preventDefault();
    initAudio();
    toggleMute();
  }
});

// ---------- tiny synth sfx + ambience (identical to the 2D game) ----------
let AC = null;
let masterGain = null;
let ambienceStarted = false;
let muted = false;
try { muted = localStorage.getItem('pop_muted') === '1'; } catch (e) {}
function setMuted(m){
  muted = m;
  try { localStorage.setItem('pop_muted', m ? '1' : '0'); } catch (e) {}
  if (masterGain) masterGain.gain.value = m ? 0 : 1;
}
function toggleMute(){ setMuted(!muted); }
function initAudio(){
  if (!AC) {
    try {
      AC = new (window.AudioContext||window.webkitAudioContext)();
      masterGain = AC.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(AC.destination);
    } catch(e){}
  }
  startAmbience();
}
function startAmbience(){
  if (ambienceStarted || !AC) return;
  ambienceStarted = true;
  try {
    const droneGain = AC.createGain(); droneGain.gain.value = 0.05;
    droneGain.connect(masterGain);
    const o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
    const filt = AC.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 300;
    o1.connect(filt); o2.connect(filt); filt.connect(droneGain);
    o1.start(); o2.start();
    const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = AC.createGain(); lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
    lfo.start();
    const bufSize = AC.sampleRate * 2;
    const buf = AC.createBuffer(1, bufSize, AC.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = AC.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const noiseFilt = AC.createBiquadFilter(); noiseFilt.type = 'lowpass'; noiseFilt.frequency.value = 500;
    const noiseGain = AC.createGain(); noiseGain.gain.value = 0.018;
    noise.connect(noiseFilt); noiseFilt.connect(noiseGain); noiseGain.connect(masterGain);
    noise.start();
  } catch (e) {}
}
function sfx(kind){
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.connect(g); g.connect(masterGain);
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
    checkpoint: [ 'sine', 700, 1250, 0.3, 0.05 ],
    roar:   [ 'sawtooth', 180, 70, 0.4, 0.09 ],
  }[kind];
  if (!P) return;
  o.type = P[0];
  o.frequency.setValueAtTime(P[1], t);
  o.frequency.exponentialRampToValueAtTime(Math.max(P[2],1), t + P[3]);
  g.gain.setValueAtTime(P[4], t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
  o.start(t); o.stop(t + P[3] + 0.02);
}

// ---------- level layout (identical grid to the 2D game) ----------
const W = 96, H = 24;
let grid, gates, plates, chompers, looseTiles, potions, lever, door, sword,
    checkpoints, guard, player, particles, fallingTiles, torches, slashes;
let timeLeft, message, messageT, state, winT, deathT = 0, hitstop = 0;
let bestTime = null;
try { bestTime = +localStorage.getItem('pop3d_best_time') || null; } catch (e) {}
let tNow = 0;

function makeGrid(){
  const g = [];
  for (let y = 0; y < H; y++) g.push(new Array(W).fill(' '));
  const set = (x,y,c) => { if (x>=0&&x<W&&y>=0&&y<H) g[y][x] = c; };
  const rect = (x,y,w,h,c='#') => { for (let j=y;j<y+h;j++) for (let i=x;i<x+w;i++) set(i,j,c); };

  rect(0,0,W,1); rect(0,H-1,W,1); rect(0,0,1,H); rect(W-1,0,1,H);

  rect(1,7,13,1);
  rect(17,7,7,1);
  set(24,7,'L'); set(25,7,'L'); set(26,7,'L');
  rect(27,7,19,1);
  set(2,6,'S');
  set(30,6,'c');
  set(34,6,'p');
  set(36,6,'1');
  set(40,5,'A'); set(40,6,'A');
  rect(44,11,7,1);

  rect(1,15,79,1);
  rect(83,15,12,1);
  set(90,14,'P');
  set(4,14,'w');
  set(58,14,'^'); set(59,14,'^'); set(60,14,'^');
  set(64,14,'M');
  set(68,14,'g');
  set(72,14,'2');
  set(76,13,'B'); set(76,14,'B');
  rect(77,19,9,1);

  set(70,22,'c'); set(66,22,'c');
  set(60,22,'^'); set(58,22,'^'); set(56,22,'^'); set(54,22,'^');
  set(48,22,'M');
  set(44,22,'p');
  set(36,22,'V');
  set(28,21,'E'); set(28,22,'E');
  return g;
}

// ---------- collision (identical logic to the 2D game) ----------
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
function spawnLandingDust(x, y, intensity){
  const n = 5 + Math.floor(intensity * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n - 0.5) * Math.PI * 0.9;
    particles.push({
      x, y,
      vx: Math.sin(a) * (60 + Math.random() * 40) * intensity,
      vy: -Math.abs(Math.cos(a)) * (30 + Math.random() * 30) * intensity - 10,
      life: 0.4, maxLife: 0.4, r: 2 + Math.random() * 1.8, c: 0xa08d70
    });
  }
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
  for (const id in gates) { gates[id].holdT = 0; }
  state = 'play';
}

function updatePlayer(dt){
  const p = player;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.attackT > 0) p.attackT -= dt;

  if (p.climbT > 0) {
    p.climbT -= dt;
    const t = 1 - Math.max(p.climbT, 0) / 0.45;
    p.x = p.climbFrom.x + (p.climbTo.x - p.climbFrom.x) * t;
    p.y = p.climbFrom.y + (p.climbTo.y - p.climbFrom.y) * t * t;
    if (p.climbT <= 0) { p.vx = 0; p.vy = 0; p.onGround = true; p.peakY = p.y; }
    return;
  }

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

  let dx = 0;
  if (held.left()) dx -= 1;
  if (held.right()) dx += 1;
  const speed = held.walk() ? WALK_SPD : RUN_SPD;
  const target = dx * speed;
  const accel = p.onGround ? 2600 : 1400;
  if (p.vx < target) p.vx = Math.min(p.vx + accel * dt, target);
  else if (p.vx > target) p.vx = Math.max(p.vx - accel * dt, target);
  if (dx !== 0) p.dir = dx;

  if (p.onGround) p.coyote = 0.1; else p.coyote -= dt;
  if (edge.up()) p.jumpBuf = 0.13; else p.jumpBuf -= dt;
  if (p.jumpBuf > 0 && p.coyote > 0 && p.attackT <= 0) {
    p.vy = JUMP_V;
    p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
    sfx('jump');
  }
  if (!held.up() && p.vy < -280) p.vy = -280;

  if (edge.attack() && p.hasSword && p.onGround && p.attackT <= 0) {
    p.attackT = 0.38;
    sfx('sword');
    slashes.push({ x: p.x + p.w / 2 + p.dir * 15, y: p.y + p.h - 30, dir: p.dir, t: 0.18 });
    if (guard && !guard.dead) {
      const gx = guard.x + guard.w / 2, px = p.x + p.w / 2;
      const sameFloor = Math.abs((guard.y + guard.h) - (p.y + p.h)) < 20;
      if (sameFloor && Math.abs(gx - px) < TILE * 1.5 && Math.sign(gx - px) === p.dir) {
        const guardBlocks = guard.telegraphT <= 0 && guard.strikeT <= 0 &&
                            Math.sin(tNow * 9.7 + guard.homeX) > 0.25;
        if (guardBlocks) {
          guard.blockT = 0.3;
          hitstop = Math.max(hitstop, 0.06);
          sfx('clang');
          p.x -= p.dir * 6;
        } else {
          guard.hp -= 1; guard.hurtT = 0.4; guard.telegraphT = 0; guard.strikeT = 0;
          guard.x += p.dir * 10;
          hitstop = Math.max(hitstop, 0.09);
          sfx('clang'); shake = Math.max(shake, 3);
          if (guard.hp <= 0) {
            guard.dead = true;
            showMessage('The guard is defeated.');
          } else if (guard.hp === 1 && !guard.enraged) {
            guard.enraged = true;
            guard.thinkT = 0.3;
            sfx('roar');
            showMessage('The guard fights with new fury!', 2.5);
            shake = Math.max(shake, 5);
          }
        }
      }
    }
  }

  if (!p.onGround) p.peakY = Math.min(p.peakY, p.y);

  const wasAirborne = !p.onGround;
  moveEnt(p, dt);

  if (p.onGround) {
    if (wasAirborne) {
      const fallTiles = (p.y - p.peakY) / TILE;
      if (fallTiles >= 13) killPlayer('A fall from that height is certain death.');
      else if (fallTiles >= 5.5) { hurtPlayer(1, 'The fall broke the prince.'); sfx('land'); }
      else if (fallTiles > 1.5) sfx('land');
      if (fallTiles > 0.9) spawnLandingDust(p.x + p.w / 2, p.y + p.h - 2, Math.min(fallTiles / 3, 1.6));
    }
    p.peakY = p.y;
    for (const ft of feetTiles(p)) {
      const key = ft.x + ',' + ft.y;
      const lt = looseTiles[key];
      if (lt && lt.state === 'idle') { lt.state = 'shaking'; lt.t = 0.38; sfx('crumble'); }
    }
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

  if (p.onGround && Math.abs(p.vx) > 20) p.runPhase += dt * Math.abs(p.vx) / 26;

  if (p.onGround && Math.abs(p.vx) > RUN_SPD * 0.55) {
    p.dustT = (p.dustT || 0) - dt;
    if (p.dustT <= 0) {
      p.dustT = 0.085;
      particles.push({
        x: p.x + p.w / 2 - Math.sign(p.vx) * 8, y: p.y + p.h - 3,
        vx: -Math.sign(p.vx) * 30 + (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
        life: 0.3, maxLife: 0.3, r: 1.6 + Math.random() * 1.2, c: 0x968b6e
      });
    }
  } else { p.dustT = 0; }

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
  for (const cp of checkpoints) {
    if (Math.abs(cp.x - ptx) <= 0 && Math.abs(cp.y - pty) <= 1 && (p.checkpoint.x !== cp.x || p.checkpoint.y !== cp.y)) {
      p.checkpoint = { x: cp.x, y: cp.y };
      showMessage('The way is remembered. (checkpoint)', 2.5);
      if (!cp.reached) {
        cp.reached = true;
        sfx('checkpoint');
        const bx = cp.x * TILE + TILE / 2, by = (cp.y + 1) * TILE - 10;
        for (let d = 0; d < 10; d++) particles.push({
          x: bx, y: by, vx: (Math.random() - 0.5) * 90, vy: -80 - Math.random() * 60, life: 0.7, maxLife: 0.7, r: 2.2, c: 0xffdb8a
        });
      }
    }
  }
  if (door.open && door.anim > 0.9) {
    for (const c of door.cells) {
      if (ptx === c.x && Math.abs(pty - c.y) <= 1 && state === 'play') {
        state = 'win'; winT = 0; sfx('win');
        const used = TIME_LIMIT - timeLeft;
        if (!bestTime || used < bestTime) {
          bestTime = used;
          try { localStorage.setItem('pop3d_best_time', String(bestTime)); } catch (e) {}
        }
      }
    }
  }

  for (const ft of feetTiles(p)) {
    const cAbove = charAt(ft.x, ft.y - 1);
    if (cAbove === '^') {
      const fastFall = p.vy > 260 || (p.peakY < p.y - TILE * 1.2 && !p.onGround);
      const running = Math.abs(p.vx) > WALK_SPD + 25;
      if (fastFall || running) killPlayer('Impaled upon the spikes.');
    }
  }
  if (charAt(ptx, Math.floor((p.y + p.h - 6) / TILE)) === '^') {
    if (Math.abs(p.vx) > WALK_SPD + 25 || p.vy > 260) killPlayer('Impaled upon the spikes.');
  }
  for (const ch of chompers) {
    if (chomperClosed(ch)) {
      const cx0 = ch.x * TILE, cx1 = cx0 + TILE;
      if (p.x + p.w > cx0 + 6 && p.x < cx1 - 6 && Math.abs((p.y + p.h) - (ch.y + 1) * TILE) < TILE * 1.6) {
        killPlayer('The slicer claims another victim.');
        shake = 10;
      }
    }
  }
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
      g.vx = g.dir * (g.enraged ? 145 : 95);
      g.telegraphT = 0;
    } else {
      if (g.strikeT > 0) {
        g.strikeT -= dt;
      } else if (g.telegraphT > 0) {
        g.telegraphT -= dt;
        if (g.telegraphT <= 0) {
          slashes.push({ x: g.x + g.w / 2 + g.dir * 15, y: g.y + g.h - 30, dir: g.dir, t: 0.18 });
          if (dist < TILE * 1.7 && sameFloor) {
            if (held.block() && p.onGround) {
              sfx('clang'); showMessage('Parried!', 1); shake = Math.max(shake, 2);
              hitstop = Math.max(hitstop, 0.08);
              g.thinkT += 0.4;
            } else {
              hurtPlayer(1, 'Cut down by the guard.');
              p.vx = g.dir * 190; p.vy = Math.min(p.vy, -110);
            }
          }
          g.strikeT = g.enraged ? 0.22 : 0.35;
          g.thinkT = (g.enraged ? 0.4 : 0.9) + (Math.abs(Math.sin(g.x * 12.9)) * (g.enraged ? 0.4 : 0.9));
        }
      } else {
        g.thinkT -= dt;
        if (g.thinkT <= 0) g.telegraphT = g.enraged ? 0.22 : 0.4;
      }
    }
  } else {
    g.telegraphT = 0; g.thinkT = Math.max(g.thinkT, 0.8);
    const drift = g.homeX - g.x;
    if (Math.abs(drift) > 8) g.vx = Math.sign(drift) * 40;
  }
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
function chomperPhase(ch){ return (tNow * 0.55 + ch.offset) % 1; }
function chomperClosed(ch){ const ph = chomperPhase(ch); return ph > 0.42 && ph < 0.62; }

function showMessage(txt, secs = 3.5){ message = txt; messageT = secs; }
let shake = 0;

function updateWorld(dt){
  tNow += dt;
  for (const id in gates) {
    const gt = gates[id];
    if (gt.holdT > 0) { gt.holdT -= dt; gt.open = Math.min(1, gt.open + dt * 1.6); }
    else gt.open = Math.max(0, gt.open - dt * 0.7);
  }
  for (const pl of plates) if (pl.pressed > 0) pl.pressed -= dt;
  if (door.open) door.anim = Math.min(1, door.anim + dt * 0.8);
  if (lever && lever.anim > 0) lever.anim = Math.max(0, lever.anim - dt * 2);
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
  for (let i = fallingTiles.length - 1; i >= 0; i--) {
    const f = fallingTiles[i];
    f.vy += GRAV * 0.7 * dt;
    f.y += f.vy * dt;
    const ty = Math.floor((f.y + TILE) / TILE), tx = Math.floor((f.x + TILE / 2) / TILE);
    if (solid(tx, ty)) {
      for (let d = 0; d < 8; d++) particles.push({
        x: f.x + TILE / 2, y: ty * TILE, vx: (d - 4) * 40, vy: -120 - (d % 3) * 60, life: 0.6, maxLife: 0.6, r: 2.4, c: 0x6a5a44
      });
      shake = Math.max(shake, 4); sfx('land');
      fallingTiles.splice(i, 1);
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    pt.vy += GRAV * 0.5 * dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    if (pt.life <= 0) particles.splice(i, 1);
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    slashes[i].t -= dt;
    if (slashes[i].t <= 0) slashes.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 18);
  if (messageT > 0) { messageT -= dt; if (messageT <= 0) message = ''; }
}

// ---------- coordinate conversion: pixel-space sim -> Three.js world units ----------
function wx(px){ return px / PXU; }
function wy(py){ return -py / PXU; }
const WALL_Z = -1.3, FLOOR_FRONT_Z = 0.5, ACTOR_Z = 0;

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040a);
scene.fog = new THREE.Fog(0x05040a, 8, 26);
const camera = new THREE.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 60);

const hemi = new THREE.HemisphereLight(0x3a4a70, 0x1a1208, 2.4);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x40485c, 1.4);
scene.add(ambient);
const playerLight = new THREE.PointLight(0xffcf9a, 18, 6, 2);
scene.add(playerLight);

function resizeRenderer(){
  const rect = stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dpr = renderer.getPixelRatio();
  hud.width = VIEW_W; hud.height = VIEW_H;
  hud.style.width = '100%'; hud.style.height = '100%';
}
addEventListener('resize', resizeRenderer);

// ---------- materials (shared) ----------
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0x3c3122, roughness: 0.95 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x4a3c2a, roughness: 0.9 }),
  loose: new THREE.MeshStandardMaterial({ color: 0x6a5638, roughness: 0.9 }),
  gate: new THREE.MeshStandardMaterial({ color: 0x7d7060, roughness: 0.6, metalness: 0.3 }),
  door: new THREE.MeshStandardMaterial({ color: 0x3d3225, roughness: 0.7 }),
  spike: new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.4, metalness: 0.2 }),
  chomper: new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.4 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  window: new THREE.MeshBasicMaterial({ color: 0x8ea6d8, transparent: true, opacity: 0.55 }),
  potionSmall: new THREE.MeshStandardMaterial({ color: 0xc03a30, roughness: 0.3 }),
  potionBig: new THREE.MeshStandardMaterial({ color: 0x4a72d0, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.2 }),
  bladeMetal: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.25, metalness: 0.6 }),
  hilt: new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.6 }),
  lever: new THREE.MeshStandardMaterial({ color: 0x54473a, roughness: 0.7 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x8f8474, roughness: 0.8 }),
  sigilDim: new THREE.MeshStandardMaterial({ color: 0x6e82a0, roughness: 0.5, emissive: 0x141a26, emissiveIntensity: 0.4 }),
  sigilLit: new THREE.MeshStandardMaterial({ color: 0xffdd8c, roughness: 0.4, emissive: 0xc79a3c, emissiveIntensity: 0.9 }),
};

// ---------- baked brick texture, generated the same way the 2D game drew it ----------
function makeBrickTexture(){
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const hash2 = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const cell = 32;
  for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
    const h = hash2(tx * 3, ty * 7);
    g.fillStyle = h > 0.66 ? '#4e4030' : (h > 0.33 ? '#483a2b' : '#443626');
    g.fillRect(tx * cell, ty * cell, cell, cell);
    g.strokeStyle = 'rgba(20,12,6,0.55)'; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(tx * cell, ty * cell + cell / 2); g.lineTo(tx * cell + cell, ty * cell + cell / 2);
    const off = (ty % 2 === 0) ? cell / 2 : 0;
    g.moveTo(tx * cell + off, ty * cell); g.lineTo(tx * cell + off, ty * cell + cell / 2);
    g.stroke();
    if (h > 0.88) {
      g.strokeStyle = 'rgba(15,8,4,0.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(tx * cell + 8, ty * cell + 4); g.lineTo(tx * cell + 14, ty * cell + 14); g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const brickTex = makeBrickTexture();
MAT.wall.map = brickTex.clone(); MAT.wall.map.needsUpdate = true;
MAT.floor.map = brickTex;

let levelGroup = null;
const dynamic = { loose: {}, chompers: [], spikes: [], torches: [], gates: {}, door: null, potions: [], sword: null,
                   lever: null, plates: [], checkpoints: [], fallingTiles: [] };

function clearGroup(g){ while (g.children.length) { const c = g.children.pop(); g.remove(c); } }

function boxAt(px0, py0, px1, py1, mat, zFront, zBack){
  const w = wx(px1) - wx(px0), h = wy(py0) - wy(py1);
  const depth = zFront - zBack;
  const geo = new THREE.BoxGeometry(w, h, depth);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(wx(px0) + w / 2, wy(py1) + h / 2, zBack + depth / 2);
  return mesh;
}

function buildLevel3D(){
  if (levelGroup) scene.remove(levelGroup);
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  dynamic.chompers = []; dynamic.spikes = []; dynamic.torches = [];
  dynamic.potions = []; dynamic.checkpoints = []; dynamic.plates = [];

  // merge contiguous solid '#' tiles per row into single boxes (the level is
  // mostly long straight runs, so this keeps the mesh count tiny)
  for (let ty = 0; ty < H; ty++) {
    let runStart = -1;
    for (let tx = 0; tx <= W; tx++) {
      const isSolid = tx < W && charAt(tx, ty) === '#';
      if (isSolid && runStart < 0) runStart = tx;
      else if (!isSolid && runStart >= 0) {
        const mesh = boxAt(runStart * TILE, ty * TILE, tx * TILE, (ty + 1) * TILE, MAT.wall, FLOOR_FRONT_Z, WALL_Z);
        mesh.material = MAT.wall;
        levelGroup.add(mesh);
        runStart = -1;
      }
    }
  }
  // loose tiles get their own individual boxes (they shake and fall independently)
  dynamic.loose = {};
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (charAt(tx, ty) !== 'L') continue;
    const mesh = boxAt(tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE, MAT.loose, FLOOR_FRONT_Z, WALL_Z);
    levelGroup.add(mesh);
    dynamic.loose[tx + ',' + ty] = mesh;
  }

  // back wall behind everything, one big plane per floor band, for depth + brick texture fill
  for (const bandY of [0, 8, 16]) {
    const geo = new THREE.PlaneGeometry(W, 8.4);
    const tex = brickTex.clone(); tex.needsUpdate = true;
    tex.repeat.set(W / 2, 8.4 / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x2a2115, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(W / 2, wy(bandY * TILE) - 4.2, WALL_Z - 0.35);
    levelGroup.add(mesh);
  }
  // moonlit windows — unlit emissive-look planes only; no real light source (light-count budget
  // is reserved for torches, which matter far more for mood and gameplay readability)
  for (const bandTop of [1, 8, 16]) for (const wxTile of [20, 46, 72]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2), MAT.window);
    mesh.position.set(wxTile + 0.8, wy((bandTop + 2) * TILE) + 1, WALL_Z - 0.3);
    levelGroup.add(mesh);
  }

  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const c = charAt(tx, ty);
    if (c === '^') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 5), MAT.spike);
      cone.position.set(tx * TILE / PXU + 0.5, wy((ty + 1) * TILE) + 0.25, ACTOR_Z);
      levelGroup.add(cone);
      dynamic.spikes.push(cone);
    }
  }

  for (const fy of [7, 15, 23]) {
    for (let x = 4; x < W - 2; x += 9) {
      if (grid[fy] && grid[fy][x] === '#' && grid[fy-1][x] === ' ' && grid[fy-2][x] === ' ') {
        const group = new THREE.Group();
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 6), MAT.flame);
        flame.position.y = 0.32;
        group.add(mount, flame);
        group.position.set(x + 0.5, wy((fy - 2) * TILE) - 0.3, WALL_Z + 0.15);
        levelGroup.add(group);
        const light = new THREE.PointLight(0xffb04a, 16, 7, 2);
        light.position.copy(group.position);
        light.position.z += 0.4;
        levelGroup.add(light);
        dynamic.torches.push({ group, flame, light, seed: x });
      }
    }
  }

  for (const ch of chompers) {
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x3c3226 }));
    const jawTop = new THREE.Group(), jawBot = new THREE.Group();
    const toothTop = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 4), MAT.chomper);
    toothTop.rotation.x = Math.PI; toothTop.position.y = -0.8;
    const toothBot = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 4), MAT.chomper);
    toothBot.position.y = 0.8;
    jawTop.add(toothTop); jawBot.add(toothBot);
    frame.position.y = 1.9;
    group.add(frame, jawTop, jawBot);
    jawTop.position.set(0, 1.9, 0); jawBot.position.set(0, 0, 0);
    group.position.set(ch.x + 0.5, wy((ch.y + 1) * TILE), ACTOR_Z);
    levelGroup.add(group);
    dynamic.chompers.push({ ch, group, jawTop, jawBot });
  }

  for (const pot of potions) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(pot.big ? 0.26 : 0.2, 8, 6), pot.big ? MAT.potionBig : MAT.potionSmall);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6), MAT.glass);
    neck.position.y = pot.big ? 0.32 : 0.26;
    group.add(body, neck);
    group.position.set(pot.x + 0.5, wy((pot.y + 1) * TILE) + (pot.big ? 0.35 : 0.28), ACTOR_Z);
    levelGroup.add(group);
    dynamic.potions.push({ pot, group });
  }

  if (sword) {
    const group = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.03), MAT.bladeMetal);
    const guardBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.06), MAT.hilt);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), MAT.hilt);
    blade.position.y = 0.45; guardBar.position.y = 0.08; grip.position.y = -0.12;
    group.add(blade, guardBar, grip);
    group.rotation.z = 0.5;
    group.position.set(sword.x + 0.5, wy((sword.y + 1) * TILE) - 0.15, ACTOR_Z);
    levelGroup.add(group);
    dynamic.sword = group;
    const light = new THREE.PointLight(0xc8dcff, 6, 3, 2);
    light.position.copy(group.position); light.position.y += 0.3;
    levelGroup.add(light);
    dynamic.sword.light = light;
  }

  if (lever) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), MAT.lever);
    const handleGroup = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), MAT.lever);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshStandardMaterial({ color: 0xc03a30 }));
    handle.position.y = 0.3; knob.position.y = 0.6;
    handleGroup.add(handle, knob);
    group.add(base, handleGroup);
    group.position.set(lever.x + 0.5, wy((lever.y + 1) * TILE), ACTOR_Z);
    levelGroup.add(group);
    dynamic.lever = { group, handleGroup };
  }

  for (const pl of plates) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.5), MAT.plate);
    mesh.position.set(pl.x + 0.5, wy((pl.y + 1) * TILE) + 0.06, ACTOR_Z);
    levelGroup.add(mesh);
    dynamic.plates.push({ pl, mesh });
  }

  for (const id in gates) {
    const gt = gates[id];
    const top = gt.cells.reduce((a, b) => a.y < b.y ? a : b);
    const hgt = gt.cells.length;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, hgt, 0.5), MAT.gate);
    mesh.position.set(top.x + 0.5, wy(top.y * TILE) - hgt / 2, ACTOR_Z);
    levelGroup.add(mesh);
    dynamic.gates[id] = { gt, mesh, baseY: wy(top.y * TILE) - hgt / 2, hgt };
  }

  if (door.cells.length) {
    const dc = door.cells.reduce((a, b) => a.y < b.y ? a : b);
    const hgt = door.cells.length;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, hgt + 0.3, 0.55), new THREE.MeshStandardMaterial({ color: 0x5c4a30 }));
    frame.position.set(dc.x + 0.5, wy(dc.y * TILE) - hgt / 2 + 0.15, ACTOR_Z - 0.05);
    levelGroup.add(frame);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, hgt, 0.4), MAT.door);
    const baseY = wy(dc.y * TILE) - hgt / 2;
    mesh.position.set(dc.x + 0.5, baseY, ACTOR_Z);
    levelGroup.add(mesh);
    dynamic.door = { mesh, baseY, hgt };
  }

  for (const cp of checkpoints) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), MAT.sigilDim);
    mesh.position.set(cp.x + 0.5, wy((cp.y + 1) * TILE) + 0.5, ACTOR_Z);
    levelGroup.add(mesh);
    dynamic.checkpoints.push({ cp, mesh });
  }
}

// ---------- character rigs: simple blocky low-poly humanoids, procedurally posed ----------
function buildRig(isGuard){
  const palette = isGuard
    ? { skin: 0xc08a58, cloth: 0x8a2a22, trim: 0xcaa84a, dark: 0x241a14, helmet: 0x4a4a58 }
    : { skin: 0xd8a878, cloth: 0xe8e0d0, trim: 0x8a5a28, dark: 0x3a2a18, helmet: null };
  const matSkin = new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.8 });
  const matCloth = new THREE.MeshStandardMaterial({ color: palette.cloth, roughness: 0.85 });
  const matDark = new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.7 });

  const root = new THREE.Group();
  const legLen = 0.56, armLen = 0.42, torsoLen = 0.46;
  const hipY = legLen;

  const hips = new THREE.Group();
  hips.position.y = hipY;
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, torsoLen, 0.2), matCloth);
  torso.position.y = torsoLen / 2;
  hips.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), matSkin);
  head.position.y = torsoLen + 0.13;
  hips.add(head);

  if (isGuard) {
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.25),
      new THREE.MeshStandardMaterial({ color: palette.helmet, roughness: 0.5, metalness: 0.4 }));
    helmet.position.y = torsoLen + 0.26;
    hips.add(helmet);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), matCloth);
    plume.position.set(0, torsoLen + 0.42, -0.06);
    hips.add(plume);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.09, 0.23), matDark);
    hair.position.y = torsoLen + 0.24;
    hips.add(hair);
  }

  function makeLimb(len, mat, z, thick){
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    pivot.position.z = z;
    return pivot;
  }

  const legL = makeLimb(legLen, matCloth, 0.08, 0.13); hips.add(legL);
  const legR = makeLimb(legLen, matCloth, -0.08, 0.13); hips.add(legR);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.18), matDark);
  bootL.position.y = -legLen + 0.045; legL.add(bootL);
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.18), matDark);
  bootR.position.y = -legLen + 0.045; legR.add(bootR);

  const armL = makeLimb(armLen, matCloth, 0.14, 0.1); armL.position.y = torsoLen; hips.add(armL);
  const armR = makeLimb(armLen, matCloth, -0.14, 0.1); armR.position.y = torsoLen; hips.add(armR);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), matSkin);
  handL.position.y = -armLen; armL.add(handL);
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.1), matSkin);
  handR.position.y = -armLen; armR.add(handR);

  const swordGroup = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), MAT.bladeMetal);
  blade.position.y = 0.3;
  const guardBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), MAT.hilt);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), MAT.hilt);
  grip.position.y = -0.08;
  swordGroup.add(blade, guardBar, grip);
  swordGroup.position.y = -armLen;
  swordGroup.rotation.z = -0.3;
  armR.add(swordGroup);

  let capeGroup = null;
  let enrageLight = null;
  if (isGuard) {
    capeGroup = new THREE.Group();
    capeGroup.position.set(0, torsoLen - 0.02, 0.12);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x4a1712, roughness: 0.9 }));
    cape.position.y = -0.25;
    capeGroup.add(cape);
    hips.add(capeGroup);
    enrageLight = new THREE.PointLight(0xdd2818, 0, 3.5, 2);
    enrageLight.position.y = torsoLen;
    root.add(enrageLight);
  }

  root.userData = { hips, torso, head, legL, legR, armL, armR, swordGroup,
                     capeGroup, enrageLight, isGuard, legLen, armLen, torsoLen };
  return root;
}

function poseRig(rig, f, isGuard){
  const d = rig.userData;
  const dir = f.dir || 1;
  rig.scale.x = dir;
  rig.position.set(wx(f.x + f.w / 2), wy(f.y + f.h), ACTOR_Z);

  const dead = f.dead;
  const attacking = (f.attackT || 0) > 0 || (f.telegraphT || 0) > 0 || (f.strikeT || 0) > 0;
  const blocking = (f.blockT || 0) > 0 || (!isGuard && held.block() && f.hasSword && f.onGround);
  const hanging = !!f.hang;
  const climbing = (f.climbT || 0) > 0;

  d.swordGroup.visible = (isGuard || f.hasSword) && !dead && !hanging;
  if (d.enrageLight) d.enrageLight.intensity = (f.enraged && !dead) ? (6 + Math.sin(tNow * 7) * 3) : 0;

  if (dead) {
    rig.rotation.z = 1.5;
    d.legL.rotation.x = 0; d.legR.rotation.x = 0;
    d.armL.rotation.x = 0.3; d.armR.rotation.x = 0.3;
    return;
  }
  rig.rotation.z = 0;

  if (hanging) {
    d.armL.rotation.x = -2.6; d.armR.rotation.x = -2.6;
    d.legL.rotation.x = 0.3; d.legR.rotation.x = -0.2;
  } else if (climbing) {
    d.armL.rotation.x = -2.2; d.armR.rotation.x = -1.6;
    d.legL.rotation.x = -1.2; d.legR.rotation.x = 0.6;
  } else if (attacking) {
    const raised = (f.attackT || 0) > 0.2 || (f.telegraphT || 0) > 0;
    d.armR.rotation.x = raised ? -2.3 : -1.1;
    d.armL.rotation.x = -0.3;
    d.legL.rotation.x = 0.15; d.legR.rotation.x = -0.15;
  } else if (blocking) {
    d.armR.rotation.x = -1.7;
    d.armL.rotation.x = -0.9;
    d.legL.rotation.x = 0; d.legR.rotation.x = 0;
  } else if (!f.onGround) {
    d.armL.rotation.x = -0.6; d.armR.rotation.x = -0.5;
    d.legL.rotation.x = f.vy < 0 ? -0.5 : 0.4;
    d.legR.rotation.x = f.vy < 0 ? 0.4 : -0.3;
  } else if (Math.abs(f.vx) > 20) {
    const ph = f.runPhase || 0;
    d.legL.rotation.x = Math.sin(ph) * 0.9;
    d.legR.rotation.x = Math.sin(ph + Math.PI) * 0.9;
    d.armL.rotation.x = Math.sin(ph + Math.PI) * 0.6;
    d.armR.rotation.x = (f.hasSword || isGuard) ? -0.3 : Math.sin(ph) * 0.6;
  } else {
    const bob = Math.sin(tNow * 2.2) * 0.02;
    d.hips.position.y = d.legLen + bob;
    d.legL.rotation.x = 0; d.legR.rotation.x = 0;
    d.armL.rotation.x = 0.05; d.armR.rotation.x = (f.hasSword || isGuard) ? -0.2 : 0.05;
  }
  if (d.capeGroup) {
    const sway = Math.sin(tNow * 2.6 + (f.homeX || 0) * 0.05) * 0.25 - (f.vx || 0) * 0.0015;
    d.capeGroup.rotation.x = 0.15 + sway;
  }
}

const princeRig = buildRig(false);
const guardRig = buildRig(true);
scene.add(princeRig, guardRig);

// ---------- level (re)initialization ----------
function resetLevel(){
  grid = makeGrid();
  gates = {}; plates = []; chompers = []; looseTiles = {}; potions = [];
  lever = null; door = { cells: [], open: false, anim: 0 };
  sword = null; checkpoints = []; particles = []; fallingTiles = []; torches = []; slashes = [];
  let start = { x: 2, y: 6 };
  let guardPos = null;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    if (c === 'S') { start = { x, y }; grid[y][x] = ' '; }
    else if (c === 'M') { checkpoints.push({ x, y, reached: false }); grid[y][x] = ' '; }
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

  player = {
    x: start.x * TILE + 6, y: (start.y + 1) * TILE - 46,
    w: 20, h: 45, vx: 0, vy: 0, dir: 1,
    onGround: false, hp: 3, maxHp: 3,
    hasSword: false, attackT: 0, hurtT: 0, dead: false, deathMsg: '',
    hang: null, climbT: 0, climbFrom: null, climbTo: null,
    peakY: 0, runPhase: 0, coyote: 0, jumpBuf: 0, dustT: 0,
    checkpoint: { x: start.x, y: start.y },
  };
  player.peakY = player.y;

  guard = guardPos ? {
    x: guardPos.x * TILE + 4, y: (guardPos.y + 1) * TILE - 46,
    w: 22, h: 45, vx: 0, vy: 0, dir: -1,
    onGround: false, hp: 3, dead: false, blockT: 0, enraged: false,
    homeX: guardPos.x * TILE, thinkT: 1.2, telegraphT: 0, strikeT: 0, hurtT: 0,
  } : null;

  timeLeft = TIME_LIMIT;
  message = ''; messageT = 0;
  buildLevel3D();
  guardRig.visible = !!guard;
  camWX = wx(player.x + player.w / 2); camWY = wy(player.y + player.h / 2); playerLook = 0;
}

// ---------- pooled dynamic effects (particles, falling debris, sword slashes) ----------
const poolMaps = { particles: new Map(), falling: new Map(), slashes: new Map() };
function syncPool(list, map, createFn, updateFn){
  const alive = new Set(list);
  for (const obj of list) {
    let mesh = map.get(obj);
    if (!mesh) { mesh = createFn(obj); map.set(obj, mesh); levelGroup.add(mesh); }
    updateFn(mesh, obj);
  }
  for (const [obj, mesh] of map) {
    if (!alive.has(obj)) { levelGroup.remove(mesh); map.delete(obj); }
  }
}
function createParticleMesh(pt){
  return new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ color: pt.c || 0xffffff, transparent: true }));
}
function updateParticleMesh(mesh, pt){
  mesh.position.set(wx(pt.x), wy(pt.y), ACTOR_Z);
  mesh.scale.setScalar((pt.r || 2.2) / PXU);
  mesh.material.opacity = Math.max(pt.life / (pt.maxLife || 0.6), 0);
}
function createFallingMesh(){
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, FLOOR_FRONT_Z - WALL_Z), MAT.loose);
}
function updateFallingMesh(mesh, f){
  mesh.position.set(wx(f.x) + 0.5, wy(f.y) - 0.5, (FLOOR_FRONT_Z + WALL_Z) / 2);
}
function createSlashMesh(){
  return new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 16, 1, -1.0, 2.0),
    new THREE.MeshBasicMaterial({ color: 0xe8ecff, transparent: true, side: THREE.DoubleSide }));
}
function updateSlashMesh(mesh, s){
  mesh.position.set(wx(s.x), wy(s.y), ACTOR_Z + 0.1);
  mesh.rotation.y = s.dir > 0 ? 0 : Math.PI;
  mesh.material.opacity = Math.max(s.t / 0.18, 0) * 0.85;
}

// ---------- per-frame dynamic object sync ----------
function syncDynamics(){
  // only the torches nearest the camera cast real light — with ~20 torches in the
  // level, lighting every fragment against all of them at once tanks framerate for
  // no visible benefit (far torches are indistinguishable from unlit at that range)
  const MAX_ACTIVE_TORCH_LIGHTS = 4;
  const byDist = dynamic.torches
    .map(t => ({ t, d: (t.light.position.x - camWX) ** 2 + (t.light.position.y - camWY) ** 2 }))
    .sort((a, b) => a.d - b.d);
  byDist.forEach(({ t }, i) => {
    const fl = Math.sin(tNow * 8.5 + t.seed) * 2.5;
    t.light.intensity = (i < MAX_ACTIVE_TORCH_LIGHTS) ? (16 + fl) : 0;
    t.flame.scale.y = 1 + fl * 0.06;
  });
  for (const dc of dynamic.chompers) {
    const ph = chomperPhase(dc.ch);
    let ext = 0;
    if (ph > 0.34 && ph <= 0.45) ext = (ph - 0.34) / 0.11;
    else if (ph > 0.45 && ph < 0.6) ext = 1;
    else if (ph >= 0.6 && ph < 0.72) ext = 1 - (ph - 0.6) / 0.12;
    dc.jawTop.position.y = 1.9 - ext * 0.9;
    dc.jawBot.position.y = ext * 0.9;
  }
  for (const key in dynamic.loose) {
    const lt = looseTiles[key];
    const mesh = dynamic.loose[key];
    if (!lt || lt.state === 'gone') { levelGroup.remove(mesh); delete dynamic.loose[key]; continue; }
    if (lt.state === 'shaking') {
      mesh.position.x = lt.x + 0.5 + (Math.random() - 0.5) * 0.05;
    }
  }
  for (const id in dynamic.gates) {
    const g = dynamic.gates[id];
    g.mesh.position.y = g.baseY + g.gt.open * g.hgt;
  }
  if (dynamic.door) dynamic.door.mesh.position.y = dynamic.door.baseY + door.anim * dynamic.door.hgt;
  for (const dp of dynamic.potions) {
    dp.group.visible = !dp.pot.taken;
    if (!dp.pot.taken) dp.group.position.y = wy((dp.pot.y + 1) * TILE) + (dp.pot.big ? 0.35 : 0.28) + Math.sin(tNow * 3 + dp.pot.x) * 0.03;
  }
  if (dynamic.sword) {
    dynamic.sword.visible = !sword.taken;
    if (dynamic.sword.light) dynamic.sword.light.intensity = sword.taken ? 0 : (5 + Math.sin(tNow * 4) * 2);
  }
  if (dynamic.lever) dynamic.lever.handleGroup.rotation.z = lever.pulled ? -0.7 : 0.7;
  for (const dpl of dynamic.plates) {
    dpl.mesh.position.y = wy((dpl.pl.y + 1) * TILE) + (dpl.pl.pressed > 0 ? 0.03 : 0.06);
  }
  for (const dcp of dynamic.checkpoints) {
    dcp.mesh.material = dcp.cp.reached ? MAT.sigilLit : MAT.sigilDim;
    dcp.mesh.rotation.y += 0.02;
    dcp.mesh.position.y = wy((dcp.cp.y + 1) * TILE) + 0.5 + Math.sin(tNow * 2 + dcp.cp.x) * 0.05;
  }

  syncPool(particles, poolMaps.particles, createParticleMesh, updateParticleMesh);
  syncPool(fallingTiles, poolMaps.falling, createFallingMesh, updateFallingMesh);
  syncPool(slashes, poolMaps.slashes, createSlashMesh, updateSlashMesh);

  poseRig(princeRig, player, false);
  playerLight.position.set(wx(player.x + player.w / 2), wy(player.y + player.h / 2), ACTOR_Z + 0.6);
  playerLight.intensity = 18 + Math.sin(tNow * 5) * 1.5;
  if (guard) poseRig(guardRig, guard, true);
}

// ---------- camera ----------
let camWX = 0, camWY = 0, playerLook = 0;
function updateCamera(dt){
  if (state === 'play') {
    const lookTarg = (Math.abs(player.vx) > 60 && player.onGround) ? player.dir * 2.2 : playerLook * 0.9;
    playerLook += (lookTarg - playerLook) * Math.min(dt * 2.5, 1);
    const targX = wx(player.x + player.w / 2) + playerLook;
    const targY = wy(player.y + player.h / 2);
    camWX += (targX - camWX) * Math.min(dt * 8, 1);
    camWY += (targY - camWY) * Math.min(dt * 6, 1);
  }
  const shakeX = (Math.random() - 0.5) * shake * 0.02;
  const shakeY = (Math.random() - 0.5) * shake * 0.02;
  camera.position.set(camWX + shakeX, camWY + 1.05 + shakeY, 6.6);
  camera.lookAt(camWX, camWY + 0.45, 0);
}

// ---------- HUD (2D canvas overlay, ported from the original game) ----------
function drawSpeakerIcon(cx, cy, isMuted){
  hctx.save();
  hctx.translate(cx, cy);
  hctx.fillStyle = '#e8e0d0';
  hctx.beginPath();
  hctx.moveTo(-9, -4); hctx.lineTo(-4, -4); hctx.lineTo(2, -9); hctx.lineTo(2, 9); hctx.lineTo(-4, 4); hctx.lineTo(-9, 4);
  hctx.closePath(); hctx.fill();
  if (isMuted) {
    hctx.strokeStyle = '#d03028'; hctx.lineWidth = 2.5; hctx.lineCap = 'round';
    hctx.beginPath(); hctx.moveTo(5, -6); hctx.lineTo(13, 6); hctx.moveTo(13, -6); hctx.lineTo(5, 6); hctx.stroke();
  } else {
    hctx.strokeStyle = 'rgba(232,224,208,0.85)'; hctx.lineWidth = 1.6;
    hctx.beginPath(); hctx.arc(2, 0, 6, -0.7, 0.7); hctx.stroke();
    hctx.beginPath(); hctx.arc(2, 0, 10, -0.6, 0.6); hctx.stroke();
  }
  hctx.restore();
}
function drawMuteButton(){
  const cx = VIEW_W - 26, cy = 26;
  hctx.fillStyle = 'rgba(10,7,4,0.55)';
  hctx.beginPath(); hctx.arc(cx, cy, 17, 0, 7); hctx.fill();
  hctx.strokeStyle = 'rgba(201,168,106,0.5)'; hctx.lineWidth = 1.5;
  hctx.beginPath(); hctx.arc(cx, cy, 17, 0, 7); hctx.stroke();
  drawSpeakerIcon(cx, cy, muted);
}
function heartGem(bx, by, lit, litColor, dimColor){
  hctx.fillStyle = 'rgba(0,0,0,0.7)';
  hctx.beginPath();
  hctx.moveTo(bx - 1.5, by - 7.5); hctx.lineTo(bx + 13.5, by - 7.5); hctx.lineTo(bx + 6, by + 7.5);
  hctx.fill();
  hctx.fillStyle = lit ? litColor : dimColor;
  hctx.beginPath();
  hctx.moveTo(bx, by - 6); hctx.lineTo(bx + 12, by - 6); hctx.lineTo(bx + 6, by + 6);
  hctx.fill();
  if (lit) {
    hctx.fillStyle = 'rgba(255,255,255,0.45)';
    hctx.fillRect(bx + 2.5, by - 4.5, 3, 2);
  }
}
function drawHUD(){
  drawMuteButton();
  const bg = hctx.createLinearGradient(0, VIEW_H - 34, 0, VIEW_H);
  bg.addColorStop(0, 'rgba(10,6,3,0.88)'); bg.addColorStop(1, 'rgba(0,0,0,0.94)');
  hctx.fillStyle = bg;
  hctx.fillRect(0, VIEW_H - 34, VIEW_W, 34);
  hctx.fillStyle = 'rgba(201,168,106,0.45)';
  hctx.fillRect(0, VIEW_H - 34, VIEW_W, 1);
  for (let i = 0; i < player.maxHp; i++)
    heartGem(14 + i * 18, VIEW_H - 17, i < player.hp, '#d03028', '#3a1512');
  if (guard && !guard.dead) {
    const gx = guard.x + guard.w / 2, px = player.x + player.w / 2;
    if (Math.abs(gx - px) < TILE * 9 && Math.abs(guard.y - player.y) < TILE * 3) {
      for (let i = 0; i < 3; i++)
        heartGem(VIEW_W - 26 - i * 18, VIEW_H - 17, i < guard.hp, '#4a72d0', '#16203a');
    }
  }
  const mins = Math.floor(timeLeft / 60), secs = Math.floor(timeLeft % 60);
  hctx.fillStyle = '#c9a86a';
  hctx.font = '14px Georgia';
  hctx.textAlign = 'center';
  hctx.fillText(`${mins}:${String(secs).padStart(2, '0')} remaining`, VIEW_W / 2, VIEW_H - 12);
  if (message) {
    hctx.fillStyle = '#e8e0d0';
    hctx.font = '15px Georgia';
    hctx.fillText(message, VIEW_W / 2, VIEW_H - 44);
  }
  hctx.textAlign = 'left';
}
function drawOverlay(title, sub, sub2){
  hctx.fillStyle = 'rgba(5,3,2,0.55)';
  hctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const pw = 660, ph = 234, px0 = (VIEW_W - pw) / 2, py0 = VIEW_H / 2 - 128;
  hctx.fillStyle = 'rgba(12,8,5,0.93)';
  hctx.fillRect(px0, py0, pw, ph);
  hctx.strokeStyle = '#c9a86a'; hctx.lineWidth = 2;
  hctx.strokeRect(px0 + 6.5, py0 + 6.5, pw - 13, ph - 13);
  hctx.strokeStyle = 'rgba(201,168,106,0.35)'; hctx.lineWidth = 1;
  hctx.strokeRect(px0 + 12.5, py0 + 12.5, pw - 25, ph - 25);
  hctx.fillStyle = '#c9a86a';
  for (const [dx2, dy2] of [[px0 + 6, py0 + 6], [px0 + pw - 6, py0 + 6], [px0 + 6, py0 + ph - 6], [px0 + pw - 6, py0 + ph - 6]]) {
    hctx.save(); hctx.translate(dx2, dy2); hctx.rotate(Math.PI / 4); hctx.fillRect(-4, -4, 8, 8); hctx.restore();
  }
  hctx.textAlign = 'center';
  const tg = hctx.createLinearGradient(0, py0 + 44, 0, py0 + 82);
  tg.addColorStop(0, '#f2dcac'); tg.addColorStop(1, '#a87f3c');
  hctx.fillStyle = 'rgba(0,0,0,0.6)';
  hctx.font = '34px Georgia';
  hctx.fillText(title, VIEW_W / 2 + 2, py0 + 78);
  hctx.fillStyle = tg;
  hctx.fillText(title, VIEW_W / 2, py0 + 76);
  hctx.fillStyle = '#e8e0d0';
  hctx.font = '15px Georgia';
  if (sub) hctx.fillText(sub, VIEW_W / 2, py0 + 126, pw - 70);
  if (sub2) { hctx.fillStyle = '#9a8a68'; hctx.fillText(sub2, VIEW_W / 2, py0 + 164, pw - 70); }
  hctx.textAlign = 'left';
}
function drawTitleLegend(){
  const items = [
    { icon: 'move', label: 'Run' },
    { icon: 'jump', label: 'Jump' },
    { icon: 'walk', label: 'Walk past spikes' },
    { icon: 'sword', label: 'Attack' },
    { icon: 'shield', label: 'Parry' },
  ];
  const y = VIEW_H / 2 + 128 + 33;
  const spacing = 150;
  const startX = VIEW_W / 2 - (items.length - 1) * spacing / 2;
  hctx.textAlign = 'center';
  items.forEach((it, i) => {
    const x = startX + i * spacing;
    hctx.save();
    hctx.translate(x, y);
    hctx.strokeStyle = 'rgba(201,168,106,0.6)'; hctx.lineWidth = 1.5;
    hctx.beginPath(); hctx.arc(0, 0, 18, 0, 7); hctx.stroke();
    hctx.fillStyle = '#e8e0d0';
    if (it.icon === 'move') {
      hctx.beginPath(); hctx.moveTo(-8, 0); hctx.lineTo(-2, -5); hctx.lineTo(-2, 5); hctx.fill();
      hctx.beginPath(); hctx.moveTo(8, 0); hctx.lineTo(2, -5); hctx.lineTo(2, 5); hctx.fill();
    } else if (it.icon === 'jump') {
      hctx.beginPath(); hctx.moveTo(0, -8); hctx.lineTo(-6, 2); hctx.lineTo(6, 2); hctx.fill();
      hctx.fillRect(-2, 2, 4, 7);
    } else if (it.icon === 'walk') {
      hctx.fillStyle = '#8ab04a';
      hctx.beginPath(); hctx.ellipse(0, 2, 8, 5, 0, 0, 7); hctx.fill();
      hctx.beginPath(); hctx.arc(6, 0, 3, 0, 7); hctx.fill();
    } else if (it.icon === 'sword') {
      hctx.save(); hctx.rotate(-0.6);
      hctx.fillStyle = '#dfe3ea'; hctx.fillRect(-1.5, -9, 3, 14);
      hctx.fillStyle = '#8a6a30'; hctx.fillRect(-5, 4, 10, 3);
      hctx.restore();
    } else if (it.icon === 'shield') {
      hctx.fillStyle = '#7a8aa8';
      hctx.beginPath();
      hctx.moveTo(0, -8); hctx.lineTo(7, -4); hctx.lineTo(6, 4); hctx.lineTo(0, 9); hctx.lineTo(-6, 4); hctx.lineTo(-7, -4);
      hctx.closePath(); hctx.fill();
    }
    hctx.restore();
    hctx.fillStyle = '#9a8a68';
    hctx.font = '11px Georgia';
    hctx.fillText(it.label, x, y + 32);
  });
  hctx.textAlign = 'left';
}

// ---------- main loop ----------
state = 'title';
resetLevel();
resizeRenderer();
const loadingEl = document.getElementById('loading');
if (loadingEl) loadingEl.remove();
let lastT = performance.now();

function frame(now){
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  hctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (state === 'title') {
    updateCamera(dt); syncDynamics();
    const b = bestTime ? ` · Best escape: ${Math.floor(bestTime / 60)}:${String(Math.floor(bestTime % 60)).padStart(2, '0')}` : '';
    drawHUD();
    drawOverlay('Prince of the Lost Tower — 3D',
      'Escape the dungeon before the hour runs out. Find the sword — you will need it.',
      'Press Enter to begin' + b);
    drawTitleLegend();
    if (edge.enter()) { state = 'play'; showMessage('Escape. You have one hour.', 4); }
  } else if (state === 'play') {
    if (keyEdge['KeyP'] || keyEdge['Escape']) {
      state = 'paused';
    } else if (hitstop > 0) {
      hitstop -= dt;
    } else {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; state = 'timeup'; }
      updateWorld(dt);
      updatePlayer(dt);
      updateGuard(dt);
    }
    updateCamera(dt); syncDynamics();
    drawHUD();
    if (player.hurtT > 0.95) {
      hctx.fillStyle = 'rgba(180,20,10,0.22)';
      hctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  } else if (state === 'paused') {
    updateCamera(dt); syncDynamics();
    drawHUD();
    drawOverlay('Paused', 'The tower waits.', 'P or Esc to resume');
    if (keyEdge['KeyP'] || keyEdge['Escape'] || edge.enter()) state = 'play';
  } else if (state === 'dying') {
    deathT -= dt;
    updateWorld(dt);
    updateCamera(dt); syncDynamics();
    drawHUD();
    hctx.fillStyle = `rgba(140,10,0,${0.45 * (1 - Math.max(deathT, 0) / 0.8)})`;
    hctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (deathT <= 0) state = 'dead';
  } else if (state === 'dead') {
    updateWorld(dt);
    updateCamera(dt); syncDynamics();
    drawHUD();
    drawOverlay('You Have Died', player.deathMsg, 'Press Enter to rise again');
    if (edge.enter()) respawn();
  } else if (state === 'timeup') {
    updateCamera(dt); syncDynamics();
    drawHUD();
    drawOverlay('The Hour Has Passed', 'The princess is lost. The tower keeps its secrets.', 'Press Enter to try once more');
    if (edge.enter()) { resetLevel(); state = 'play'; }
  } else if (state === 'win') {
    winT += dt;
    updateWorld(dt);
    updateCamera(dt); syncDynamics();
    drawHUD();
    const used = TIME_LIMIT - timeLeft;
    const m = Math.floor(used / 60), s = Math.floor(used % 60);
    const isBest = bestTime && Math.abs(used - bestTime) < 0.5;
    drawOverlay('Freedom!',
      `The prince escapes the lost tower in ${m}:${String(s).padStart(2, '0')}.` + (isBest ? ' A new best!' : ''),
      'Press Enter to play again');
    if (edge.enter() && winT > 1) { resetLevel(); state = 'title'; }
  }

  renderer.render(scene, camera);
  keyEdge = {};
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
