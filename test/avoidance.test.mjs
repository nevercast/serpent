// Bot-vs-bot avoidance regression: two bots closing head-on must curve apart
// instead of both dying in the same collision. Drives the real botThink +
// Snake.update + collide loop over a deterministic, perfectly symmetric
// approach — the exact configuration that broke the old escape-vector math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { snakes, collide, resetWorld } from '../src/world.js';
import { botThink } from '../src/ai.js';
import { STEP } from '../src/constants.js';

function add(s) { snakes.push(s); return s; }
function step() {
  for (const s of snakes) {
    if (s.alive && s.bot) { s.think -= STEP; if (s.think <= 0) botThink(s, snakes); }
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
