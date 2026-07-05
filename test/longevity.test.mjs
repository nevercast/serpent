// Bot-survival regression. Runs repeated 10-minute bot-only simulations through
// the real update loop and reports death-cause metrics so balance drift is
// visible in PR checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBotOnly } from './helpers/bot-sim.mjs';

test('bots report stable death-cause metrics over repeated 10 minute runs', { timeout: 180000 }, () => {
  const runs = [22, 2201, 2202].map(seed => simulateBotOnly({ seed, seconds: 600 }));
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
