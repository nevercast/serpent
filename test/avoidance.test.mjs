// Bot-vs-bot avoidance regression: two bots closing head-on must curve apart
// instead of both dying in the same collision. Mirrors world.js's real bot
// update loop (reflexes every tick, slow think cadence for food/wander) over
// a deterministic, perfectly symmetric approach — the exact configuration
// that broke the old escape-vector math and the old think-gated reaction time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { snakes, collide, resetWorld } from '../src/world.js';
import { botThink, avoidWall, avoidTraffic, guardSelfCollision } from '../src/ai.js';
import { STEP } from '../src/constants.js';

function add(s) { snakes.push(s); return s; }
function step() {
  for (const s of snakes) {
    if (s.alive && s.bot) {
      const nearWall = avoidWall(s);
      const evading = !nearWall && avoidTraffic(s, snakes);
      s.think -= STEP;
      if (!nearWall && !evading && s.think <= 0) botThink(s);
      guardSelfCollision(s);
    }
    if (s.alive) s.update(STEP);
  }
  collide();
}

test('two bots approaching head-on curve apart instead of colliding', () => {
  resetWorld();
  const a = add(new Snake(4000, 4000, 0, true));
  a.mass = 30; a.dir = 0; a.targetAngle = 0; a.wander = 0; a.think = 0;
  const b = add(new Snake(4800, 4000, 1, true));
  b.mass = 30; b.dir = Math.PI; b.targetAngle = Math.PI; b.wander = Math.PI; b.think = 0;

  let bothDied = false;
  for (let i = 0; i < 600 && a.alive && b.alive; i++) step();
  if (!a.alive && !b.alive) bothDied = true;

  assert.ok(!bothDied, 'both bots died in the same head-on encounter');
  assert.ok(a.alive && b.alive, 'both bots should dodge a direct head-on approach');
});
