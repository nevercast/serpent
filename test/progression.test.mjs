import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PROGRESS_VALUE, levelForXp, normalizeProgressValue,
  progressForXp, tallyDurationForAmount, xpForLevel
} from '../src/progression.js';

test('fixed early level thresholds match the progression design', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 500);
  assert.equal(xpForLevel(3), 1000);
  assert.equal(xpForLevel(4), 2500);
  assert.equal(xpForLevel(5), 5000);
  assert.equal(xpForLevel(6), 10000);
});

test('levelForXp advances only after reaching the next threshold', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(499), 1);
  assert.equal(levelForXp(500), 2);
  assert.equal(levelForXp(2499), 3);
  assert.equal(levelForXp(2500), 4);
});

test('progressForXp reports current and next level progress', () => {
  assert.deepEqual(progressForXp(750), {
    level: 2,
    totalXp: 750,
    currentLevelXp: 500,
    nextLevelXp: 1000,
    xpIntoLevel: 250,
    xpForNextLevel: 500,
    progress: 0.5,
  });
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
