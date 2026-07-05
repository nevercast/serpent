// Tests for food dropped by dead snakes. Radius is visual feedback; value is
// game balance and must not create more mass than the dead snake contributed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Snake } from '../src/snake.js';
import { foods, resetFood } from '../src/food.js';
import { MAX_RADIUS, POINT_SPACING, STEP } from '../src/constants.js';

function fillBody(s) {
  const spacing = Math.max(3.2, s.radius * 0.52);
  const targetLength = s.targetSegCount() * spacing + 80;
  const pointCount = Math.ceil(targetLength / POINT_SPACING);

  s.pts.length = 0;
  for (let i = pointCount; i >= 0; i--) {
    s.pts.push({ x: s.x - i * POINT_SPACING, y: s.y });
  }
  s.buildSegs(spacing);
}

function deathDropsForMass(mass) {
  resetFood();
  const s = new Snake(11500, 6000, 0, false);
  s.mass = mass;
  fillBody(s);
  s.die();
  return {
    segCount: s.segCount,
    radius: s.radius,
    totalValue: foods.reduce((sum, f) => sum + f.v, 0),
    foods: foods.slice(),
  };
}

function expectedDeathDropValue(mass) {
  if (mass <= 100) return mass * 0.95;
  if (mass <= 500) return mass * (0.95 - ((mass - 100) / 400) * 0.05);
  if (mass <= 1000) return mass * (0.9 - ((mass - 500) / 500) * 0.15);
  return mass * 0.75;
}

test('death food radius for minimum-size snake is at ambient-food minimum (3)', () => {
  resetFood();
  const s = new Snake(3000, 3000, 0, false);
  s.mass = 10;
  s.update(STEP);
  s.die();
  assert.ok(foods.length > 0, 'death must produce food');
  for (const f of foods) {
    assert.ok(f.r >= 3, `food radius ${f.r.toFixed(2)} must be >= ambient-food min (3)`);
    // Small snake body radius is about 7.3, so foodR target is about 3.65.
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
    // With jitter band rand(foodR*0.85, foodR*1.1) the floor is 21*0.85 = 17.85.
    assert.ok(f.r >= cap * 0.84, `max-snake food radius ${f.r.toFixed(2)} should be near cap ${cap}`);
    assert.ok(f.r <= cap * 1.11, `max-snake food radius ${f.r.toFixed(2)} must not exceed cap+jitter`);
  }
});

test('death food radius grows with the dead snake body size', () => {
  // Confirm a larger snake leaves visually larger food than a smaller one.
  resetFood();
  const small = new Snake(3000, 3000, 0, false);
  small.mass = 20;
  small.update(STEP);
  small.die();
  const smallMean = foods.reduce((sum, f) => sum + f.r, 0) / foods.length;

  resetFood();
  const big = new Snake(3000, 3000, 1, false);
  big.mass = 400;
  for (let i = 0; i < 50; i++) big.update(STEP);
  big.die();
  const bigMean = foods.reduce((sum, f) => sum + f.r, 0) / foods.length;

  assert.ok(
    bigMean > smallMean,
    `large-snake mean food radius (${bigMean.toFixed(2)}) must exceed small-snake's (${smallMean.toFixed(2)})`
  );
});

test('death food value follows the lossy mass drop curve', () => {
  for (const mass of [10, 20, 100, 300, 500, 750, 1000, 5000, 20000]) {
    const drops = deathDropsForMass(mass);
    const expected = expectedDeathDropValue(mass);
    assert.ok(drops.foods.length > 0, 'death must produce food');
    assert.equal(
      Math.round(drops.totalValue * 100) / 100,
      Math.round(expected * 100) / 100,
      `mass ${mass} should drop ${expected.toFixed(2)} value across ${drops.foods.length} pellets`
    );
  }
});

test('death food value still scales after radius and segment count are clamped', () => {
  const baseline = deathDropsForMass(1500);
  const huge = deathDropsForMass(5000);

  assert.equal(huge.radius, baseline.radius, 'test setup expects both snakes to share the radius cap');
  assert.equal(huge.segCount, baseline.segCount, 'test setup expects both snakes to share the segment cap');
  assert.ok(
    huge.totalValue > baseline.totalValue * 3,
    `5000 mass should drop much more value than 1500 mass even with clamped radius/segments: ` +
      `${huge.totalValue.toFixed(2)} vs ${baseline.totalValue.toFixed(2)}`
  );
});
