// Entry point. Wires the DOM, owns the menu/play/dead/paused state machine and the
// high score, and runs the main loop: fixed-timestep simulation (deterministic
// across 60/120/144Hz) with a render every animation frame.
import { STEP, LS_KEY, LS_BEST_KILLS_KEY, LS_PAUSE_KEY, MIN_BOOST_MASS, START_MASS } from './constants.js';
import * as world from './world.js';
import * as input from './input.js';
import * as view from './view.js';
import { render, snapCamera } from './render.js';
import { popPlayerHits, getPlayerKillCount } from './world.js';
import './sprites.js';                 // build glow sprites at load

const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('best');
const killsEl = el('kills'), killsLineEl = el('killsLine');
const finalEl = el('finalScore'), bestDeadEl = el('bestDead');
const finalKillsEl = el('finalKills'), bestKillsDeadEl = el('bestKillsDead');
const menuEl = el('menu'), deadEl = el('dead'), pauseEl = el('pause');
const playBtn = el('playBtn'), respawnBtn = el('respawnBtn');
const pauseBtn = el('pauseBtn'), resumeBtn = el('resumeBtn'), newGameBtn = el('newGameBtn');
const hitFlashEl = el('hitFlash');

const G = { mode: 'menu' };            // 'menu' | 'play' | 'dead' | 'paused'
let lastScore = -1;
let lastKills = -1;

let best = 0;
try { best = +localStorage.getItem(LS_KEY) || 0; } catch (e) {}
bestEl.textContent = best;
function saveBest() { try { localStorage.setItem(LS_KEY, String(best)); } catch (e) {} }

let bestKills = 0;
try { bestKills = +localStorage.getItem(LS_BEST_KILLS_KEY) || 0; } catch (e) {}
function saveBestKills() { try { localStorage.setItem(LS_BEST_KILLS_KEY, String(bestKills)); } catch (e) {} }
// Request persistent storage so the browser won't evict our high score under
// storage pressure. localStorage remains the storage medium; persistence just
// upgrades the quota bucket from "best effort" to "persistent".
try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch (e) {}

function clearPauseState() { try { localStorage.removeItem(LS_PAUSE_KEY); } catch (e) {} }
function scoreForMass(mass) { return Math.max(0, Math.floor(mass - START_MASS)); }

function start() {
  clearPauseState();
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
  killsLineEl.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
}
function triggerBumped() {
  hitFlashEl.classList.remove('flash');
  void hitFlashEl.offsetWidth;          // force reflow to restart the animation
  hitFlashEl.classList.add('flash');
  if (navigator.vibrate) navigator.vibrate(80);
}
function gameOver() {
  G.mode = 'dead';
  clearPauseState();
  if (navigator.vibrate) navigator.vibrate(300);
  const p = world.getPlayer();
  const sc = scoreForMass(p.mass);
  if (sc > best) best = sc;
  saveBest();
  bestEl.textContent = best;
  bestDeadEl.textContent = best;
  finalEl.textContent = sc;
  const kills = getPlayerKillCount();
  if (kills > bestKills) { bestKills = kills; saveBestKills(); }
  finalKillsEl.textContent = kills;
  bestKillsDeadEl.textContent = bestKills;
  pauseBtn.classList.add('hidden');
  deadEl.classList.remove('hidden');
}

function pause() {
  G.mode = 'paused';
  acc = 0;
  input.resetTouchInput();
  try {
    localStorage.setItem(LS_PAUSE_KEY, JSON.stringify(world.exportState()));
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
respawnBtn.addEventListener('click', start);
pauseBtn.addEventListener('click', pause);
resumeBtn.addEventListener('click', resume);
newGameBtn.addEventListener('click', start);
window.addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'Space') && (G.mode === 'menu' || G.mode === 'dead')) {
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
    if (q && !q.alive) gameOver();
  }

  render(t / 1000);

  if (G.mode === 'play') {
    const q = world.getPlayer();
    if (q && q.alive) {
      const sc = scoreForMass(q.mass);
      if (sc !== lastScore) {
        lastScore = sc;
        scoreEl.textContent = sc;
        if (sc > best) { best = sc; bestEl.textContent = best; saveBest(); }
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
  if (document.hidden) { if (G.mode === 'play') pause(); else { saveBest(); saveBestKills(); } }
  else last = performance.now();
});
window.addEventListener('beforeunload', () => { saveBest(); saveBestKills(); });

view.initView();
input.initInput();

// Restore a previously paused game, if any.
let _savedPause = null;
try { const _raw = localStorage.getItem(LS_PAUSE_KEY); if (_raw) _savedPause = JSON.parse(_raw); } catch (e) {}
if (_savedPause) {
  world.importState(_savedPause);
  G.mode = 'paused';
  menuEl.classList.add('hidden');
  pauseEl.classList.remove('hidden');
} else {
  world.populate();
}
snapCamera();
requestAnimationFrame(loop);
