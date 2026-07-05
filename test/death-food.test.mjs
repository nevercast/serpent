// Tests that food dropped by a dead snake visually scales with the dead
// snake's body radius, giving a visual indication of how long the trail was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { foods, resetFood } from '../src/food.js';
import { MAX_RADIUS, STEP } from '../src/constants.js';

test('death food radius for minimum-size snake is at ambient-food minimum (3)', () => {
  resetFood();
  const s = new Snake(3000, 3000, 0, false);
  s.mass = 10;
  s.update(STEP);
  s.die();
  assert.ok(foods.length > 0, 'death must produce food');
  for (const f of foods) {
    assert.ok(f.r >= 3, `food radius ${f.r.toFixed(2)} must be >= ambient-food min (3)`);
    // Small snake body radius ~7.3, so foodR target = ~3.65; with ±jitter max ≈4.0
    assert.ok(f.r < 5, `small-snake food radius ${f.r.toFixed(2)} should be near ambient min`);
  }
});

test('death food radius for max-size snake is near MAX_RADIUS/2 cap', () => {
  resetFood();
  const s = new Snake(3000, 3000, 1, false);
  s.mass = 5000;   // far exceeds the radius cap
  for (let i = 0; i < 50; i++) s.update(STEP);
  s.die();
  assert.ok(foods.length > 0, 'death must produce food');
  const cap = MAX_RADIUS / 2;   // 21
  for (const f of foods) {
    // With jitter band rand(foodR*0.85, foodR*1.1) the floor is 21*0.85 = 17.85
    assert.ok(f.r >= cap * 0.84, `max-snake food radius ${f.r.toFixed(2)} should be near cap ${cap}`);
    assert.ok(f.r <= cap * 1.11, `max-snake food radius ${f.r.toFixed(2)} must not exceed cap+jitter`);
  }
});

test('death food v and r are consistent via the density formula r = 3·sqrt(v)', () => {
  resetFood();
  const s = new Snake(3000, 3000, 0, false);
  s.mass = 100;
  for (let i = 0; i < 50; i++) s.update(STEP);
  s.die();
  assert.ok(foods.length > 0, 'death must produce food');
  for (const f of foods) {
    // The formula r = 3*sqrt(v) must hold within the jitter band [*0.85, *1.1]
    const rFromV = 3 * Math.sqrt(f.v);
    assert.ok(
      f.r >= rFromV * 0.84 && f.r <= rFromV * 1.11,
      `food v=${f.v.toFixed(2)} r=${f.r.toFixed(2)} expected r≈${rFromV.toFixed(2)}`
    );
  }
});

test('death food radius grows with the dead snake body size', () => {
  // Confirm a larger snake leaves visually larger food than a smaller one.
  resetFood();
  const small = new Snake(3000, 3000, 0, false);
  small.mass = 20;
  small.update(STEP);
  small.die();
  const smallMean = foods.reduce((s, f) => s + f.r, 0) / foods.length;

  resetFood();
  const big = new Snake(3000, 3000, 1, false);
  big.mass = 400;
  for (let i = 0; i < 50; i++) big.update(STEP);
  big.die();
  const bigMean = foods.reduce((s, f) => s + f.r, 0) / foods.length;

  assert.ok(bigMean > smallMean,
    `large-snake mean food radius (${bigMean.toFixed(2)}) must exceed small-snake's (${smallMean.toFixed(2)})`);
});
