// Pause-state tests: world exportState/importState round-trip and localStorage key.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as world from '../src/world.js';
import {
  LS_CREDITED_XP_BONUS_KEY, LS_GAMES_PLAYED_KEY, LS_PAUSE_KEY,
  LS_TOTAL_FOOD_KEY, LS_TOTAL_KILLS_KEY, LS_XP_KEY
} from '../src/constants.js';

test('LS_PAUSE_KEY is defined and distinct from the best-score key', () => {
  assert.equal(typeof LS_PAUSE_KEY, 'string');
  assert.ok(LS_PAUSE_KEY.length > 0);
  assert.notEqual(LS_PAUSE_KEY, 'neon-serpent-best');
});

test('lifetime progression storage keys are defined and distinct', () => {
  const keys = [LS_GAMES_PLAYED_KEY, LS_TOTAL_KILLS_KEY, LS_TOTAL_FOOD_KEY, LS_XP_KEY, LS_CREDITED_XP_BONUS_KEY];
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) {
    assert.equal(typeof key, 'string');
    assert.ok(key.startsWith('neon-serpent-'));
    assert.notEqual(key, LS_PAUSE_KEY);
  }
});

test('exportState / importState round-trips the world without mutation', () => {
  world.resetWorld();
  world.populate();
  world.spawnPlayer();

  // Run a few ticks so the state is non-trivial (snake has moved, food eaten, etc.)
  for (let i = 0; i < 120; i++) world.update(1 / 60);

  const snap = world.exportState();

  const playerBefore = world.getPlayer();
  assert.ok(playerBefore, 'player exists before export');
  const massBefore = playerBefore.mass;
  const xBefore = playerBefore.x;
  const yBefore = playerBefore.y;
  const snakeCountBefore = snap.snakes.length;
  const foodBefore = world.getPlayerFoodCount();

  // Import back and verify the state is faithfully restored
  world.importState(snap);

  const playerAfter = world.getPlayer();
  assert.ok(playerAfter, 'player restored after import');
  assert.ok(Math.abs(playerAfter.mass - massBefore) < 0.0001, 'player mass preserved');
  assert.ok(Math.abs(playerAfter.x - xBefore) < 0.0001, 'player x preserved');
  assert.ok(Math.abs(playerAfter.y - yBefore) < 0.0001, 'player y preserved');
  assert.equal(world.exportState().snakes.length, snakeCountBefore, 'snake count preserved');
  assert.equal(world.getPlayerFoodCount(), foodBefore, 'player food count preserved');

  world.resetWorld();
});

test('importState allows the game to continue ticking after restore', () => {
  world.resetWorld();
  world.populate();
  world.spawnPlayer();

  for (let i = 0; i < 30; i++) world.update(1 / 60);

  const snap = world.exportState();
  world.importState(snap);

  // Should not throw when stepping the simulation post-restore
  assert.doesNotThrow(() => {
    for (let i = 0; i < 30; i++) world.update(1 / 60);
  });

  world.resetWorld();
});
