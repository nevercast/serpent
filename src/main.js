// Entry point. Wires the DOM, owns the menu/play/dead/paused state machine and the
// high score, and runs the main loop: fixed-timestep simulation (deterministic
// across 60/120/144Hz) with a render every animation frame.
import {
  STEP, LS_KEY, LS_BEST_KILLS_KEY, LS_PAUSE_KEY, LS_GAMES_PLAYED_KEY,
  LS_TOTAL_KILLS_KEY, LS_TOTAL_FOOD_KEY, LS_XP_KEY, MIN_BOOST_MASS, START_MASS
} from './constants.js';
import * as world from './world.js';
import * as input from './input.js';
import * as view from './view.js';
import { render, snapCamera } from './render.js';
import { popPlayerHits, getPlayerKillCount, getPlayerFoodCount } from './world.js';
import { normalizeProgressValue, progressForXp, tallyDurationForAmount } from './progression.js';
import './sprites.js';                 // build glow sprites at load

const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('best');
const killsEl = el('kills'), killsLineEl = el('killsLine');
const finalEl = el('finalScore');
const deathImpactEl = el('deathImpact'), deathScoreLineEl = el('deathScoreLine');
const deathXpPanelEl = el('deathXpPanel'), deathXpFillEl = el('deathXpFill'), deathLevelTextEl = el('deathLevelText');
const deadActionsEl = el('deadActions');
const menuEl = el('menu'), deadEl = el('dead'), pauseEl = el('pause');
const playBtn = el('playBtn'), menuResumeBtn = el('menuResumeBtn'), respawnBtn = el('respawnBtn'), deadMenuBtn = el('deadMenuBtn');
const pauseBtn = el('pauseBtn'), resumeBtn = el('resumeBtn'), returnMenuBtn = el('returnMenuBtn');
const hitFlashEl = el('hitFlash');
const gamesPlayedEl = el('gamesPlayed'), totalKillsEl = el('totalKills'), totalFoodEl = el('totalFood');
const menuBestScoreEl = el('menuBestScore'), menuBestKillsEl = el('menuBestKills');
const playerLevelEl = el('playerLevel'), nextLevelEl = el('nextLevel'), xpProgressEl = el('xpProgress'), xpFillEl = el('xpFill');

playBtn.textContent = 'NEW GAME';
respawnBtn.textContent = 'NEW GAME';

const G = { mode: 'menu' };            // 'menu' | 'play' | 'dead' | 'paused'
let lastScore = -1;
let lastKills = -1;
let savedPauseState = null;
let deathSequence = null;

const DEATH_KILLS_HOLD = 1.5;
const DEATH_FOOD_HOLD = 1.5;
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

let best = readStoredInt(LS_KEY);
let bestKills = readStoredInt(LS_BEST_KILLS_KEY);
let gamesPlayed = readStoredInt(LS_GAMES_PLAYED_KEY);
let totalKills = readStoredInt(LS_TOTAL_KILLS_KEY);
let totalFood = readStoredInt(LS_TOTAL_FOOD_KEY);
let xp = readStoredInt(LS_XP_KEY);

function saveBest() { saveStoredInt(LS_KEY, best); }
function saveBestKills() { saveStoredInt(LS_BEST_KILLS_KEY, bestKills); }
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

function updateBestText() {
  bestEl.textContent = best;
  menuBestScoreEl.textContent = best;
  menuBestKillsEl.textContent = bestKills;
}

function updateMenuStats() {
  const prog = progressForXp(xp);
  gamesPlayedEl.textContent = gamesPlayed;
  totalKillsEl.textContent = totalKills;
  totalFoodEl.textContent = totalFood;
  playerLevelEl.textContent = `LEVEL ${prog.level}`;
  nextLevelEl.textContent = `+${prog.xpForNextLevel - prog.xpIntoLevel} XP TO REACH LEVEL ${prog.level + 1}`;
  xpProgressEl.textContent = `${prog.xpIntoLevel} / ${prog.xpForNextLevel} XP`;
  xpFillEl.style.width = `${Math.max(0, Math.min(1, prog.progress)) * 100}%`;
  menuResumeBtn.classList.toggle('hidden', !savedPauseState);
  updateBestText();
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
  deadEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  resetDeathPresentation();
  killsLineEl.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
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
  deadEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  resetDeathPresentation();
  killsLineEl.classList.add('hidden');
  pauseBtn.classList.add('hidden');
  updateMenuStats();
  snapCamera();
}

function showSavedPause() {
  if (!savedPauseState) return;
  input.resetTouchInput();
  world.importState(savedPauseState);
  G.mode = 'paused';
  acc = 0;
  menuEl.classList.add('hidden');
  deadEl.classList.add('hidden');
  pauseEl.classList.remove('hidden');
  resetDeathPresentation();
  pauseBtn.classList.add('hidden');
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
  const scoreEnd = foodDropEnd + deathSequence.scoreDuration;
  const scoreStarted = elapsed >= foodDropEnd;

  if (elapsed < killsEnd) enterDeathPhase('kills', now);
  else if (elapsed < killsDropEnd) enterDeathPhase('killsDrop', now);
  else if (elapsed < foodEnd) enterDeathPhase('food', now);
  else if (elapsed < foodDropEnd) enterDeathPhase('foodDrop', now);
  else if (elapsed < scoreEnd) {
    enterDeathPhase('score', now);
    const scoreElapsed = Math.max(0, elapsed - foodDropEnd);
    const pct = deathSequence.scoreDuration > 0 ? Math.min(1, scoreElapsed / deathSequence.scoreDuration) : 1;
    finalEl.textContent = Math.floor(r.score * pct);
  } else {
    finalEl.textContent = r.score;
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
  const previousXp = xp;
  const previousLevel = progressForXp(previousXp).level;
  gamesPlayed = normalizeProgressValue(gamesPlayed + 1);
  totalKills = normalizeProgressValue(totalKills + kills);
  totalFood = normalizeProgressValue(totalFood + food);
  xp = normalizeProgressValue(xp + sc);
  const finalLevel = progressForXp(xp).level;
  if (sc > best) best = sc;
  saveBest();
  if (kills > bestKills) { bestKills = kills; saveBestKills(); }
  saveLifetimeStats();
  updateBestText();
  pauseBtn.classList.add('hidden');
  beginDeathSequence({
    score: sc,
    kills,
    food,
    previousXp,
    finalXp: xp,
    xpGained: sc,
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
}

playBtn.addEventListener('click', start);
menuResumeBtn.addEventListener('click', showSavedPause);
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

  render(t / 1000);

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
refreshSavedPauseState();
showMenu();
requestAnimationFrame(loop);
