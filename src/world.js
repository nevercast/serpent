// The simulation core: owns the snake roster and advances the world one fixed
// step at a time. Deliberately DOM-free so the test suite can drive it headless.
// Input application, HUD and game-over UI live in the browser layer (main.js).
import {
  WORLD, BOT_COUNT, TARGET_FOOD, AMBIENT_FOOD_RESPAWNS_PER_SEC, CELL, CELLS,
  START_MASS, NEON, GHOST_DURATION
} from './constants.js';
import { rand } from './math.js';
import { foods, cells, spawnFood, spawnRandomFood, spawnAmbientFood, killFood, moveFoodCell, resetFood } from './food.js';
import { Snake } from './snake.js';
import { botThink, botAvoidHazards, botSandbagForScore, shouldRunBotAvoidanceEveryTick } from './ai.js';

export const snakes = [];
const botTimers = [];        // countdowns to respawn dead bots
let player = null;
let tGame = 0;
let playerHitCount = 0;      // bots that died crashing into the player's body
let playerKillCount = 0;     // cumulative kills for this life (bots killed by the player)
let playerFoodCount = 0;     // pellets collected by the player this life
let ambientFoodBudget = 0;

export function getPlayer() { return player; }
// Returns the number of bots that crashed into the player since the last call.
export function popPlayerHits() { const n = playerHitCount; playerHitCount = 0; return n; }
// Returns the total number of bots killed by the player this life.
export function getPlayerKillCount() { return playerKillCount; }
// Returns the number of food pellets collected by the player this life.
export function getPlayerFoodCount() { return playerFoodCount; }

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
  b.ghostTimer = GHOST_DURATION;
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
  playerKillCount = 0;
  playerFoodCount = 0;
  player.ghostTimer = GHOST_DURATION;
  snakes.push(player);
  return player;
}

// Heads are lethal against: the world border, own body (neck exempt), and any
// segment of any other snake. Deaths resolve after all checks so head-on kills
// both parties. Sets s.deathCause for diagnostics/tests.
export function collide() {
  for (const s of snakes) {
    if (!s.alive) continue;
    if (s.ghostTimer > 0) continue;   // spawning immunity: can't be killed while ghost
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
      if (o.ghostTimer > 0) continue;   // ghost bodies are intangible
      if (s.x < o.minX - hr || s.x > o.maxX + hr || s.y < o.minY - hr || s.y > o.maxY + hr) continue;
      const rr = hr * 0.85 + o.radius * 0.9, rr2 = rr * rr;
      const segs = o.segs, n = o.segCount;
      // Glancing passes can overlap a trailing snake's head sample into the
      // leading snake's head/neck samples and feel like an unfair "neck hit".
      // So when the other head is not ahead of us, ignore only its immediate
      // head/neck samples while keeping the rest of the body lethal.
      const ox = o.x - s.x, oy = o.y - s.y;
      const oAhead = Math.cos(s.dir) * ox + Math.sin(s.dir) * oy > 0;
      const skip = oAhead ? 0 : Math.max(1, Math.ceil(o.headR / o.spacing));
      for (let i = skip; i < n; i++) {
        const g = segs[i];
        const dx = g.x - s.x, dy = g.y - s.y;
        if (dx * dx + dy * dy < rr2) { s.pendingDead = true; s.deathCause = 'other'; if (o === player && s.bot) { playerHitCount++; playerKillCount++; } break; }
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
          if (s === player) playerFoodCount++;
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
export function update(dt, options = {}) {
  tGame += dt;
  const playerScore = options.playerScore ?? (player && player.alive ? Math.max(0, Math.floor(player.mass - START_MASS)) : null);
  const sandbag = options.botSandbag ?? (playerScore === null ? 0 : botSandbagForScore(playerScore));
  const botOptions = {
    navMode: options.navMode,
    avoidanceMode: options.avoidanceMode,
    sandbag,
  };
  const avoidEveryTick = shouldRunBotAvoidanceEveryTick(options.avoidanceMode);

  if (foods.length < TARGET_FOOD) {
    ambientFoodBudget += AMBIENT_FOOD_RESPAWNS_PER_SEC * dt;
    while (foods.length < TARGET_FOOD && ambientFoodBudget >= 1) {
      spawnAmbientFood();
      ambientFoodBudget--;
    }
  } else {
    ambientFoodBudget = 0;
  }
  for (let i = botTimers.length - 1; i >= 0; i--) {
    botTimers[i] -= dt;
    if (botTimers[i] <= 0) { botTimers.splice(i, 1); makeBot(); }
  }
  for (const s of snakes) {
    if (s.bot) {
      s.think -= dt;
      if (s.think <= 0) botThink(s, snakes, botOptions);
      else if (avoidEveryTick && Math.random() >= sandbag * 0.55) botAvoidHazards(s, snakes, options.avoidanceMode);
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
  playerKillCount = 0;
  playerFoodCount = 0;
  ambientFoodBudget = 0;
  resetFood();
}

// Serialize the complete world state to a plain JSON-safe object.
export function exportState() {
  return {
    snakes: snakes.map(s => ({
      x: s.x, y: s.y, dir: s.dir, targetAngle: s.targetAngle,
      ci: s.ci, bot: s.bot, mass: s.mass, boost: s.boost,
      alive: s.alive, pendingDead: s.pendingDead, deathCause: s.deathCause,
      pts: s.pts.slice(),
      segs: s.segs.slice(0, s.segCount).map(g => ({ x: g.x, y: g.y })),
      segCount: s.segCount, spacing: s.spacing,
      minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: s.maxY,
      dropT: s.dropT, turnAcc: s.turnAcc, think: s.think, wander: s.wander,
      ghostTimer: s.ghostTimer,
    })),
    playerIdx: player ? snakes.indexOf(player) : -1,
    foods: foods.map(f => ({ x: f.x, y: f.y, v: f.v, r: f.r, ci: f.ci, phase: f.phase })),
    botTimers: botTimers.slice(),
    tGame, playerHitCount, playerKillCount, playerFoodCount, ambientFoodBudget,
  };
}

// Restore the world from a state produced by exportState().
export function importState(state) {
  snakes.length = 0;
  botTimers.length = 0;
  player = null;
  tGame = state.tGame;
  playerHitCount = state.playerHitCount;
  playerKillCount = state.playerKillCount ?? 0;
  playerFoodCount = state.playerFoodCount ?? 0;
  ambientFoodBudget = state.ambientFoodBudget;
  resetFood();

  for (const fd of state.foods) {
    spawnFood(fd.x, fd.y, fd.v, fd.r, fd.ci);
    foods[foods.length - 1].phase = fd.phase;
  }

  for (const sd of state.snakes) {
    const s = new Snake(sd.x, sd.y, sd.ci, sd.bot);
    s.dir = sd.dir; s.targetAngle = sd.targetAngle;
    s.mass = sd.mass; s.boost = sd.boost;
    s.alive = sd.alive; s.pendingDead = sd.pendingDead; s.deathCause = sd.deathCause;
    s.pts = sd.pts.slice();
    s.segs = sd.segs.map(g => ({ x: g.x, y: g.y }));
    s.segCount = sd.segCount; s.spacing = sd.spacing;
    s.minX = sd.minX; s.maxX = sd.maxX; s.minY = sd.minY; s.maxY = sd.maxY;
    s.dropT = sd.dropT; s.turnAcc = sd.turnAcc; s.think = sd.think; s.wander = sd.wander;
    s.ghostTimer = sd.ghostTimer ?? 0;
    snakes.push(s);
  }

  if (state.playerIdx >= 0) player = snakes[state.playerIdx];
  for (const t of state.botTimers) botTimers.push(t);
}
