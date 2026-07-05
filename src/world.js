// The simulation core: owns the snake roster and advances the world one fixed
// step at a time. Deliberately DOM-free so the test suite can drive it headless.
// Input application, HUD and game-over UI live in the browser layer (main.js).
import { WORLD, BOT_COUNT, TARGET_FOOD, CELL, CELLS, START_MASS, NEON } from './constants.js';
import { rand } from './math.js';
import { foods, cells, spawnRandomFood, killFood, moveFoodCell, resetFood } from './food.js';
import { Snake } from './snake.js';
import { botThink } from './ai.js';

export const snakes = [];
const botTimers = [];        // countdowns to respawn dead bots
let player = null;
let tGame = 0;
let playerHitCount = 0;      // bots that died crashing into the player's body

export function getPlayer() { return player; }
// Returns the number of bots that crashed into the player since the last call.
export function popPlayerHits() { const n = playerHitCount; playerHitCount = 0; return n; }

function safePos() {
  for (let t = 0; t < 24; t++) {
    const x = rand(500, WORLD - 500), y = rand(500, WORLD - 500);
    let ok = true;
    for (const s of snakes) {
      if (!s.alive) continue;
      const dx = s.x - x, dy = s.y - y;
      if (dx * dx + dy * dy < 600 * 600) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: rand(500, WORLD - 500), y: rand(500, WORLD - 500) };
}

export function makeBot() {
  const p = safePos();
  const b = new Snake(p.x, p.y, 1 + ((Math.random() * (NEON.length - 1)) | 0), true);
  b.mass = START_MASS + Math.random() * 40;
  snakes.push(b);
  return b;
}

export function spawnPlayer() {
  if (player) {
    const i = snakes.indexOf(player);
    if (i >= 0) snakes.splice(i, 1);
  }
  const p = safePos();
  player = new Snake(p.x, p.y, 0, false);
  snakes.push(player);
  return player;
}

// Heads are lethal against: the world border, own body (neck exempt), and any
// segment of any other snake. Deaths resolve after all checks so head-on kills
// both parties. Sets s.deathCause for diagnostics/tests.
export function collide() {
  for (const s of snakes) {
    if (!s.alive) continue;
    const hr = s.headR;

    if (s.x < hr || s.y < hr || s.x > WORLD - hr || s.y > WORLD - hr) {
      s.pendingDead = true; s.deathCause = 'wall';
      continue;
    }

    // self: skip segments within the head's minimum turning arc (the neck), so a
    // full-lock turn alone never kills — only actually crossing your body does.
    {
      const rrS = hr * 0.8 + s.radius * 0.8, rrS2 = rrS * rrS;
      const skip = Math.ceil((rrS * 2.6) / s.spacing) + 1;
      const segs = s.segs;
      for (let i = skip; i < s.segCount; i++) {
        const g = segs[i];
        const dx = g.x - s.x, dy = g.y - s.y;
        if (dx * dx + dy * dy < rrS2) { s.pendingDead = true; s.deathCause = 'self'; break; }
      }
    }
    if (s.pendingDead) continue;

    // others: i runs 0..segCount-1, so the tail tip is included
    for (const o of snakes) {
      if (o === s || !o.alive) continue;
      if (s.x < o.minX - hr || s.x > o.maxX + hr || s.y < o.minY - hr || s.y > o.maxY + hr) continue;
      const rr = hr * 0.85 + o.radius * 0.9, rr2 = rr * rr;
      const segs = o.segs, n = o.segCount;
      for (let i = 0; i < n; i++) {
        const g = segs[i];
        const dx = g.x - s.x, dy = g.y - s.y;
        if (dx * dx + dy * dy < rr2) { s.pendingDead = true; s.deathCause = 'other'; if (o === player && s.bot) playerHitCount++; break; }
      }
      if (s.pendingDead) break;
    }
  }

  for (let i = snakes.length - 1; i >= 0; i--) {
    const s = snakes[i];
    if (!s.pendingDead) continue;
    s.pendingDead = false;
    s.die();                       // body -> food
    snakes.splice(i, 1);
    if (s !== player) botTimers.push(2.5);
  }
}

// Eat pellets near the head; magnetize nearby ones toward it.
export function eat(s, dt) {
  const hr = s.headR;
  const magR = s.bot ? hr + 40 : hr * 3 + 26;
  const cx = Math.max(0, Math.min(CELLS - 1, (s.x / CELL) | 0));
  const cy = Math.max(0, Math.min(CELLS - 1, (s.y / CELL) | 0));
  for (let gy = Math.max(0, cy - 1); gy <= Math.min(CELLS - 1, cy + 1); gy++) {
    for (let gx = Math.max(0, cx - 1); gx <= Math.min(CELLS - 1, cx + 1); gx++) {
      const arr = cells.get(gx + gy * CELLS);
      if (!arr) continue;
      for (let i = arr.length - 1; i >= 0; i--) {
        const f = arr[i];
        const dx = s.x - f.x, dy = s.y - f.y;
        const d2 = dx * dx + dy * dy;
        const er = hr + f.r;
        if (d2 < er * er) {
          s.mass += f.v;
          killFood(f);
        } else if (d2 < magR * magR) {
          const d = Math.sqrt(d2) || 1;
          const pull = 340 * dt / d;
          f.x += dx * pull; f.y += dy * pull;
          moveFoodCell(f);
        }
      }
    }
  }
}

// Advance the whole world one step. Player heading/boost must be set by the
// caller beforehand (main.js applies input); bots decide for themselves here.
export function update(dt) {
  tGame += dt;

  if (foods.length < TARGET_FOOD) {
    spawnRandomFood();
    if (foods.length < TARGET_FOOD * 0.7) spawnRandomFood();
  }
  for (let i = botTimers.length - 1; i >= 0; i--) {
    botTimers[i] -= dt;
    if (botTimers[i] <= 0) { botTimers.splice(i, 1); makeBot(); }
  }
  for (const s of snakes) {
    if (s.bot) {
      s.think -= dt;
      if (s.think <= 0) botThink(s, snakes);
    }
    s.update(dt);
  }
  collide();
  for (const s of snakes) if (s.alive) eat(s, dt);
}

// Seed a fresh world (food + bots). Assumes an empty world.
export function populate() {
  for (let i = 0; i < TARGET_FOOD; i++) spawnRandomFood();
  for (let i = 0; i < BOT_COUNT; i++) makeBot();
}

// Tear everything down (used by restart and by tests for isolation).
export function resetWorld() {
  snakes.length = 0;
  botTimers.length = 0;
  player = null;
  tGame = 0;
  playerHitCount = 0;
  resetFood();
}
