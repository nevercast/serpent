import test from 'node:test';
import assert from 'node:assert/strict';
import { installStubs } from './helpers/dom-stub.js';
import { LS_CREDITED_XP_BONUS_KEY, LS_KEY, LS_XP_KEY, START_MASS } from '../src/constants.js';
import * as world from '../src/world.js';

test('first death credits existing best score as a one-time XP bonus', async () => {
  const h = installStubs();
  h.win.localStorage.setItem(LS_KEY, '800');
  await import('../src/main.js');

  h.fireEl('playBtn', 'click', {});
  h.advance(1, 16.7);

  const player = world.getPlayer();
  player.mass = START_MASS + 1200;
  player.alive = false;
  h.advance(1, 16.7);

  assert.equal(h.win.localStorage.getItem(LS_CREDITED_XP_BONUS_KEY), 'true', 'bonus migration check is marked complete');
  assert.equal(h.win.localStorage.getItem(LS_XP_KEY), '2700', 'XP includes current score, existing best bonus, and achievement bonuses');
  assert.equal(h.els.deathImpact.textContent, '+0 KILLS', 'kills impact appears first');

  h.advance(84, 16.7);
  h.advance(25, 16.7);
  assert.equal(h.els.deathImpact.textContent, '+0 FOOD', 'food impact appears after kills');

  h.advance(110, 16.7);
  assert.equal(h.els.deathImpact.textContent, '+1500 BONUS', 'bonus impact appears after food');

  h.advance(110, 16.7);
  assert.equal(h.els.deathScoreLine.classList.contains('hidden'), false, 'score tally appears after the bonus impact');

  h.advance(520, 16.7);
  assert.equal(h.els.finalScore.textContent, '2700', 'death screen score includes one-time and achievement bonuses');
  assert.match(h.els.deathLevelText.textContent, /^REACHED LEVEL \d+$/, 'XP tally includes one-time and achievement bonuses');
});

test('bonus migration check completes without XP credit below the threshold', async () => {
  const h = installStubs();
  h.win.localStorage.setItem(LS_KEY, '500');
  await import('../src/main.js?below-threshold');

  h.fireEl('playBtn', 'click', {});
  h.advance(1, 16.7);

  const player = world.getPlayer();
  player.mass = START_MASS + 1200;
  player.alive = false;
  h.advance(1, 16.7);

  assert.equal(h.win.localStorage.getItem(LS_CREDITED_XP_BONUS_KEY), 'true', 'bonus migration check is marked complete');
  assert.equal(h.win.localStorage.getItem(LS_XP_KEY), '1900', 'XP excludes the legacy bonus at or below the threshold but includes achievements');
});
