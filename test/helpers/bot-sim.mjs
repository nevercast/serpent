import { performance } from 'node:perf_hooks';
import { snakes, update, resetWorld, populate } from '../../src/world.js';
import { STEP } from '../../src/constants.js';

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function simulateBotOnly({ seed, seconds, navMode, avoidanceMode, measureTime = false }) {
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
    const updateOptions = { navMode, avoidanceMode };

    const start = measureTime ? performance.now() : 0;
    for (let i = 0; i < steps; i++) {
      update(STEP, updateOptions);
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
    const elapsedMs = measureTime ? performance.now() - start : 0;

    const bestEver = Math.max(...[...peak.values()].map(Math.floor));
    const living = snakes.filter(s => s.alive).map(s => Math.floor(s.mass)).sort((a, b) => b - a);
    const selfShare = deaths.length ? (causes.self || 0) / deaths.length : 0;

    return {
      seed,
      seconds,
      steps,
      deaths: deaths.length,
      causes,
      bestEver,
      living,
      selfShare,
      elapsedMs,
      msPerTick: measureTime ? elapsedMs / steps : 0,
    };
  } finally {
    Math.random = oldRandom;
    resetWorld();
  }
}
