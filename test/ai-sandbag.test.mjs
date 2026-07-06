import test from 'node:test';
import assert from 'node:assert/strict';
import { botSandbagForScore, botThink } from '../src/ai.js';
import { BOT_SANDBAG_MAX, BOT_SANDBAG_SCORE_CAP } from '../src/constants.js';
import { Snake } from '../src/snake.js';
import { resetWorld } from '../src/world.js';

test('bot sandbagging fades out as player score rises', () => {
  assert.equal(botSandbagForScore(0), BOT_SANDBAG_MAX);
  assert.equal(botSandbagForScore(BOT_SANDBAG_SCORE_CAP), 0);
  assert.equal(botSandbagForScore(BOT_SANDBAG_SCORE_CAP * 2), 0);
  assert.equal(botSandbagForScore(Number.NaN), BOT_SANDBAG_MAX);
});

test('sandbagged bot thinking reacts more slowly', () => {
  const oldRandom = Math.random;
  Math.random = () => 0;
  try {
    resetWorld();
    const fullStrength = new Snake(6000, 6000, 1, true);
    const sandbagged = new Snake(6000, 6000, 1, true);

    botThink(fullStrength, [fullStrength], { sandbag: 0 });
    botThink(sandbagged, [sandbagged], { sandbag: 1 });

    assert.equal(fullStrength.think, 0.12);
    assert.equal(sandbagged.think, 0.22);
  } finally {
    Math.random = oldRandom;
    resetWorld();
  }
});
