const FIXED_LEVEL_XP = [0, 500, 1000, 2500, 5000, 10000];
const TALLY_MIN_DURATION = 1.5;
const TALLY_BASE_AMOUNT = 1000;
const TALLY_SCALE_POWER = Math.log(3.5 / 1.5) / Math.log(9 / 2);
const TALLY_SCALE = 1.5 / Math.pow(2, TALLY_SCALE_POWER);

export function xpForLevel(level) {
  const n = Math.max(1, Math.floor(level));
  if (n <= FIXED_LEVEL_XP.length) return FIXED_LEVEL_XP[n - 1];
  return Math.round((FIXED_LEVEL_XP[FIXED_LEVEL_XP.length - 1] * Math.pow(1.7, n - FIXED_LEVEL_XP.length)) / 100) * 100;
}

export function levelForXp(xp) {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (total >= xpForLevel(level + 1)) level++;
  return level;
}

export function progressForXp(xp) {
  const total = Math.max(0, Math.floor(xp));
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
  const n = Math.max(0, Math.floor(amount));
  if (n <= TALLY_BASE_AMOUNT) return TALLY_MIN_DURATION;
  return TALLY_MIN_DURATION + TALLY_SCALE * Math.pow((n - TALLY_BASE_AMOUNT) / TALLY_BASE_AMOUNT, TALLY_SCALE_POWER);
}
