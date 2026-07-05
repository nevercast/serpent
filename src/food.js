// Food pellets + a uniform-grid spatial hash. The hash backs both pickup
// (snake eats nearby pellets) and bot food-seeking (nearest reachable pellet).
import { WORLD, CELL, CELLS, MAX_FOOD, NEON } from './constants.js';
import { rand, clamp } from './math.js';

export const foods = [];
export const cells = new Map();       // int cell key -> array of food refs

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
export function resetFood() {
  foods.length = 0;
  cells.clear();
}
