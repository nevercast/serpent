import { LS_ACHIEVEMENTS_KEY } from './constants.js';

export const ACHIEVEMENT_TIERS = Object.freeze({
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
});

export const TIER_BONUSES = Object.freeze({
  [ACHIEVEMENT_TIERS.BRONZE]: 100,
  [ACHIEVEMENT_TIERS.SILVER]: 500,
  [ACHIEVEMENT_TIERS.GOLD]: 1000,
});

export const achievements = Object.freeze([
  {
    id: 'stretch',
    title: 'STRETCH',
    description: 'Push your score beyond familiar limits.',
    hidden: false,
    tiers: [
      { id: 'stretch_1000', tier: ACHIEVEMENT_TIERS.BRONZE, threshold: 1000, metric: 'score' },
      { id: 'stretch_2500', tier: ACHIEVEMENT_TIERS.SILVER, threshold: 2500, metric: 'score' },
      { id: 'stretch_5000', tier: ACHIEVEMENT_TIERS.GOLD, threshold: 5000, metric: 'score' },
    ],
  },
  {
    id: 'forager',
    title: 'FORAGER',
    description: 'Draw power from the field.',
    hidden: false,
    tiers: [
      { id: 'forager_100', tier: ACHIEVEMENT_TIERS.BRONZE, threshold: 100, metric: 'food' },
      { id: 'forager_200', tier: ACHIEVEMENT_TIERS.SILVER, threshold: 200, metric: 'food' },
      { id: 'forager_500', tier: ACHIEVEMENT_TIERS.GOLD, threshold: 500, metric: 'food' },
    ],
  },
  {
    id: 'pacifist',
    title: 'PACIFIST',
    description: 'Become dangerous without making enemies.',
    hidden: false,
    tiers: [
      { id: 'pacifist_500', tier: ACHIEVEMENT_TIERS.BRONZE, threshold: 500, metric: 'pacifistScore' },
      { id: 'pacifist_1000', tier: ACHIEVEMENT_TIERS.SILVER, threshold: 1000, metric: 'pacifistScore' },
      { id: 'pacifist_2500', tier: ACHIEVEMENT_TIERS.GOLD, threshold: 2500, metric: 'pacifistScore' },
    ],
  },
  {
    id: 'serpent_hunter',
    title: 'SERPENT HUNTER',
    description: 'Let rivals break against your trail.',
    hidden: false,
    tiers: [
      { id: 'serpent_hunter_10', tier: ACHIEVEMENT_TIERS.BRONZE, threshold: 10, metric: 'kills' },
      { id: 'serpent_hunter_25', tier: ACHIEVEMENT_TIERS.SILVER, threshold: 25, metric: 'kills' },
      { id: 'serpent_hunter_50', tier: ACHIEVEMENT_TIERS.GOLD, threshold: 50, metric: 'kills' },
    ],
  },
]);

export function allAchievementTierIds() {
  return achievements.flatMap(achievement => achievement.tiers.map(tier => tier.id));
}

export function totalAchievementTiers() {
  return allAchievementTierIds().length;
}

export function tierBonus(tier) {
  return TIER_BONUSES[tier] ?? 0;
}

function metricValue(summary, metric) {
  if (metric === 'pacifistScore') return summary.kills === 0 ? summary.score : 0;
  return summary[metric] ?? 0;
}

export function evaluateAchievements(summary, completedIds) {
  const completed = new Set(completedIds);
  const unlocked = [];
  for (const achievement of achievements) {
    for (const tier of achievement.tiers) {
      if (completed.has(tier.id)) continue;
      if (metricValue(summary, tier.metric) >= tier.threshold) {
        unlocked.push({
          achievementId: achievement.id,
          achievementTitle: achievement.title,
          tierId: tier.id,
          tier: tier.tier,
          bonus: tierBonus(tier.tier),
        });
      }
    }
  }
  return unlocked;
}

export function achievementBonus(unlocked) {
  return unlocked.reduce((sum, item) => sum + item.bonus, 0);
}

export function readCompletedAchievements(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(LS_ACHIEVEMENTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(allAchievementTierIds());
    return [...new Set(parsed.filter(id => valid.has(id)))];
  } catch (e) {
    return [];
  }
}

export function saveCompletedAchievements(completedIds, storage = globalThis.localStorage) {
  try {
    const valid = new Set(allAchievementTierIds());
    const clean = [...new Set(completedIds.filter(id => valid.has(id)))];
    storage.setItem(LS_ACHIEVEMENTS_KEY, JSON.stringify(clean));
  } catch (e) {}
}

export function mergeCompletedAchievements(completedIds, unlocked) {
  return [...new Set([...completedIds, ...unlocked.map(item => item.tierId)])];
}
