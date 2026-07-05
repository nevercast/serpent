// A serpent. Head integrates position; the body is resampled at fixed
// arc-length intervals along the head's path, so it follows exactly without
// per-segment physics. Segment objects are pooled (zero steady-state alloc).
import { TAU, rand, clamp, angDiff } from './math.js';
import {
  POINT_SPACING, BASE_SPEED, BOOST_SPEED,
  START_MASS, MIN_BOOST_MASS, BOOST_DRAIN, MAX_SEGS
} from './constants.js';
import { spawnFood } from './food.js';

export class Snake {
  constructor(x, y, ci, bot) {
    this.x = x; this.y = y;
    this.dir = rand(0, TAU);
    this.targetAngle = this.dir;
    this.ci = ci;                  // colour index into NEON
    this.bot = bot;
    this.mass = START_MASS;
    this.boost = false;
    this.alive = true;
    this.pendingDead = false;
    this.deathCause = null;        // 'wall' | 'self' | 'other' (diagnostic)
    this.pts = [{ x, y }];         // sampled head path, oldest first
    this.segs = [];                // pooled body positions, head first
    this.segCount = 1;
    this.spacing = 3.64;           // current arc-length between segments
    this.minX = x; this.maxX = x; this.minY = y; this.maxY = y;
    this.dropT = 0;
    this.turnAcc = 0;              // signed same-direction turn accumulator
    this.think = Math.random() * 0.2;
    this.wander = this.dir;
  }

  get radius() { return Math.min(32, 6 + Math.sqrt(this.mass) * 0.35 + this.mass * 0.022); }
  get headR() { return this.radius * 1.25; }   // head slightly bigger than body
  targetSegCount() { return Math.min(MAX_SEGS, (10 + this.mass * 0.7) | 0); }

  update(dt) {
    const r = this.radius;
    // bigger snakes turn slower
    const maxTurn = (4.4 - Math.min(2.4, (r - 7) * 0.16)) * dt;
    const turn = clamp(angDiff(this.targetAngle, this.dir), -maxTurn, maxTurn);
    this.dir += turn;
    // accumulate sustained one-way turning; reset on reversal, decay when straight.
    // Drives the bot anti-spiral governor (see ai.js).
    if (turn * this.turnAcc < 0) this.turnAcc = 0;
    this.turnAcc += turn;
    if (Math.abs(turn) < maxTurn * 0.25) this.turnAcc *= 0.9;
    this.dir = ((this.dir + Math.PI) % TAU + TAU) % TAU - Math.PI;

    const boosting = this.boost && this.mass > MIN_BOOST_MASS;
    const sp = boosting ? BOOST_SPEED : BASE_SPEED;
    this.x += Math.cos(this.dir) * sp * dt;
    this.y += Math.sin(this.dir) * sp * dt;

    if (boosting) {
      this.mass = Math.max(START_MASS, this.mass - BOOST_DRAIN * dt);
      this.dropT -= dt;
      if (this.dropT <= 0 && this.segCount > 1) {
        const tail = this.segs[this.segCount - 1];
        spawnFood(tail.x + rand(-5, 5), tail.y + rand(-5, 5), 0.8, 3.5, this.ci);
        this.dropT = 0.18;
      }
    }

    const lp = this.pts[this.pts.length - 1];
    const dx = this.x - lp.x, dy = this.y - lp.y;
    if (dx * dx + dy * dy >= POINT_SPACING * POINT_SPACING) {
      this.pts.push({ x: this.x, y: this.y });
    }

    const spacing = Math.max(3.2, r * 0.52);
    const maxPts = (((this.targetSegCount() * spacing + 60) / POINT_SPACING) | 0) + 6;
    if (this.pts.length > maxPts) this.pts.splice(0, this.pts.length - maxPts);

    this.buildSegs(spacing);
  }

  // Walk the sampled path from the head, dropping a segment every `spacing` px.
  buildSegs(spacing) {
    this.spacing = spacing;
    const n = this.targetSegCount();
    while (this.segs.length < n) this.segs.push({ x: 0, y: 0 });
    const segs = this.segs;
    segs[0].x = this.x; segs[0].y = this.y;
    let si = 1;
    let px = this.x, py = this.y, need = spacing;
    let minX = px, maxX = px, minY = py, maxY = py;
    for (let i = this.pts.length - 1; i >= 0 && si < n; i--) {
      const q = this.pts[i];
      let dx = q.x - px, dy = q.y - py;
      let d = Math.sqrt(dx * dx + dy * dy);
      while (d >= need && si < n) {
        const t = need / d;
        px += dx * t; py += dy * t;
        const s = segs[si++];
        s.x = px; s.y = py;
        if (px < minX) minX = px; else if (px > maxX) maxX = px;
        if (py < minY) minY = py; else if (py > maxY) maxY = py;
        dx = q.x - px; dy = q.y - py;
        d -= need;
        need = spacing;
      }
      if (si >= n) break;
      need -= d;
      px = q.x; py = q.y;
    }
    this.segCount = si;
    const r = this.radius;
    this.minX = minX - r; this.maxX = maxX + r;
    this.minY = minY - r; this.maxY = maxY + r;
  }

  die() {
    this.alive = false;
    for (let i = 0; i < this.segCount; i += 2) {
      const g = this.segs[i];
      spawnFood(g.x + rand(-7, 7), g.y + rand(-7, 7), 2, rand(4.5, 6), this.ci);
    }
  }
}
