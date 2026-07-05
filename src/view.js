// Canvas handle, DPR-aware sizing, and adaptive internal resolution.
// Everything downstream reads these live bindings; nothing else owns size state.
let cssW = 1, cssH = 1, pxW = 1, pxH = 1, uiPx = 1, resScale = 1, dpr = 1;
let canvas = null, ctx = null;
const DPR_CAP = 2;

export { cssW, cssH, pxW, pxH, uiPx, ctx };

export function initView() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d', { alpha: false });
  dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  cssW = Math.max(1, window.innerWidth);
  cssH = Math.max(1, window.innerHeight);
  pxW = Math.max(1, Math.round(cssW * dpr * resScale));
  pxH = Math.max(1, Math.round(cssH * dpr * resScale));
  canvas.width = pxW;
  canvas.height = pxH;
  uiPx = pxW / cssW;
}

// Trade internal resolution for framerate on weak devices, and claw it back
// when there's headroom. Called periodically with a smoothed frame time (ms).
export function adaptResolution(emaFrameMs) {
  if (emaFrameMs > 26 && resScale > 0.55) { resScale = Math.max(0.55, resScale - 0.15); resize(); }
  else if (emaFrameMs < 14 && resScale < 1) { resScale = Math.min(1, resScale + 0.15); resize(); }
}
