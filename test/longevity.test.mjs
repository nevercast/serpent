// Bot-survival regression. Runs repeated 10-minute bot-only simulations through
// the real update loop and reports death-cause metrics so balance drift is
// visible in PR checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snakes, update, resetWorld, populate } from '../src/world.js';
import { STEP } from '../src/constants.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulateBotOnly(seed, seconds) {
  const oldRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    resetWorld();
    populate();

    const steps = Math.round(seconds / STEP);
    const peak = new Map();
    const tracked = new Set();
    const deaths = [];
    const causes = {};

    for (let i = 0; i < steps; i++) {
      update(STEP);
      for (const s of snakes) {
        tracked.add(s);
        const p = peak.get(s) || 0;
        if (s.mass > p) peak.set(s, s.mass);
      }
      for (const t of tracked) {
        if (!t.alive) {
          deaths.push(Math.floor(peak.get(t) || 0));
          causes[t.deathCause || '?'] = (causes[t.deathCause || '?'] || 0) + 1;
          tracked.delete(t);
        }
      }
    }

    const bestEver = Math.max(...[...peak.values()].map(Math.floor));
    const living = snakes.filter(s => s.alive).map(s => Math.floor(s.mass)).sort((a, b) => b - a);
    const selfShare = deaths.length ? (causes.self || 0) / deaths.length : 0;

    return { seed, deaths: deaths.length, causes, bestEver, living, selfShare };
  } finally {
    Math.random = oldRandom;
    resetWorld();
  }
}

test('bots report stable death-cause metrics over repeated 10 minute runs', { timeout: 120000 }, () => {
  const runs = [22, 2201, 2202].map(seed => simulateBotOnly(seed, 600));
  const aggregate = { deaths: 0, self: 0, wall: 0 };

  for (const run of runs) {
    aggregate.deaths += run.deaths;
    aggregate.self += run.causes.self || 0;
    aggregate.wall += run.causes.wall || 0;
    console.log(
      `  [longevity seed=${run.seed}] deaths=${run.deaths} causes=${JSON.stringify(run.causes)} ` +
      `selfShare=${run.selfShare.toFixed(2)} bestEver=${run.bestEver} ` +
      `topLiving=[${run.living.slice(0, 8).join(', ')}]`
    );

    assert.ok(run.living.length > 0, `seed ${run.seed}: world should not go extinct`);
    assert.ok(run.bestEver > 150, `seed ${run.seed}: some bot should exceed mass 150 (got ${run.bestEver})`);
    assert.ok(run.selfShare < 0.1, `seed ${run.seed}: self-collision share too high: ${run.selfShare.toFixed(2)}`);
  }

  const aggregateSelfShare = aggregate.deaths ? aggregate.self / aggregate.deaths : 0;
  console.log(
    `  [longevity aggregate] deaths=${aggregate.deaths} ` +
    `self=${aggregate.self} wall=${aggregate.wall} selfShare=${aggregateSelfShare.toFixed(2)}`
  );

  assert.ok(aggregateSelfShare < 0.1, `aggregate self-collision share too high: ${aggregateSelfShare.toFixed(2)}`);
});
