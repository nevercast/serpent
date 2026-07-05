// Entry point. Wires the DOM, owns the menu/play/dead state machine and the
// high score, and runs the main loop: fixed-timestep simulation (deterministic
// across 60/120/144Hz) with a render every animation frame.
import { STEP, LS_KEY, MIN_BOOST_MASS } from './constants.js';
import * as world from './world.js';
import * as input from './input.js';
import * as view from './view.js';
import { render, snapCamera } from './render.js';
import './sprites.js';                 // build glow sprites at load

const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('best');
const finalEl = el('finalScore'), bestDeadEl = el('bestDead');
const menuEl = el('menu'), deadEl = el('dead');
const playBtn = el('playBtn'), respawnBtn = el('respawnBtn');

const G = { mode: 'menu' };            // 'menu' | 'play' | 'dead'
let lastScore = -1;

let best = 0;
try { best = +localStorage.getItem(LS_KEY) || 0; } catch (e) {}
bestEl.textContent = best;
function saveBest() { try { localStorage.setItem(LS_KEY, String(best)); } catch (e) {} }
// Request persistent storage so the browser won't evict our high score under
// storage pressure. localStorage remains the storage medium; persistence just
// upgrades the quota bucket from "best effort" to "persistent".
try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch (e) {}

function start() {
  const p = world.spawnPlayer();
  input.setAimAngle(p.dir);
  snapCamera();
  G.mode = 'play';
  lastScore = -1;
  menuEl.classList.add('hidden');
  deadEl.classList.add('hidden');
}
function gameOver() {
  G.mode = 'dead';
  const sc = Math.floor(world.getPlayer().mass);
  if (sc > best) best = sc;
  saveBest();
  bestEl.textContent = best;
  bestDeadEl.textContent = best;
  finalEl.textContent = sc;
  deadEl.classList.remove('hidden');
}
playBtn.addEventListener('click', start);
respawnBtn.addEventListener('click', start);
window.addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'Space') && G.mode !== 'play') {
    if (e.code === 'Space') e.preventDefault();
    start();
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

  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) { world.update(STEP); acc -= STEP; steps++; }
  if (steps === 5) acc = 0;          // don't spiral on very slow frames

  if (G.mode === 'play') {
    const q = world.getPlayer();
    if (q && !q.alive) gameOver();
  }

  render(t / 1000);

  if (G.mode === 'play') {
    const q = world.getPlayer();
    if (q && q.alive) {
      const sc = Math.floor(q.mass);
      if (sc !== lastScore) {
        lastScore = sc;
        scoreEl.textContent = sc;
        if (sc > best) { best = sc; bestEl.textContent = best; saveBest(); }
      }
    }
  }

  if (++frames >= 120) { frames = 0; view.adaptResolution(emaFrame); }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveBest();
  else last = performance.now();
});
window.addEventListener('beforeunload', saveBest);

view.initView();
input.initInput();
world.populate();
snapCamera();
requestAnimationFrame(loop);
