const TALLY_MIN_DURATION = 1.5;
const TALLY_BASE_AMOUNT = 1000;
const TALLY_SCALE_POWER = Math.log(3.5 / 1.5) / Math.log(9 / 2);
const TALLY_SCALE = 1.5 / Math.pow(2, TALLY_SCALE_POWER);
const XP_DELTA_BASE = 250;
const XP_DELTA_SCALE = 29558.30495230823;
const XP_DELTA_LEVEL_SCALE = 42;
const XP_DELTA_POWER = 2.15;
const XP_ROUNDING = 50;
export const MAX_PROGRESS_VALUE = 1_000_000_000;
const LEVEL_XP_CACHE = [0];

export function normalizeProgressValue(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_PROGRESS_VALUE, Math.floor(value))) : 0;
}

function xpDeltaForLevel(level) {
  if (level <= 1) return 0;
  const n = level - 1;
  const delta = XP_DELTA_BASE + XP_DELTA_SCALE * (1 - Math.exp(-Math.pow(n / XP_DELTA_LEVEL_SCALE, XP_DELTA_POWER)));
  return Math.round(delta / XP_ROUNDING) * XP_ROUNDING;
}

export function xpForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  while (LEVEL_XP_CACHE.length < n) {
    LEVEL_XP_CACHE.push(LEVEL_XP_CACHE[LEVEL_XP_CACHE.length - 1] + xpDeltaForLevel(LEVEL_XP_CACHE.length + 1));
  }
  return LEVEL_XP_CACHE[n - 1];
}

export function levelForXp(xp) {
  const total = normalizeProgressValue(xp);
  let level = 1;
  while (total >= xpForLevel(level + 1)) level++;
  return level;
}

export function progressForXp(xp) {
  const total = normalizeProgressValue(xp);
  const level = levelForXp(total);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = total - currentLevelXp;
  const xpForNextLevel = nextLevelXp - currentLevelXp;
  return {
    level,
    totalXp: total,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    progress: xpForNextLevel > 0 ? xpIntoLevel / xpForNextLevel : 1,
  };
}

export function tallyDurationForAmount(amount) {
  const n = normalizeProgressValue(amount);
  if (n <= TALLY_BASE_AMOUNT) return TALLY_MIN_DURATION;
  return TALLY_MIN_DURATION + TALLY_SCALE * Math.pow((n - TALLY_BASE_AMOUNT) / TALLY_BASE_AMOUNT, TALLY_SCALE_POWER);
}
