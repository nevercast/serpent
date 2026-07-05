// Bot brain. pickBotTarget chooses a desired heading (dodge / food / wander);
// botThink then runs a safety filter that rejects headings which predictably
// run into the bot's own body, walls, or opponent bodies.
import { TAU, rand, clamp, angDiff } from './math.js';
import {
  WORLD, BASE_SPEED, CELL, CELLS,
  BOT_NAV_MODE, BOT_NAV_MODES, BOT_AVOIDANCE_MODE, BOT_AVOIDANCE_MODES
} from './constants.js';
import { cells } from './food.js';

function turnRateForRadius(radius) {
  return 4.4 - Math.min(2.4, (radius - 7) * 0.16);
}

function projectedPath(b, ang, dist) {
  const stepDist = Math.max(18, b.radius * 0.75);
  const steps = Math.ceil(dist / stepDist);
  const maxTurnPerStep = turnRateForRadius(b.radius) * (stepDist / BASE_SPEED);
  let x = b.x, y = b.y, dir = b.dir;
  const path = [];
  for (let k = 1; k <= steps; k++) {
    const turn = clamp(angDiff(ang, dir), -maxTurnPerStep, maxTurnPerStep);
    dir += turn;
    x += Math.cos(dir) * stepDist;
    y += Math.sin(dir) * stepDist;
    path.push({ x, y });
  }
  return path;
}

// Does steering toward `ang` hit our own body within `dist`? This predicts the
// same turn-limited path the snake can actually take, rather than a straight ray.
export function selfBlocked(b, ang, dist) {
  const collisionR = b.headR * 0.8 + b.radius * 0.8;
  const skip = Math.ceil((collisionR * 2.6) / b.spacing) + 1;
  const rr = b.headR + b.radius + 10, rr2 = rr * rr;
  const segs = b.segs;
  for (const p of projectedPath(b, ang, dist)) {
    for (let i = skip; i < b.segCount; i++) {
      const g = segs[i];
      const dx = g.x - p.x, dy = g.y - p.y;
      if (dx * dx + dy * dy < rr2) return true;
    }
  }
  return false;
}

function legacySelfBlocked(b, ang, dist) {
  const skip = Math.ceil(70 / b.spacing);
  const rr = b.headR + b.radius + 10, rr2 = rr * rr;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const segs = b.segs;
  for (let k = 1; k <= 3; k++) {
    const d = dist * k / 3;
    const qx = b.x + ca * d, qy = b.y + sa * d;
    for (let i = skip; i < b.segCount; i += 2) {
      const g = segs[i];
      const dx = g.x - qx, dy = g.y - qy;
      if (dx * dx + dy * dy < rr2) return true;
    }
  }
  return false;
}

function wallBlocked(b, ang, dist) {
  const margin = b.headR + 18;
  for (const p of projectedPath(b, ang, dist)) {
    if (p.x < margin || p.y < margin || p.x > WORLD - margin || p.y > WORLD - margin) return true;
  }
  return false;
}

function opponentBlocked(b, snakes, ang, dist) {
  const rrPad = b.headR + 22;
  for (const p of projectedPath(b, ang, dist)) {
    for (const o of snakes) {
      if (o === b || !o.alive || o.ghostTimer > 0) continue;
      if (p.x < o.minX - rrPad || p.x > o.maxX + rrPad || p.y < o.minY - rrPad || p.y > o.maxY + rrPad) continue;
      const rr = b.headR * 0.85 + o.radius * 0.9 + 14, rr2 = rr * rr;
      const segs = o.segs;
      for (let i = 0; i < o.segCount; i += 2) {
        const g = segs[i];
        const dx = g.x - p.x, dy = g.y - p.y;
        if (dx * dx + dy * dy < rr2) return true;
      }
    }
  }
  return false;
}

function hazardBlocked(b, snakes, ang, dist) {
  return selfBlocked(b, ang, dist) || wallBlocked(b, ang, dist) || opponentBlocked(b, snakes, ang, dist);
}

function legacyHazardBlocked(b, ang, dist) {
  return legacySelfBlocked(b, ang, dist) || wallBlocked(b, ang, dist);
}

function nearbyOwnBodyAhead(b) {
  if (b.segCount <= 36) return null;
  const ca = Math.cos(b.dir), sa = Math.sin(b.dir);
  const skip = Math.ceil((b.headR + b.radius) * 2.2 / b.spacing) + 1;
  const maxD = 520 + b.radius * 4;
  const maxD2 = maxD * maxD;
  let closest = null, best = Infinity;
  for (let i = skip; i < b.segCount; i += 2) {
    const g = b.segs[i];
    const dx = g.x - b.x, dy = g.y - b.y;
    const forward = dx * ca + dy * sa;
    if (forward < -b.radius * 2) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxD2 || d2 >= best) continue;
    best = d2;
    closest = g;
  }
  return closest;
}

function findSafeHeading(b, snakes, preferred, look, fallback) {
  let best = null, bestScore = -Infinity;
  const offsets = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.55, -1.55, 1.9, -1.9, 2.35, -2.35, Math.PI];
  const candidates = [];
  for (const offset of offsets) {
    candidates.push(preferred + offset);
    candidates.push(fallback + offset);
  }
  for (const cand of candidates) {
    if (hazardBlocked(b, snakes, cand, look)) continue;
    const align = Math.cos(angDiff(cand, preferred));
    const escape = Math.cos(angDiff(cand, fallback));
    const straight = Math.cos(angDiff(cand, b.dir));
    const score = align * 1.5 + escape + straight * 0.35;
    if (score > bestScore) { best = cand; bestScore = score; }
  }
  return best ?? fallback;
}

function findLegacySafeHeading(b, preferred, look, fallback) {
  const sgn = Math.sign(angDiff(fallback, preferred)) || 1;
  for (let k = 1; k <= 5; k++) {
    const cand = preferred + sgn * k * 0.55;
    if (!legacyHazardBlocked(b, cand, look)) return cand;
  }
  return fallback;
}

function botAvoidLegacy(b) {
  if (b.segCount <= 24) return;
  const look = 90 + b.radius * 3;
  if (!legacyHazardBlocked(b, b.targetAngle, look) && !legacyHazardBlocked(b, b.dir, 55 + b.radius * 2)) return;

  const segs = b.segs;
  let sx = 0, sy = 0;
  for (let i = 0; i < b.segCount; i++) { sx += segs[i].x; sy += segs[i].y; }
  const comA = Math.atan2(b.y - sy / b.segCount, b.x - sx / b.segCount);
  b.targetAngle = findLegacySafeHeading(b, b.targetAngle, look, comA);
  b.boost = false;
}

function botAvoidPredictive(b, snakes) {
  if (b.segCount <= 24) return;
  const look = 260 + b.radius * 5;
  if (!hazardBlocked(b, snakes, b.targetAngle, look) && !hazardBlocked(b, snakes, b.dir, 160 + b.radius * 3)) return;

  const segs = b.segs;
  let sx = 0, sy = 0;
  for (let i = 0; i < b.segCount; i++) { sx += segs[i].x; sy += segs[i].y; }
  const comA = Math.atan2(b.y - sy / b.segCount, b.x - sx / b.segCount);
  const centerA = Math.atan2(WORLD / 2 - b.y, WORLD / 2 - b.x);
  const fallback = wallBlocked(b, comA, look) ? centerA : comA;
  b.targetAngle = findSafeHeading(b, snakes, b.targetAngle, look, fallback);
  b.boost = false;
}

export function botAvoidHazards(b, snakes, mode = BOT_AVOIDANCE_MODE) {
  switch (mode) {
    case BOT_AVOIDANCE_MODES.LEGACY:
      botAvoidLegacy(b);
      break;
    case BOT_AVOIDANCE_MODES.PREDICTIVE:
    case BOT_AVOIDANCE_MODES.PREDICTIVE_EVERY_TICK:
      botAvoidPredictive(b, snakes);
      break;
    default:
      throw new Error(`Unknown bot avoidance mode: ${mode}`);
  }
}

export function shouldRunBotAvoidanceEveryTick(mode = BOT_AVOIDANCE_MODE) {
  switch (mode) {
    case BOT_AVOIDANCE_MODES.LEGACY:
    case BOT_AVOIDANCE_MODES.PREDICTIVE:
      return false;
    case BOT_AVOIDANCE_MODES.PREDICTIVE_EVERY_TICK:
      return true;
    default:
      throw new Error(`Unknown bot avoidance mode: ${mode}`);
  }
}

export function botThink(b, snakes, options = {}) {
  const navMode = options.navMode ?? BOT_NAV_MODE;
  const avoidanceMode = options.avoidanceMode ?? BOT_AVOIDANCE_MODE;
  b.think = 0.12 + Math.random() * 0.1;
  pickBotTarget(b, snakes, navMode);
  botAvoidHazards(b, snakes, avoidanceMode);
}

function pickBotTarget(b, snakes, navMode) {
  const M = 300;
  // Steer back toward the middle near walls.
  if (b.x < M || b.y < M || b.x > WORLD - M || b.y > WORLD - M) {
    b.targetAngle = Math.atan2(WORLD / 2 - b.y, WORLD / 2 - b.x) + rand(-0.3, 0.3);
    b.boost = false;
    return;
  }
  // Anti-spiral governor: a wound-up one-way turn is how a snake coils onto its
  // own tail. Unwind before chasing anything.
  if (Math.abs(b.turnAcc) > 3.8) {
    b.targetAngle = b.dir - Math.sign(b.turnAcc) * 0.5;
    b.boost = false;
    return;
  }
  switch (navMode) {
    case BOT_NAV_MODES.STANDARD:
      break;
    case BOT_NAV_MODES.SELF_AWARE: {
      const ownAhead = nearbyOwnBodyAhead(b);
      if (ownAhead) {
        b.targetAngle = Math.atan2(b.y - ownAhead.y, b.x - ownAhead.x);
        b.boost = false;
        return;
      }
      break;
    }
    default:
      throw new Error(`Unknown bot navigation mode: ${navMode}`);
  }
  // Probe ahead for other snakes; steer away if something's in the path.
  const opd = 90 + b.radius * 3;
  const px = b.x + Math.cos(b.dir) * opd, py = b.y + Math.sin(b.dir) * opd;
  for (const o of snakes) {
    if (o === b || !o.alive) continue;
    if (px < o.minX - 40 || px > o.maxX + 40 || py < o.minY - 40 || py > o.maxY + 40) continue;
    const tr = o.radius + b.headR + 26, tr2 = tr * tr;
    const segs = o.segs, n = o.segCount;
    for (let i = 0; i < n; i += 3) {
      const g = segs[i];
      const dx = g.x - px, dy = g.y - py;
      if (dx * dx + dy * dy < tr2) {
        b.targetAngle = Math.atan2(py - g.y, px - g.x);
        b.boost = b.mass > 40 && Math.random() < 0.5;
        return;
      }
    }
  }
  b.boost = false;

  // Seek nearest reachable food. A pellet inside the min turning circle can
  // make a greedy bot orbit until it crosses its own tail, so skip those.
  const trate = turnRateForRadius(b.radius);
  const Rmin = (BASE_SPEED / trate) * 1.15;
  const bca = Math.cos(b.dir), bsa = Math.sin(b.dir);
  const lcx = b.x - bsa * Rmin, lcy = b.y + bca * Rmin;   // left turn-circle centre
  const rcx = b.x + bsa * Rmin, rcy = b.y - bca * Rmin;   // right turn-circle centre
  const Rmin2 = Rmin * Rmin;
  const cx = clamp((b.x / CELL) | 0, 0, CELLS - 1);
  const cy = clamp((b.y / CELL) | 0, 0, CELLS - 1);
  let bf = null, bd = Infinity;
  for (let gy = Math.max(0, cy - 2); gy <= Math.min(CELLS - 1, cy + 2); gy++) {
    for (let gx = Math.max(0, cx - 2); gx <= Math.min(CELLS - 1, cx + 2); gx++) {
      const arr = cells.get(gx + gy * CELLS);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        const dlx = f.x - lcx, dly = f.y - lcy;
        if (dlx * dlx + dly * dly < Rmin2) continue;   // orbit trap (left)
        const drx = f.x - rcx, dry = f.y - rcy;
        if (drx * drx + dry * dry < Rmin2) continue;   // orbit trap (right)
        const dx = f.x - b.x, dy = f.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; bf = f; }
      }
    }
  }
  if (bf) {
    b.targetAngle = Math.atan2(bf.y - b.y, bf.x - b.x);
  } else {
    b.wander += rand(-0.7, 0.7);
    b.targetAngle = b.wander;
  }
}
