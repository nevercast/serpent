// Bot AI ablation/performance metrics. This intentionally prints comparable
// compute-time and death-cause stats for each configured navigation/avoidance
// combination so gameplay safety can be weighed against cost per tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_AVOIDANCE_MODES, BOT_NAV_MODES } from '../src/constants.js';
import { simulateBotOnly } from './helpers/bot-sim.mjs';

const CASES = [
  {
    name: 'legacy avoidance + standard nav',
    navMode: BOT_NAV_MODES.STANDARD,
    avoidanceMode: BOT_AVOIDANCE_MODES.LEGACY,
  },
  {
    name: 'predictive avoidance + standard nav',
    navMode: BOT_NAV_MODES.STANDARD,
    avoidanceMode: BOT_AVOIDANCE_MODES.PREDICTIVE,
  },
  {
    name: 'predictive every tick + standard nav',
    navMode: BOT_NAV_MODES.STANDARD,
    avoidanceMode: BOT_AVOIDANCE_MODES.PREDICTIVE_EVERY_TICK,
  },
  {
    name: 'predictive every tick + self-aware nav',
    navMode: BOT_NAV_MODES.SELF_AWARE,
    avoidanceMode: BOT_AVOIDANCE_MODES.PREDICTIVE_EVERY_TICK,
  },
];

test('bot AI modes report compute time and death-cause tradeoffs', { timeout: 90000 }, () => {
  const runs = CASES.map(config => ({
    ...config,
    result: simulateBotOnly({
      seed: 22,
      seconds: 120,
      navMode: config.navMode,
      avoidanceMode: config.avoidanceMode,
      measureTime: true,
    }),
  }));

  for (const run of runs) {
    const r = run.result;
    console.log(
      `  [ai-perf] ${run.name}: msPerTick=${r.msPerTick.toFixed(4)} ` +
      `elapsedMs=${r.elapsedMs.toFixed(1)} deaths=${r.deaths} ` +
      `causes=${JSON.stringify(r.causes)} selfShare=${r.selfShare.toFixed(2)} ` +
      `bestEver=${r.bestEver}`
    );

    assert.ok(Number.isFinite(r.msPerTick), `${run.name}: msPerTick must be finite`);
    assert.ok(r.msPerTick < 5, `${run.name}: bot AI simulation is too slow: ${r.msPerTick.toFixed(4)}ms/tick`);
    assert.ok(r.living.length > 0, `${run.name}: world should not go extinct`);
  }
});
