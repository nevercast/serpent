// Entry point. Wires the DOM, owns the menu/play/dead/paused state machine and the
// high score, and runs the main loop: fixed-timestep simulation (deterministic
// across 60/120/144Hz) with a render every animation frame.
import {
  STEP, LS_KEY, LS_BEST_KILLS_KEY, LS_PAUSE_KEY, LS_GAMES_PLAYED_KEY,
  LS_TOTAL_KILLS_KEY, LS_TOTAL_FOOD_KEY, LS_XP_KEY, LS_CREDITED_XP_BONUS_KEY,
  MIN_BOOST_MASS, START_MASS
} from './constants.js';
import * as world from './world.js';
import * as input from './input.js';
import * as view from './view.js';
import { render, snapCamera } from './render.js';
import { popPlayerHits, getPlayerKillCount, getPlayerFoodCount } from './world.js';
import { normalizeProgressValue, progressForXp, tallyDurationForAmount } from './progression.js';
import {
  achievements, achievementBonus, evaluateAchievements, mergeCompletedAchievements,
  readCompletedAchievements, saveCompletedAchievements, tierBonus, totalAchievementTiers
} from './achievements.js';
import './sprites.js';                 // build glow sprites at load

const el = id => document.getElementById(id);
const hudEl = el('hud');
const scoreEl = el('score'), bestEl = el('best');
const killsEl = el('kills'), killsLineEl = el('killsLine');
const finalEl = el('finalScore');
const deathImpactEl = el('deathImpact'), deathScoreLineEl = el('deathScoreLine');
const deathXpPanelEl = el('deathXpPanel'), deathXpFillEl = el('deathXpFill'), deathLevelTextEl = el('deathLevelText');
const deadActionsEl = el('deadActions');
const menuEl = el('menu'), profileEl = el('profile'), deadEl = el('dead'), pauseEl = el('pause');
const playBtn = el('playBtn'), menuResumeBtn = el('menuResumeBtn'), profileBtn = el('profileBtn');
const profileBackBtn = el('profileBackBtn'), respawnBtn = el('respawnBtn'), deadMenuBtn = el('deadMenuBtn');
const pauseBtn = el('pauseBtn'), resumeBtn = el('resumeBtn'), returnMenuBtn = el('returnMenuBtn');
const hitFlashEl = el('hitFlash');
const boostBtnEl = el('boostBtn'), stickEl = el('stick');
const gamesPlayedEl = el('gamesPlayed'), totalKillsEl = el('totalKills'), totalFoodEl = el('totalFood');
const menuBestScoreEl = el('menuBestScore'), menuBestKillsEl = el('menuBestKills');
const playerLevelEl = el('playerLevel'), nextLevelEl = el('nextLevel'), xpProgressEl = el('xpProgress'), xpFillEl = el('xpFill');
const profilePlayerLevelEl = el('profilePlayerLevel'), profileNextLevelEl = el('profileNextLevel');
const profileXpProgressEl = el('profileXpProgress'), profileXpFillEl = el('profileXpFill');
const achievementSummaryEl = el('achievementSummary'), achievementListEl = el('achievementList');

playBtn.textContent = 'NEW GAME';
respawnBtn.textContent = 'NEW GAME';

const G = { mode: 'menu' };            // 'menu' | 'profile' | 'play' | 'dead' | 'paused'
let lastScore = -1;
let lastKills = -1;
let savedPauseState = null;
let deathSequence = null;

const DEATH_KILLS_HOLD = 1.5;
const DEATH_FOOD_HOLD = 1.5;
const DEATH_BONUS_HOLD = 1.5;
const DEATH_DROP_TIME = 0.28;
const DEATH_LEVEL_UP_HOLD = 0.72;
const DEATH_FINAL_DELAY = 0.7;

function readStoredInt(key) {
  try {
    const value = Number(localStorage.getItem(key) || 0);
    return normalizeProgressValue(value);
  } catch (e) {
    return 0;
  }
}

function saveStoredInt(key, value) {
  try {
    localStorage.setItem(key, String(normalizeProgressValue(value)));
  } catch (e) {}
}

function readStoredBool(key) {
  try { return localStorage.getItem(key) === 'true'; } catch (e) { return false; }
}

function saveStoredBool(key, value) {
  try { localStorage.setItem(key, value ? 'true' : 'false'); } catch (e) {}
}

let best = readStoredInt(LS_KEY);
const xpBonusBest = best;
let bestKills = readStoredInt(LS_BEST_KILLS_KEY);
let gamesPlayed = readStoredInt(LS_GAMES_PLAYED_KEY);
let totalKills = readStoredInt(LS_TOTAL_KILLS_KEY);
let totalFood = readStoredInt(LS_TOTAL_FOOD_KEY);
let xp = readStoredInt(LS_XP_KEY);
let creditedXpBonus = readStoredBool(LS_CREDITED_XP_BONUS_KEY);
let completedAchievements = readCompletedAchievements();

function saveBest() { saveStoredInt(LS_KEY, best); }
function saveBestKills() { saveStoredInt(LS_BEST_KILLS_KEY, bestKills); }
function saveCreditedXpBonus() { saveStoredBool(LS_CREDITED_XP_BONUS_KEY, creditedXpBonus); }
function saveLifetimeStats() {
  saveStoredInt(LS_GAMES_PLAYED_KEY, gamesPlayed);
  saveStoredInt(LS_TOTAL_KILLS_KEY, totalKills);
  saveStoredInt(LS_TOTAL_FOOD_KEY, totalFood);
  saveStoredInt(LS_XP_KEY, xp);
}
// Request persistent storage so the browser won't evict our high score under
// storage pressure. localStorage remains the storage medium; persistence just
// upgrades the quota bucket from "best effort" to "persistent".
try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch (e) {}

function preventPageZoomGestures() {
  let lastTouchEndAt = 0;
  document.addEventListener('touchend', e => {
    const now = performance.now();
    if (now - lastTouchEndAt < 350) e.preventDefault();
    lastTouchEndAt = now;
  }, { passive: false });
  window.addEventListener('gesturestart', e => e.preventDefault());
}

function refreshSavedPauseState() {
  savedPauseState = null;
  try {
    const raw = localStorage.getItem(LS_PAUSE_KEY);
    if (raw) savedPauseState = JSON.parse(raw);
  } catch (e) {
    savedPauseState = null;
  }
}

function clearPauseState() {
  savedPauseState = null;
  try { localStorage.removeItem(LS_PAUSE_KEY); } catch (e) {}
}

function scoreForMass(mass) { return normalizeProgressValue(mass - START_MASS); }

function setGameUiVisible(visible) {
  hudEl.classList.toggle('hidden', !visible);
  boostBtnEl.classList.toggle('hidden', !visible);
  stickEl.classList.toggle('hidden', !visible);
}

function updateBestText() {
  bestEl.textContent = best;
  menuBestScoreEl.textContent = best;
  menuBestKillsEl.textContent = bestKills;
}

function updateXpPanel(levelEl, progressEl, fillEl, nextEl) {
  const prog = progressForXp(xp);
  levelEl.textContent = `LEVEL ${prog.level}`;
  nextEl.textContent = `+${prog.xpForNextLevel - prog.xpIntoLevel} XP TO REACH LEVEL ${prog.level + 1}`;
  progressEl.textContent = `${prog.xpIntoLevel} / ${prog.xpForNextLevel} XP`;
  fillEl.style.width = `${Math.max(0, Math.min(1, prog.progress)) * 100}%`;
}

function updateMenuStats() {
  updateXpPanel(playerLevelEl, xpProgressEl, xpFillEl, nextLevelEl);
  menuResumeBtn.classList.toggle('hidden', !savedPauseState);
  menuResumeBtn.classList.toggle('btn-secondary', !savedPauseState);
  playBtn.classList.toggle('btn-secondary', !!savedPauseState);
  updateBestText();
}

function renderAchievementList() {
  const completed = new Set(completedAchievements);
  achievementSummaryEl.textContent = `${completed.size} / ${totalAchievementTiers()} COMPLETE`;
  achievementListEl.textContent = '';
  for (const achievement of achievements) {
    const visible = !achievement.hidden || achievement.tiers.some(tier => completed.has(tier.id));
    const row = document.createElement('div');
    row.classList.add('achievement');

    const title = document.createElement('div');
    title.classList.add('achievement-title');
    const name = document.createElement('span');
    name.textContent = visible ? achievement.title : 'UNKNOWN';
    const count = document.createElement('span');
    const completeCount = achievement.tiers.filter(tier => completed.has(tier.id)).length;
    count.textContent = `${completeCount}/${achievement.tiers.length}`;
    title.appendChild(name);
    title.appendChild(count);

    const desc = document.createElement('div');
    desc.classList.add('achievement-desc');
    desc.textContent = visible ? achievement.description : 'Hidden achievement.';

    const tiers = document.createElement('div');
    tiers.classList.add('achievement-tiers');
    for (const tier of achievement.tiers) {
      const pill = document.createElement('div');
      pill.classList.add('tier-pill');
      if (completed.has(tier.id)) pill.classList.add('complete');
      if (!visible) pill.classList.add('hidden-tier');
      pill.textContent = visible ? `+${tierBonus(tier.tier)}` : '?';
      tiers.appendChild(pill);
    }

    row.appendChild(title);
    row.appendChild(desc);
    row.appendChild(tiers);
    achievementListEl.appendChild(row);
  }
}

function updateProfileStats() {
  updateXpPanel(profilePlayerLevelEl, profileXpProgressEl, profileXpFillEl, profileNextLevelEl);
  gamesPlayedEl.textContent = gamesPlayed;
  totalKillsEl.textContent = totalKills;
  totalFoodEl.textContent = totalFood;
  updateBestText();
  renderAchievementList();
}

function start() {
  clearPauseState();
  world.resetWorld();
  world.populate();
  const p = world.spawnPlayer();
  input.setAimAngle(p.dir);
  snapCamera();
  G.mode = 'play';
  lastScore = -1;
  lastKills = -1;
  acc = 0;
  menuEl.classList.add('hidden');
  profileEl.classList.add('hidden');
  deadEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  resetDeathPresentation();
  killsLineEl.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
  setGameUiVisible(true);
}

function showMenu() {
  input.resetTouchInput();
  world.resetWorld();
  world.populate();
  G.mode = 'menu';
  lastScore = -1;
  lastKills = -1;
  acc = 0;
  menuEl.classList.remove('hidden');
  profileEl.classList.add('hidden');
  deadEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  resetDeathPresentation();
  killsLineEl.classList.add('hidden');
  pauseBtn.classList.add('hidden');
  setGameUiVisible(false);
  updateMenuStats();
  snapCamera();
}

function showProfile() {
  input.resetTouchInput();
  G.mode = 'profile';
  acc = 0;
  menuEl.classList.add('hidden');
  profileEl.classList.remove('hidden');
  deadEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  pauseBtn.classList.add('hidden');
  setGameUiVisible(false);
  updateProfileStats();
}

function showSavedPause() {
  if (!savedPauseState) return;
  input.resetTouchInput();
  world.importState(savedPauseState);
  G.mode = 'paused';
  acc = 0;
  menuEl.classList.add('hidden');
  profileEl.classList.add('hidden');
  deadEl.classList.add('hidden');
  pauseEl.classList.remove('hidden');
  resetDeathPresentation();
  pauseBtn.classList.add('hidden');
  setGameUiVisible(true);
  snapCamera();
}

function restartAnim(elm, className) {
  elm.classList.remove(className);
  void elm.offsetWidth;
  elm.classList.add(className);
}

function resetDeathPresentation() {
  deathSequence = null;
  deathImpactEl.textContent = '';
  deathImpactEl.className = 'death-impact hidden';
  deathScoreLineEl.className = 'death-score hidden';
  deathXpPanelEl.classList.add('hidden');
  deathXpFillEl.style.width = '0%';
  deathLevelTextEl.textContent = '';
  deathLevelTextEl.className = 'death-level-text';
  finalEl.textContent = '0';
  deadActionsEl.classList.add('hidden');
  deadActionsEl.classList.remove('ready');
}

function setDeathImpact(text) {
  deathImpactEl.textContent = text;
  deathImpactEl.className = 'death-impact';
  restartAnim(deathImpactEl, 'bump');
}

function dropDeathImpact() {
  if (deathImpactEl.classList.contains('hidden')) return;
  deathImpactEl.classList.remove('bump');
  restartAnim(deathImpactEl, 'drop');
}

function renderDeathXpProgress(xpValue) {
  const prog = progressForXp(xpValue);
  deathXpFillEl.style.width = `${Math.max(0, Math.min(1, prog.progress)) * 100}%`;
}

function showLevelUp() {
  deathXpFillEl.style.width = '100%';
  deathLevelTextEl.textContent = 'LEVEL UP';
  restartAnim(deathLevelTextEl, 'bump');
}

function finishDeathSequence() {
  if (!deathSequence || deathSequence.done) return;
  const r = deathSequence.result;
  deathLevelTextEl.textContent = r.leveled ? `REACHED LEVEL ${r.finalLevel}` : `LEVEL ${r.finalLevel}`;
  deathLevelTextEl.classList.remove('bump');
  deadActionsEl.classList.remove('hidden');
  void deadActionsEl.offsetWidth;
  deadActionsEl.classList.add('ready');
  deathSequence.done = true;
}

function beginDeathSequence(result, now) {
  resetDeathPresentation();
  deathSequence = {
    result,
    startedAt: now,
    phase: null,
    scoreDuration: tallyDurationForAmount(result.score),
    xp: {
      display: result.previousXp,
      rate: result.xpGained > 0 ? result.xpGained / tallyDurationForAmount(result.xpGained) : 0,
      lastAt: now,
      holdUntil: 0,
      completeAt: null,
      levelUps: 0,
    },
    done: false,
  };
  renderDeathXpProgress(result.previousXp);
  deadEl.classList.remove('hidden');
  updateDeathSequence(now);
}

function enterDeathPhase(phase, now) {
  if (!deathSequence || deathSequence.phase === phase) return;
  deathSequence.phase = phase;
  const r = deathSequence.result;
  if (phase === 'kills') setDeathImpact(`+${r.kills} KILLS`);
  else if (phase === 'killsDrop') dropDeathImpact();
  else if (phase === 'food') setDeathImpact(`+${r.food} FOOD`);
  else if (phase === 'foodDrop') dropDeathImpact();
  else if (phase === 'bonus') setDeathImpact(`+${r.bonus} BONUS`);
  else if (phase === 'bonusDrop') dropDeathImpact();
  else if (phase === 'score') {
    deathImpactEl.classList.add('hidden');
    deathScoreLineEl.classList.remove('hidden');
    deathXpPanelEl.classList.remove('hidden');
    finalEl.textContent = '0';
    restartAnim(deathScoreLineEl, 'bump');
    deathSequence.xp.display = r.previousXp;
    deathSequence.xp.lastAt = now;
    deathSequence.xp.holdUntil = 0;
    deathSequence.xp.completeAt = null;
    deathLevelTextEl.textContent = '';
    deathLevelTextEl.classList.remove('bump');
    renderDeathXpProgress(r.previousXp);
  }
}

function updateDeathXp(now) {
  const seq = deathSequence;
  const xpState = seq.xp;
  const r = seq.result;

  if (xpState.holdUntil) {
    if (now < xpState.holdUntil) return;
    xpState.holdUntil = 0;
    xpState.lastAt = now;
    renderDeathXpProgress(xpState.display);
  }

  if (xpState.display < r.finalXp) {
    let budget = (now - xpState.lastAt) * xpState.rate;
    xpState.lastAt = now;
    while (budget > 0 && xpState.display < r.finalXp) {
      const prog = progressForXp(xpState.display);
      const threshold = Math.min(prog.nextLevelXp, r.finalXp);
      const step = Math.min(budget, threshold - xpState.display);
      xpState.display += step;
      budget -= step;
      if (xpState.display >= prog.nextLevelXp && prog.nextLevelXp <= r.finalXp) {
        xpState.display = prog.nextLevelXp;
        xpState.levelUps++;
        showLevelUp();
        xpState.holdUntil = now + DEATH_LEVEL_UP_HOLD;
        return;
      }
    }
    renderDeathXpProgress(xpState.display);
  }

  if (xpState.display >= r.finalXp) {
    if (xpState.completeAt === null) xpState.completeAt = now;
    if (now - xpState.completeAt >= DEATH_FINAL_DELAY) finishDeathSequence();
  }
}

function updateDeathSequence(now) {
  if (!deathSequence || deathSequence.done) return;
  const r = deathSequence.result;
  const elapsed = now - deathSequence.startedAt;
  const killsEnd = DEATH_KILLS_HOLD;
  const killsDropEnd = killsEnd + DEATH_DROP_TIME;
  const foodEnd = killsDropEnd + DEATH_FOOD_HOLD;
  const foodDropEnd = foodEnd + DEATH_DROP_TIME;
  const bonusEnd = foodDropEnd + (r.bonus > 0 ? DEATH_BONUS_HOLD : 0);
  const bonusDropEnd = bonusEnd + (r.bonus > 0 ? DEATH_DROP_TIME : 0);
  const scoreEnd = bonusDropEnd + deathSequence.scoreDuration;
  const scoreStarted = elapsed >= bonusDropEnd;

  if (elapsed < killsEnd) enterDeathPhase('kills', now);
  else if (elapsed < killsDropEnd) enterDeathPhase('killsDrop', now);
  else if (elapsed < foodEnd) enterDeathPhase('food', now);
  else if (elapsed < foodDropEnd) enterDeathPhase('foodDrop', now);
  else if (elapsed < bonusEnd) enterDeathPhase('bonus', now);
  else if (elapsed < bonusDropEnd) enterDeathPhase('bonusDrop', now);
  else if (elapsed < scoreEnd) {
    enterDeathPhase('score', now);
    const scoreElapsed = Math.max(0, elapsed - bonusDropEnd);
    const pct = deathSequence.scoreDuration > 0 ? Math.min(1, scoreElapsed / deathSequence.scoreDuration) : 1;
    finalEl.textContent = Math.floor(r.displayScore * pct);
  } else {
    finalEl.textContent = r.displayScore;
  }
  if (scoreStarted) updateDeathXp(now);
}

function triggerBumped() {
  hitFlashEl.classList.remove('flash');
  void hitFlashEl.offsetWidth;          // force reflow to restart the animation
  hitFlashEl.classList.add('flash');
  if (navigator.vibrate) navigator.vibrate(80);
}
function gameOver(now = performance.now() / 1000) {
  G.mode = 'dead';
  clearPauseState();
  if (navigator.vibrate) navigator.vibrate(300);
  const p = world.getPlayer();
  const sc = scoreForMass(p.mass);
  const kills = getPlayerKillCount();
  const food = getPlayerFoodCount();
  const unlockedAchievements = evaluateAchievements({ score: sc, kills, food }, completedAchievements);
  const legacyBonus = !creditedXpBonus && xpBonusBest > 500 ? xpBonusBest : 0;
  const bonus = legacyBonus + achievementBonus(unlockedAchievements);
  creditedXpBonus = true;
  completedAchievements = mergeCompletedAchievements(completedAchievements, unlockedAchievements);
  const previousXp = xp;
  const previousLevel = progressForXp(previousXp).level;
  gamesPlayed = normalizeProgressValue(gamesPlayed + 1);
  totalKills = normalizeProgressValue(totalKills + kills);
  totalFood = normalizeProgressValue(totalFood + food);
  xp = normalizeProgressValue(xp + sc + bonus);
  const finalLevel = progressForXp(xp).level;
  if (sc > best) best = sc;
  saveBest();
  if (kills > bestKills) { bestKills = kills; saveBestKills(); }
  saveCreditedXpBonus();
  saveCompletedAchievements(completedAchievements);
  saveLifetimeStats();
  updateBestText();
  updateProfileStats();
  pauseBtn.classList.add('hidden');
  setGameUiVisible(false);
  beginDeathSequence({
    score: sc,
    displayScore: sc + bonus,
    kills,
    food,
    bonus,
    unlockedAchievements,
    previousXp,
    finalXp: xp,
    xpGained: sc + bonus,
    previousLevel,
    finalLevel,
    leveled: finalLevel > previousLevel,
  }, now);
}

function pause() {
  G.mode = 'paused';
  acc = 0;
  input.resetTouchInput();
  try {
    savedPauseState = world.exportState();
    localStorage.setItem(LS_PAUSE_KEY, JSON.stringify(savedPauseState));
  } catch (e) {}
  pauseBtn.classList.add('hidden');
  setGameUiVisible(true);
  pauseEl.classList.remove('hidden');
}

function resume() {
  clearPauseState();
  G.mode = 'play';
  lastScore = -1;
  lastKills = -1;
  acc = 0;
  last = performance.now();
  pauseEl.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
  setGameUiVisible(true);
}

playBtn.addEventListener('click', start);
menuResumeBtn.addEventListener('click', showSavedPause);
profileBtn.addEventListener('click', showProfile);
profileBackBtn.addEventListener('click', showMenu);
respawnBtn.addEventListener('click', start);
deadMenuBtn.addEventListener('click', showMenu);
pauseBtn.addEventListener('click', pause);
resumeBtn.addEventListener('click', resume);
returnMenuBtn.addEventListener('click', showMenu);
window.addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'Space') && (G.mode === 'menu' || (G.mode === 'dead' && deathSequence?.done))) {
    if (e.code === 'Space') e.preventDefault();
    start();
  }
  if (e.code === 'Escape') {
    if (G.mode === 'play') pause();
    else if (G.mode === 'paused') resume();
    else if (G.mode === 'profile') showMenu();
  }
});

let last = performance.now(), acc = 0, emaFrame = 16, frames = 0;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = (t - last) / 1000;
  last = t;
  if (dt < 0) dt = 0;
  if (dt > 0.25) dt = 0.25;
  emaFrame = emaFrame * 0.95 + dt * 1000 * 0.05;

  const p = world.getPlayer();
  if (G.mode === 'play' && p && p.alive) {
    p.targetAngle = input.getAim();
    p.boost = input.boostHeld();
    input.setTouchBoostAvailable(p.mass > MIN_BOOST_MASS);
  } else {
    input.setTouchBoostAvailable(false);
  }

  if (G.mode !== 'paused') {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) { world.update(STEP); acc -= STEP; steps++; }
    if (steps === 5) acc = 0;          // don't spiral on very slow frames
  }

  if (G.mode === 'play') {
    const q = world.getPlayer();
    if (q && !q.alive) gameOver(t / 1000);
  }

  if (G.mode === 'dead') updateDeathSequence(t / 1000);

  render(t / 1000, { showUi: G.mode === 'play' || G.mode === 'paused' });

  if (G.mode === 'play') {
    const q = world.getPlayer();
    if (q && q.alive) {
      const sc = scoreForMass(q.mass);
      if (sc !== lastScore) {
        lastScore = sc;
        scoreEl.textContent = sc;
        if (sc > best) { best = sc; updateBestText(); saveBest(); }
      }
      const kc = getPlayerKillCount();
      if (kc !== lastKills) {
        lastKills = kc;
        killsEl.textContent = kc;
        if (kc > 0) killsLineEl.classList.remove('hidden');
      }
      if (world.popPlayerHits() > 0) triggerBumped();
    }
  }

  if (++frames >= 120) { frames = 0; view.adaptResolution(emaFrame); }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.mode === 'play') pause(); else { saveBest(); saveBestKills(); saveLifetimeStats(); } }
  else last = performance.now();
});
window.addEventListener('beforeunload', () => { saveBest(); saveBestKills(); saveLifetimeStats(); });

view.initView();
input.initInput();
preventPageZoomGestures();
refreshSavedPauseState();
showMenu();
requestAnimationFrame(loop);
