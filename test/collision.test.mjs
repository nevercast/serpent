// Collision invariants — the rules that must never regress. Pure simulation,
// no DOM. Each test drives real Snake + world.collide over deterministic paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { snakes, collide, resetWorld } from '../src/world.js';
import { STEP } from '../src/constants.js';

function step() {
  for (const s of snakes) if (s.alive) s.update(STEP);
  collide();
}
function add(s) { snakes.push(s); return s; }
function runGlancingCase(angleDeg, trailMass, leadMass, yOffset) {
  resetWorld();
  const lead = add(new Snake(3000, 4000, 0, false));
  lead.mass = leadMass; lead.dir = 0; lead.targetAngle = 0;
  const angleRadians = angleDeg * Math.PI / 180;
  const trail = add(new Snake(2840, 4000 + yOffset, 1, true));
  trail.mass = trailMass; trail.dir = angleRadians; trail.targetAngle = angleRadians;
  // 360 fixed steps gives enough time for either a glancing contact or a clean pass.
  for (let i = 0; i < 360 && trail.alive && lead.alive; i++) step();
  return { trailAlive: trail.alive, leadAlive: lead.alive, trailCause: trail.deathCause };
}

test('short snake survives sustained full-lock turning (neck exemption)', () => {
  resetWorld();
  const s = add(new Snake(4000, 4000, 0, false));
  s.mass = 30; s.dir = 0; s.targetAngle = 0;
  let survived = true;
  for (let i = 0; i < 900; i++) {
    s.targetAngle = s.dir + 2;            // always beyond the clamp -> full lock
    step();
    if (!s.alive) { survived = false; break; }
  }
  assert.ok(survived, 'a body shorter than its turning circle must not self-kill');
});

test('long snake coiling a full circle hits its own tail and dies', () => {
  resetWorld();
  const s = add(new Snake(3000, 4000, 0, false));
  s.mass = 200; s.dir = 0; s.targetAngle = 0;
  for (let i = 0; i < 400; i++) step();   // grow a long straight body
  let died = false;
  for (let i = 0; i < 900; i++) {
    s.targetAngle = s.dir + 2;
    step();
    if (!s.alive) { died = true; break; }
  }
  assert.ok(died, 'once length exceeds the turning circumference, coiling is lethal');
  assert.equal(s.deathCause, 'self');
});

test('max-size snake: full-lock neck-safe early, coil-lethal late', () => {
  resetWorld();
  const s = add(new Snake(4000, 6000, 0, false));
  s.mass = 800; s.dir = 0; s.targetAngle = 0;   // hits both doubled caps
  for (let i = 0; i < 800; i++) step();
  let aliveAt100 = false, died = false;
  for (let i = 0; i < 700; i++) {
    s.targetAngle = s.dir + 2;
    step();
    if (i === 100) aliveAt100 = s.alive;
    if (!s.alive) { died = true; break; }
  }
  assert.ok(aliveAt100, 'must survive the first ~3 rad of full lock at max radius');
  assert.ok(died, 'must still die once fully coiled');
});

test('S-curve across own body kills the snake', () => {
  resetWorld();
  const s = add(new Snake(3600, 4000, 0, false));
  s.mass = 200; s.dir = 0; s.targetAngle = 0;
  const wps = [[4500, 4000], [4500, 4120], [4380, 4120], [4380, 3800]];
  let wi = 0, died = false;
  for (let i = 0; i < 2400 && wi < wps.length; i++) {
    const [wx, wy] = wps[wi];
    const dx = wx - s.x, dy = wy - s.y;
    if (dx * dx + dy * dy < 400) { wi++; continue; }
    s.targetAngle = Math.atan2(dy, dx);
    step();
    if (!s.alive) { died = true; break; }
  }
  assert.ok(died, 'crossing back over your own trail must kill');
  assert.equal(s.deathCause, 'self');
});

test('bot dies on contact with the TAIL TIP of another snake', () => {
  resetWorld();
  const p = add(new Snake(3000, 4500, 0, false));
  p.mass = 120; p.dir = 0; p.targetAngle = 0;
  for (let i = 0; i < 240; i++) step();          // lay a long straight body
  const tail = p.segs[p.segCount - 1];
  const b = add(new Snake(tail.x, tail.y - 200, 1, true));
  b.mass = 20; b.dir = Math.PI / 2; b.targetAngle = Math.PI / 2;
  let botDied = false, playerFine = true;
  for (let i = 0; i < 300; i++) {
    if (b.alive) b.update(STEP);                  // p held still: isolate tail contact
    collide();
    if (!b.alive) { botDied = true; break; }
    if (!p.alive) { playerFine = false; break; }
  }
  assert.ok(botDied, 'the tail tip is a lethal segment');
  assert.ok(playerFine, 'the struck snake is unaffected');
  assert.equal(b.deathCause, 'other');
});

test('bot dies on contact with the mid-body of another snake', () => {
  resetWorld();
  const p = add(new Snake(3000, 4500, 0, false));
  p.mass = 120; p.dir = 0; p.targetAngle = 0;
  for (let i = 0; i < 240; i++) step();
  const mid = p.segs[(p.segCount / 2) | 0];
  const b = add(new Snake(mid.x, mid.y - 200, 1, true));
  b.mass = 20; b.dir = Math.PI / 2; b.targetAngle = Math.PI / 2;
  let botDied = false;
  for (let i = 0; i < 300; i++) {
    step();
    if (!b.alive) { botDied = true; break; }
  }
  assert.ok(botDied);
  assert.equal(b.deathCause, 'other');
});

test('glancing head overlap resolves as neck hit, not mutual kill', () => {
  resetWorld();
  // Deterministic glancing setup captured from a reproducible simulation seed
  // where the current logic used to mark both snakes dead.
  const a = add(new Snake(2810.00758621609, 3909.5222437427196, 0, false));
  a.mass = 90; a.dir = -1.1075012844060366; a.targetAngle = a.dir;
  const b = add(new Snake(2782.6128772070197, 3873.482878965671, 1, true));
  b.mass = 90; b.dir = -0.6565701940111406; b.targetAngle = b.dir;

  for (let i = 0; i < 240 && a.alive && b.alive; i++) step();

  assert.ok(!a.alive, 'the trailing snake should die when clipping the other neck');
  assert.ok(b.alive, 'the leading snake should survive a glancing neck overlap');
  assert.equal(a.deathCause, 'other');
});

test('glancing behavior is stable across incident angles and size ratios', () => {
  const angles = [-25, -15, -10, 10, 15, 25];
  const ratios = [[60, 140], [90, 90], [140, 60]]; // [trailing, leading] mass
  // yOffset = angleDeg * multiplier; with ±10..25° this maps to ±30..75 world units,
  // which deterministically separates close neck clips from clear passes.
  const GLANCING_OFFSET_MULTIPLIER = 3;

  for (const [trailMass, leadMass] of ratios) {
    for (const angle of angles) {
      const nearPassResult = runGlancingCase(angle, trailMass, leadMass, -angle * GLANCING_OFFSET_MULTIPLIER);
      assert.ok(!nearPassResult.trailAlive && nearPassResult.leadAlive, `near pass should kill trailing only (angle=${angle}, ratio=${trailMass}:${leadMass})`);
      assert.equal(nearPassResult.trailCause, 'other');

      const farPassResult = runGlancingCase(angle, trailMass, leadMass, angle * GLANCING_OFFSET_MULTIPLIER);
      assert.ok(farPassResult.trailAlive && farPassResult.leadAlive, `far pass should remain no-collide (angle=${angle}, ratio=${trailMass}:${leadMass})`);
    }
  }
});
