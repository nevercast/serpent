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
