// Neon glow is expensive to render live (shadowBlur kills fill rates), so we
// bake each colour's radial glow into a small offscreen canvas once at load.
// Runtime drawing is then pure drawImage.
import { NEON } from './constants.js';
import { hexA } from './math.js';

export function glowSprite(size, color, coreStop) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const r = size / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(coreStop, color);
  g.addColorStop(coreStop + 0.28, hexA(color, 0.35));
  g.addColorStop(1, hexA(color, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export const bodySprites = NEON.map(c => glowSprite(64, c, 0.30));
export const foodSprites = NEON.map(c => glowSprite(32, c, 0.22));
