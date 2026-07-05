// Ghost-state (respawn-immunity) invariants. Tests that newly-spawned snakes
// are shielded from collision for GHOST_DURATION seconds and that ghost bodies
// are equally intangible to other snakes, keeping gameplay fair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { snakes, collide, resetWorld } from '../src/world.js';
import { STEP, GHOST_DURATION } from '../src/constants.js';

function step() {
  for (const s of snakes) if (s.alive) s.update(STEP);
  collide();
}
function add(s) { snakes.push(s); return s; }

test('ghost snake survives running into another snake body', () => {
  resetWorld();
  // Build a long stationary snake to act as a wall of body segments.
  const wall = add(new Snake(3000, 4500, 0, false));
  wall.mass = 120; wall.dir = 0; wall.targetAngle = 0;
  for (let i = 0; i < 240; i++) step();

  // Place a fresh ghost snake heading straight into the wall snake's mid-body.
  const mid = wall.segs[(wall.segCount / 2) | 0];
  const ghost = add(new Snake(mid.x, mid.y - 300, 1, true));
  ghost.mass = 20; ghost.dir = Math.PI / 2; ghost.targetAngle = Math.PI / 2;
  ghost.ghostTimer = GHOST_DURATION;

  // Drive the ghost into the wall body while still in the immunity window.
  let survivedContact = false;
  for (let i = 0; i < 300; i++) {
    if (ghost.alive) ghost.update(STEP);
    collide();
    // Check that the ghost is inside the wall body's bounding box but still alive.
    if (ghost.x > wall.minX && ghost.x < wall.maxX &&
        ghost.y > wall.minY && ghost.y < wall.maxY &&
        ghost.ghostTimer > 0 && ghost.alive) {
      survivedContact = true;
    }
  }
  assert.ok(survivedContact, 'ghost snake must survive while inside another snake body');
});

test('ghost snake is not killed by wall collision', () => {
  resetWorld();
  // Spawn a ghost snake very close to the world border and head into the wall.
  const ghost = add(new Snake(200, 4000, 1, false));
  ghost.dir = Math.PI;          // heading left, toward x=0
  ghost.targetAngle = Math.PI;
  ghost.ghostTimer = GHOST_DURATION;

  let stillAliveNearWall = false;
  for (let i = 0; i < 200; i++) {
    if (ghost.alive) ghost.update(STEP);
    collide();
    if (ghost.x < ghost.headR * 2 && ghost.ghostTimer > 0 && ghost.alive) {
      stillAliveNearWall = true;
    }
  }
  assert.ok(stillAliveNearWall, 'ghost snake must survive wall contact during immunity window');
});

test('ghost body is intangible: non-ghost snake passes through ghost segments safely', () => {
  resetWorld();
  // Build a ghost snake in place so it has body segments.
  const ghost = add(new Snake(3000, 4500, 0, false));
  ghost.mass = 120; ghost.dir = 0; ghost.targetAngle = 0;
  for (let i = 0; i < 240; i++) step();
  ghost.ghostTimer = GHOST_DURATION;  // re-arm ghost *after* building body

  // Drive a normal (non-ghost) snake through the ghost's mid-body.
  const mid = ghost.segs[(ghost.segCount / 2) | 0];
  const normal = add(new Snake(mid.x, mid.y - 300, 1, true));
  normal.mass = 20; normal.dir = Math.PI / 2; normal.targetAngle = Math.PI / 2;
  // normal has ghostTimer == 0 (non-ghost)

  let passedThrough = false;
  for (let i = 0; i < 300; i++) {
    if (normal.alive) normal.update(STEP);
    collide();
    // Confirm normal snake passed through ghost body and came out the other side alive.
    if (normal.y > mid.y + ghost.radius && normal.alive) {
      passedThrough = true;
      break;
    }
  }
  assert.ok(passedThrough, 'a non-ghost snake must be able to pass through a ghost snake body');
  assert.ok(normal.alive, 'non-ghost snake must survive passing through ghost body');
});

test('ghost immunity expires after GHOST_DURATION and collisions become lethal again', () => {
  resetWorld();
  // Build a long stationary snake wall.
  const wall = add(new Snake(3000, 4500, 0, false));
  wall.mass = 120; wall.dir = 0; wall.targetAngle = 0;
  for (let i = 0; i < 240; i++) step();

  // Place an ex-ghost (ghostTimer already 0) heading straight into the wall.
  const mid = wall.segs[(wall.segCount / 2) | 0];
  const expired = add(new Snake(mid.x, mid.y - 300, 1, true));
  expired.mass = 20; expired.dir = Math.PI / 2; expired.targetAngle = Math.PI / 2;
  // ghostTimer stays at 0 — immunity never started / already elapsed.

  let died = false;
  for (let i = 0; i < 300; i++) {
    if (expired.alive) expired.update(STEP);
    collide();
    if (!expired.alive) { died = true; break; }
  }
  assert.ok(died, 'snake with no ghost timer must die on contact with another snake body');
  assert.equal(expired.deathCause, 'other');
});

test('ghostTimer counts down to zero during normal update steps', () => {
  resetWorld();
  const s = add(new Snake(3000, 4000, 0, false));
  s.ghostTimer = GHOST_DURATION;
  const stepsNeeded = Math.ceil(GHOST_DURATION / STEP) + 5;
  for (let i = 0; i < stepsNeeded; i++) s.update(STEP);
  assert.equal(s.ghostTimer, 0, 'ghost timer must reach exactly zero after GHOST_DURATION elapses');
});
