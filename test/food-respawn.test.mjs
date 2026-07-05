import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENT_FOOD_RESPAWNS_PER_SEC, STEP, WORLD } from '../src/constants.js';
import { foods, spawnFood, spawnAmbientFood } from '../src/food.js';
import { resetWorld, update } from '../src/world.js';

function withRandomSequence(seq, fn, fallback = 0.5) {
  const realRandom = Math.random;
  let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : fallback);
  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}

test('ambient respawn favors sparse inner space over crowded wall samples', () => {
  resetWorld();
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) spawnFood(45 + x * 10, 45 + y * 10, 1, 4, 0);
  }

  withRandomSequence([
    (60 - 40) / (WORLD - 80), (60 - 40) / (WORLD - 80),
    0.5, 0.5
  ], () => spawnAmbientFood());

  const spawned = foods[foods.length - 1];
  assert.ok(spawned.x > WORLD * 0.4 && spawned.x < WORLD * 0.6, `expected central respawn, got x=${spawned.x}`);
  assert.ok(spawned.y > WORLD * 0.4 && spawned.y < WORLD * 0.6, `expected central respawn, got y=${spawned.y}`);
});

test('ambient respawn rate follows the configured per-second budget', () => {
  resetWorld();
  const steps = Math.round(1 / STEP);
  for (let i = 0; i < steps; i++) update(STEP);
  assert.equal(foods.length, AMBIENT_FOOD_RESPAWNS_PER_SEC);
});
