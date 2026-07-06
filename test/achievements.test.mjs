import test from 'node:test';
import assert from 'node:assert/strict';
import {
  achievementBonus, evaluateAchievements, mergeCompletedAchievements,
  readCompletedAchievements, saveCompletedAchievements
} from '../src/achievements.js';
import { LS_ACHIEVEMENTS_KEY } from '../src/constants.js';

function storageStub() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

test('achievement evaluation unlocks every newly crossed tier once', () => {
  const first = evaluateAchievements({ score: 2600, kills: 0, food: 220 }, []);
  assert.deepEqual(first.map(item => item.tierId), [
    'growth_spurt_1000',
    'growth_spurt_2500',
    'forager_100',
    'forager_200',
    'pacifist_growth_500',
    'pacifist_growth_1000',
    'pacifist_growth_2500',
  ]);
  assert.equal(achievementBonus(first), 2800);

  const completed = mergeCompletedAchievements([], first);
  const second = evaluateAchievements({ score: 2600, kills: 0, food: 220 }, completed);
  assert.deepEqual(second, []);
});

test('pacifist tiers require a zero-kill game', () => {
  const unlocked = evaluateAchievements({ score: 2600, kills: 1, food: 0 }, []);
  assert.deepEqual(unlocked.map(item => item.tierId), [
    'growth_spurt_1000',
    'growth_spurt_2500',
  ]);
});

test('achievement storage keeps only known tier ids', () => {
  const storage = storageStub();
  storage.setItem(LS_ACHIEVEMENTS_KEY, JSON.stringify(['forager_100', 'unknown_tier', 'forager_100']));
  assert.deepEqual(readCompletedAchievements(storage), ['forager_100']);

  saveCompletedAchievements(['forager_100', 'missing'], storage);
  assert.deepEqual(JSON.parse(storage.getItem(LS_ACHIEVEMENTS_KEY)), ['forager_100']);
});
