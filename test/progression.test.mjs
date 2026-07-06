import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROGRESS_VALUE, levelForXp, normalizeProgressValue,
  progressForXp, tallyDurationForAmount, xpForLevel
} from '../src/progression.js';

test('level thresholds match the rebalanced progression design', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 250);
  assert.equal(xpForLevel(3), 550);
  assert.equal(xpForLevel(4), 900);
  assert.equal(xpForLevel(5), 1350);
  assert.equal(xpForLevel(10), 5800);
  assert.equal(xpForLevel(50), 467050);
  assert.equal(xpForLevel(100), 1866600);
});

test('levelForXp advances only after reaching the next threshold', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(249), 1);
  assert.equal(levelForXp(250), 2);
  assert.equal(levelForXp(899), 3);
  assert.equal(levelForXp(900), 4);
});

test('progressForXp reports current and next level progress', () => {
  assert.deepEqual(progressForXp(400), {
    level: 2,
    totalXp: 400,
    currentLevelXp: 250,
    nextLevelXp: 550,
    xpIntoLevel: 150,
    xpForNextLevel: 300,
    progress: 0.5,
  });
});

test('level deltas get harder then flatten out', () => {
  const delta = level => xpForLevel(level) - xpForLevel(level - 1);
  assert.ok(delta(20) > delta(10));
  assert.ok(delta(50) > delta(20));
  assert.ok(delta(100) >= 29500);
  assert.ok(delta(100) <= 30000);
  assert.ok(delta(100) - delta(90) < 250);
});

test('progression helpers reject non-finite values', () => {
  assert.equal(levelForXp(Infinity), 1);
  assert.equal(levelForXp(NaN), 1);
  assert.deepEqual(progressForXp(Infinity), progressForXp(0));
  assert.equal(tallyDurationForAmount(Infinity), tallyDurationForAmount(0));
});

test('progression helpers clamp finite values to the maximum progression value', () => {
  assert.equal(normalizeProgressValue(-1), 0);
  assert.equal(normalizeProgressValue(MAX_PROGRESS_VALUE + 1), MAX_PROGRESS_VALUE);
  assert.equal(progressForXp(MAX_PROGRESS_VALUE + 1).totalXp, MAX_PROGRESS_VALUE);
  assert.equal(tallyDurationForAmount(MAX_PROGRESS_VALUE + 1), tallyDurationForAmount(MAX_PROGRESS_VALUE));
});

test('tallyDurationForAmount keeps small results readable and scales large totals', () => {
  assert.equal(tallyDurationForAmount(100), 1.5);
  assert.equal(tallyDurationForAmount(500), 1.5);
  assert.equal(tallyDurationForAmount(1000), 1.5);
  assert.ok(Math.abs(tallyDurationForAmount(3000) - 3) < 0.05);
  assert.ok(Math.abs(tallyDurationForAmount(10000) - 5) < 0.05);
});
