// Bot brain. pickBotTarget chooses a desired heading (dodge / food / wander);
// botThink then runs a safety filter that never lets that heading cross the
// bot's own body. Layered defenses against the death-spiral failure mode:
//   1. reachability filter — ignore food inside the min turning circle
//   2. anti-spiral governor — unwind after too much one-way turning
//   3. heading validation — reject any target that rays into own body
import { TAU, rand, clamp, angDiff } from './math.js';
import { WORLD, BASE_SPEED, CELL, CELLS } from './constants.js';
import { cells } from './food.js';

function turnRateForRadius(radius) {
  return 4.4 - Math.min(2.4, (radius - 7) * 0.16);
}

// Does steering toward `ang` hit our own body within `dist`? This predicts the
// same turn-limited path the snake can actually take, rather than a straight ray.
export function selfBlocked(b, ang, dist) {
  const collisionR = b.headR * 0.8 + b.radius * 0.8;
  const skip = Math.ceil((collisionR * 2.6) / b.spacing) + 1;
  const rr = b.headR + b.radius + 10, rr2 = rr * rr;
  const stepDist = Math.max(18, b.radius * 0.75);
  const steps = Math.ceil(dist / stepDist);
  const maxTurnPerStep = turnRateForRadius(b.radius) * (stepDist / BASE_SPEED);
  let x = b.x, y = b.y, dir = b.dir;
  const segs = b.segs;
  for (let k = 1; k <= steps; k++) {
    const turn = clamp(angDiff(ang, dir), -maxTurnPerStep, maxTurnPerStep);
    dir += turn;
    x += Math.cos(dir) * stepDist;
    y += Math.sin(dir) * stepDist;
    for (let i = skip; i < b.segCount; i += 2) {
      const g = segs[i];
      const dx = g.x - x, dy = g.y - y;
      if (dx * dx + dy * dy < rr2) return true;
    }
  }
  return false;
}

function wallBlocked(b, ang, dist) {
  const stepDist = Math.max(18, b.radius * 0.75);
  const steps = Math.ceil(dist / stepDist);
  const maxTurnPerStep = turnRateForRadius(b.radius) * (stepDist / BASE_SPEED);
  let x = b.x, y = b.y, dir = b.dir;
  const margin = b.headR + 18;
  for (let k = 1; k <= steps; k++) {
    const turn = clamp(angDiff(ang, dir), -maxTurnPerStep, maxTurnPerStep);
    dir += turn;
    x += Math.cos(dir) * stepDist;
    y += Math.sin(dir) * stepDist;
    if (x < margin || y < margin || x > WORLD - margin || y > WORLD - margin) return true;
  }
  return false;
}

function findSafeHeading(b, preferred, look, fallback) {
  let best = null, bestScore = -Infinity;
  const choices = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.35, -2.35, Math.PI, -Math.PI];
  for (const offset of choices) {
    const cand = preferred + offset;
    if (selfBlocked(b, cand, look) || wallBlocked(b, cand, look)) continue;
    const align = Math.cos(angDiff(cand, preferred));
    const escape = Math.cos(angDiff(cand, fallback));
    const straight = Math.cos(angDiff(cand, b.dir));
    const score = align * 1.5 + escape + straight * 0.35;
    if (score > bestScore) { best = cand; bestScore = score; }
  }
  return best ?? fallback;
}

export function botThink(b, snakes) {
  b.think = 0.12 + Math.random() * 0.1;
  pickBotTarget(b, snakes);

  // Safety filter: never steer across our own body. Validate the chosen
  // heading (and the near-term straight-ahead); if blocked, rotate toward the
  // open side — away from our own centre of mass — until a clear heading is found.
  if (b.segCount > 24) {
    const look = 90 + b.radius * 3;
    if (
      selfBlocked(b, b.targetAngle, look) ||
      selfBlocked(b, b.dir, 55 + b.radius * 2) ||
      wallBlocked(b, b.targetAngle, look)
    ) {
      const segs = b.segs;
      let sx = 0, sy = 0;
      for (let i = 0; i < b.segCount; i++) { sx += segs[i].x; sy += segs[i].y; }
      const comA = Math.atan2(b.y - sy / b.segCount, b.x - sx / b.segCount);
      b.targetAngle = findSafeHeading(b, b.targetAngle, look, comA);
      b.boost = false;
    }
  }
}

function pickBotTarget(b, snakes) {
  const M = 300;
  // steer back toward the middle near walls
  if (b.x < M || b.y < M || b.x > WORLD - M || b.y > WORLD - M) {
    b.targetAngle = Math.atan2(WORLD / 2 - b.y, WORLD / 2 - b.x) + rand(-0.3, 0.3);
    b.boost = false;
    return;
  }
  // anti-spiral governor: a wound-up one-way turn is how a snake coils onto its
  // own tail. Unwind before chasing anything.
  if (Math.abs(b.turnAcc) > 3.8) {
    b.targetAngle = b.dir - Math.sign(b.turnAcc) * 0.5;
    b.boost = false;
    return;
  }
  // probe ahead for other snakes; steer away if something's in the path
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

  // Seek nearest REACHABLE food. A pellet inside the min turning circle can't be
  // caught by greedy pursuit — the bot orbits it forever and eventually rings its
  // own tail. Skip those; another pellet always exists.
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
