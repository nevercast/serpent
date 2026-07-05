// Food pellets + a uniform-grid spatial hash. The hash backs both pickup
// (snake eats nearby pellets) and bot food-seeking (nearest reachable pellet).
import { WORLD, CELL, CELLS, MAX_FOOD, NEON } from './constants.js';
import { rand, clamp } from './math.js';

export const foods = [];
export const cells = new Map();       // int cell key -> array of food refs
const AMBIENT_RESPAWN_SAMPLES = 8;
const AMBIENT_RESPAWN_RADIUS = 2;

export function cellKey(x, y) {
  const cx = clamp((x / CELL) | 0, 0, CELLS - 1);
  const cy = clamp((y / CELL) | 0, 0, CELLS - 1);
  return cx + cy * CELLS;
}
function addToCell(f) {
  f.key = cellKey(f.x, f.y);
  let a = cells.get(f.key);
  if (!a) { a = []; cells.set(f.key, a); }
  a.push(f);
}
function removeFromCell(f) {
  const a = cells.get(f.key);
  if (!a) return;
  const i = a.indexOf(f);
  if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
}
// Call after mutating a pellet's x/y so it stays in the right cell.
export function moveFoodCell(f) {
  const nk = cellKey(f.x, f.y);
  if (nk !== f.key) {
    removeFromCell(f);
    f.key = nk;
    let a = cells.get(nk);
    if (!a) { a = []; cells.set(nk, a); }
    a.push(f);
  }
}
export function spawnFood(x, y, v, r, ci) {
  if (foods.length >= MAX_FOOD) return;
  const f = {
    x: clamp(x, 8, WORLD - 8), y: clamp(y, 8, WORLD - 8),
    v, r, ci, phase: Math.random() * Math.PI * 2, key: 0, idx: foods.length
  };
  foods.push(f);
  addToCell(f);
}
// Swap-pop removal keeps `foods` dense and idx stable.
export function killFood(f) {
  removeFromCell(f);
  const last = foods[foods.length - 1];
  foods[f.idx] = last;
  last.idx = f.idx;
  foods.pop();
}
export function spawnRandomFood() {
  spawnFood(rand(40, WORLD - 40), rand(40, WORLD - 40), 1, rand(3, 5.5), (Math.random() * NEON.length) | 0);
}
function localFoodDensity(cx, cy) {
  let count = 0, area = 0;
  for (let gy = Math.max(0, cy - AMBIENT_RESPAWN_RADIUS); gy <= Math.min(CELLS - 1, cy + AMBIENT_RESPAWN_RADIUS); gy++) {
    for (let gx = Math.max(0, cx - AMBIENT_RESPAWN_RADIUS); gx <= Math.min(CELLS - 1, cx + AMBIENT_RESPAWN_RADIUS); gx++) {
      area++;
      const arr = cells.get(gx + gy * CELLS);
      if (arr) count += arr.length;
    }
  }
  return count / area;
}
export function spawnAmbientFood() {
  let bestX = 0, bestY = 0, bestDensity = Infinity, bestEdge = -1;
  for (let i = 0; i < AMBIENT_RESPAWN_SAMPLES; i++) {
    const x = rand(40, WORLD - 40), y = rand(40, WORLD - 40);
    const cx = clamp((x / CELL) | 0, 0, CELLS - 1);
    const cy = clamp((y / CELL) | 0, 0, CELLS - 1);
    const density = localFoodDensity(cx, cy);
    const edge = Math.min(cx, cy, CELLS - 1 - cx, CELLS - 1 - cy);
    if (density < bestDensity || (density === bestDensity && edge > bestEdge)) {
      bestX = x; bestY = y; bestDensity = density; bestEdge = edge;
    }
  }
  spawnFood(bestX, bestY, 1, rand(3, 5.5), (Math.random() * NEON.length) | 0);
}
export function resetFood() {
  foods.length = 0;
  cells.clear();
}
