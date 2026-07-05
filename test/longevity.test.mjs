// Bot-survival regression. Runs the real update loop for 5 simulated minutes and
// checks bots actually thrive rather than spiralling into their own tails. Prints
// a stats line each run so balance drift is visible in test output. Bounds are
// deliberately loose because the sim is stochastic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { snakes, update, resetWorld, populate } from '../src/world.js';
import { STEP } from '../src/constants.js';

test('bots survive and grow over 10 simulated minutes', () => {
  resetWorld();
  populate();

  // Long enough that the death-cause counts stop being small-sample noise
  // (a 5-minute window can land on as few as 4-5 deaths total, at which
  // point one unlucky run trivially swings the self-collision share to 1.0).
  const steps = Math.round(600 / STEP);
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

  console.log(
    `  [longevity] deaths=${deaths.length} causes=${JSON.stringify(causes)} ` +
    `bestEver=${bestEver} topLiving=[${living.slice(0, 8).join(', ')}]`
  );

  assert.ok(snakes.some(s => s.alive), 'world should not go extinct');
  assert.ok(bestEver > 150, `some bot should exceed mass 150 (got ${bestEver})`);
  // Once traffic avoidance is working, surviving bots keep growing until
  // self-coiling is what eventually gets them — self naturally becomes the
  // *majority* cause over a long enough run. This just guards against a
  // total breakdown of the self-collision escape logic.
  assert.ok(selfShare < 0.9, `self-collision share too high: ${selfShare.toFixed(2)}`);
});
