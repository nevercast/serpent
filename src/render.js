// All drawing. Camera follows the player (or a bot on menu/death screens) and
// the zoom caps the visible world at VIEW_W x VIEW_H, cropping to fit — wide
// desktop screens never reveal extra map. Culls by per-snake bounding box.
import { WORLD, GRID, VIEW_W, VIEW_H, NEON, cameraGrow } from './constants.js';
import { TAU } from './math.js';
import * as view from './view.js';
import { foods } from './food.js';
import { snakes, getPlayer } from './world.js';
import { bodySprites, foodSprites } from './sprites.js';

let camX = WORLD / 2, camY = WORLD / 2, camS = 0.2, camR = 8;

export function snapCamera() {
  const p = getPlayer();
  if (p) { camX = p.x; camY = p.y; }
}

function drawGrid(ctx, x0, y0, x1, y1) {
  const a = Math.max(0, x0), b = Math.min(WORLD, x1);
  const c = Math.max(0, y0), d = Math.min(WORLD, y1);
  if (a >= b || c >= d) return;
  ctx.strokeStyle = 'rgba(80,220,255,0.07)';
  ctx.lineWidth = 1 / camS;
  ctx.beginPath();
  for (let x = Math.ceil(a / GRID) * GRID; x <= b; x += GRID) { ctx.moveTo(x, c); ctx.lineTo(x, d); }
  for (let y = Math.ceil(c / GRID) * GRID; y <= d; y += GRID) { ctx.moveTo(a, y); ctx.lineTo(b, y); }
  ctx.stroke();
}
function drawBorder(ctx) {
  ctx.strokeStyle = 'rgba(255,45,85,0.25)';
  ctx.lineWidth = 20;
  ctx.strokeRect(0, 0, WORLD, WORLD);
  ctx.strokeStyle = '#ff2d55';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, WORLD, WORLD);
}
function drawEyes(ctx, s, hr) {
  const ca = Math.cos(s.dir), sa = Math.sin(s.dir);
  const ex = s.x + ca * hr * 0.32, ey = s.y + sa * hr * 0.32;
  const ox = -sa * hr * 0.42, oy = ca * hr * 0.42;
  const er = hr * 0.30, pr = hr * 0.14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ex + ox, ey + oy, er, 0, TAU);
  ctx.arc(ex - ox, ey - oy, er, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#0a0a18';
  ctx.beginPath();
  ctx.arc(ex + ox + ca * er * 0.4, ey + oy + sa * er * 0.4, pr, 0, TAU);
  ctx.arc(ex - ox + ca * er * 0.4, ey - oy + sa * er * 0.4, pr, 0, TAU);
  ctx.fill();
}
function drawMinimap(ctx) {
  const m = 110 * view.uiPx, pad = 14 * view.uiPx;
  const x = view.pxW - m - pad, y = pad;
  ctx.fillStyle = 'rgba(5,8,20,0.55)';
  ctx.fillRect(x, y, m, m);
  ctx.strokeStyle = 'rgba(0,240,255,0.4)';
  ctx.lineWidth = Math.max(1, view.uiPx);
  ctx.strokeRect(x, y, m, m);
  const k = m / WORLD;
  const player = getPlayer();
  for (const s of snakes) {
    if (!s.alive) continue;
    const me = s === player;
    ctx.fillStyle = me ? NEON[s.ci] : 'rgba(255,255,255,0.45)';
    const dz = (me ? 3.4 : 2.2) * view.uiPx;
    ctx.fillRect(x + s.x * k - dz / 2, y + s.y * k - dz / 2, dz, dz);
  }
}

export function render(time) {
  const ctx = view.ctx;
  const pxW = view.pxW, pxH = view.pxH;

  // follow the player, else any living bot
  let tgt = null;
  const player = getPlayer();
  if (player && player.alive) tgt = player;
  else for (const s of snakes) { if (s.alive) { tgt = s; break; } }
  if (tgt) {
    camX += (tgt.x - camX) * 0.14;
    camY += (tgt.y - camY) * 0.14;
    camR += (tgt.radius - camR) * 0.04;
  }
  // zoom grows more gently as you get larger so big snakes still feel responsive.
  const grow = cameraGrow(camR);
  const targetScale = Math.max(pxW / (VIEW_W * grow), pxH / (VIEW_H * grow));
  camS += (targetScale - camS) * 0.08;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.setTransform(camS, 0, 0, camS, pxW / 2 - camX * camS, pxH / 2 - camY * camS);

  const vx0 = camX - pxW / (2 * camS), vx1 = camX + pxW / (2 * camS);
  const vy0 = camY - pxH / (2 * camS), vy1 = camY + pxH / (2 * camS);

  drawGrid(ctx, vx0, vy0, vx1, vy1);
  drawBorder(ctx);

  // food — additive blend for the neon pop
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (f.x < vx0 - 24 || f.x > vx1 + 24 || f.y < vy0 - 24 || f.y > vy1 + 24) continue;
    const p = 1 + 0.25 * Math.sin(time * 3 + f.phase);
    const d = f.r * 3.4 * p;
    ctx.drawImage(foodSprites[f.ci], f.x - d / 2, f.y - d / 2, d, d);
  }
  ctx.globalCompositeOperation = 'source-over';

  // snakes — bbox-culled, tail to head
  for (const s of snakes) {
    if (!s.alive) continue;
    if (s.maxX < vx0 || s.minX > vx1 || s.maxY < vy0 || s.minY > vy1) continue;
    const spr = bodySprites[s.ci];
    const r = s.radius;
    const d = r * 2.7;
    const segs = s.segs;
    // Ghost state: pulse opacity so the player can see the protection window
    if (s.ghostTimer > 0) ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 10);
    for (let i = s.segCount - 1; i >= 1; i--) {
      const g = segs[i];
      ctx.drawImage(spr, g.x - d / 2, g.y - d / 2, d, d);
    }
    const hr = s.headR;
    const hd = hr * 2.7;
    ctx.drawImage(spr, s.x - hd / 2, s.y - hd / 2, hd, hd);
    drawEyes(ctx, s, hr);
    if (s.ghostTimer > 0) ctx.globalAlpha = 1;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawMinimap(ctx);
}
