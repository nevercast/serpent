// Bot brain. avoidTraffic and guardSelfCollision are per-tick reflexes (called
// directly from world.js, independent of the think cadence below); botThink
// runs pickBotTarget, which chooses a slower-changing heading (dodge / food /
// wander) roughly 5-8 times a second. Layered defenses against the
// death-spiral failure mode:
//   1. reachability filter — ignore food inside the min turning circle
//   2. anti-spiral governor — unwind after too much one-way turning
//   3. heading validation — reject any target that rays into own body
import { TAU, rand, clamp, angDiff } from './math.js';
import { WORLD, BASE_SPEED, CELL, CELLS } from './constants.js';
import { cells } from './food.js';

// Does heading `ang` ray into our own body within `dist`? Samples 3 points.
export function selfBlocked(b, ang, dist) {
  const skip = Math.ceil(70 / b.spacing);          // exempt the neck
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

// Probe ahead for other snakes at a few ranges (near/mid/far); steer away if
// something's in the path. Returns true if an evasive heading was set. Called
// every tick (not gated by the bot's slower think cadence) — a fast-closing
// head can cross the whole detection buffer between think cycles otherwise.
export function avoidTraffic(b, snakes) {
  const look = 90 + b.radius * 3;
  const fca = Math.cos(b.dir), fsa = Math.sin(b.dir);
  for (const o of snakes) {
    if (o === b || !o.alive) continue;
    if (b.x + look < o.minX - 40 || b.x - look > o.maxX + 40 ||
        b.y + look < o.minY - 40 || b.y - look > o.maxY + 40) continue;
    const tr = o.radius + b.headR + 26, tr2 = tr * tr;
    const segs = o.segs, n = o.segCount;
    let hitG = null;
    for (let k = 1; k <= 3 && !hitG; k++) {
      const d = look * k / 3;
      const px = b.x + fca * d, py = b.y + fsa * d;
      for (let i = 0; i < n; i += 3) {
        const g = segs[i];
        const dx = g.x - px, dy = g.y - py;
        if (dx * dx + dy * dy < tr2) { hitG = g; break; }
      }
    }
    if (hitG) {
      // Bearing from our own head (never near-zero, unlike the old probe-to-
      // threat vector, which degenerated right at the moment of closest
      // approach). Turn away from whichever side the threat is actually on;
      // when it's dead ahead (the exact head-on case) that side is ambiguous,
      // so ties resolve to the same fixed hand for every bot, which is what
      // makes head-on pairs rotate oppositely in world space and curve apart.
      const bearing = Math.atan2(hitG.y - b.y, hitG.x - b.x);
      const hand = angDiff(bearing, b.dir) >= 0 ? -1 : 1;
      b.targetAngle = bearing + hand * (Math.PI / 2);
      b.boost = b.mass > 40 && Math.random() < 0.5;
      return true;
    }
  }
  return false;
}

// Safety filter: never steer across our own body. Validates the current
// target heading (and the near-term straight-ahead); if blocked, rotates
// toward the open side — away from our own centre of mass — until clear.
// Called every tick, independent of think/avoidTraffic, since a bot can spend
// many consecutive ticks evading other snakes without ever running pickBotTarget.
export function guardSelfCollision(b) {
  if (b.segCount <= 24) return;
  const look = 90 + b.radius * 3;
  if (selfBlocked(b, b.targetAngle, look) || selfBlocked(b, b.dir, 55 + b.radius * 2)) {
    const segs = b.segs;
    let sx = 0, sy = 0;
    for (let i = 0; i < b.segCount; i++) { sx += segs[i].x; sy += segs[i].y; }
    const comA = Math.atan2(b.y - sy / b.segCount, b.x - sx / b.segCount);
    const sgn = Math.sign(angDiff(comA, b.targetAngle)) || 1;
    let found = false;
    for (let k = 1; k <= 5; k++) {
      const cand = b.targetAngle + sgn * k * 0.55;
      if (!selfBlocked(b, cand, look)) { b.targetAngle = cand; found = true; break; }
    }
    if (!found) b.targetAngle = comA;   // last resort: straight away from the coil
    b.boost = false;
  }
}

export function botThink(b, snakes) {
  b.think = 0.12 + Math.random() * 0.1;
  pickBotTarget(b, snakes);
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
  if (avoidTraffic(b, snakes)) return;
  b.boost = false;

  // Seek nearest REACHABLE food. A pellet inside the min turning circle can't be
  // caught by greedy pursuit — the bot orbits it forever and eventually rings its
  // own tail. Skip those; another pellet always exists.
  const trate = 4.4 - Math.min(2.4, (b.radius - 7) * 0.16);
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
