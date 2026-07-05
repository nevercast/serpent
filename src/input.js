// Steering + boost input. Desktop: mouse aims, hold LMB/space to boost.
// Touch: a virtual joystick on the right steers, a boost button on the left
// boosts — the two are pointer-independent so you can do both at once.
// Exposes only intent (getAim / boostHeld); main.js decides when to apply it.
import { cssW, cssH } from './view.js';

let aimAngle = -Math.PI / 2;
let mouseHeld = false, keyBoost = false, btnBoost = false;
let touchBoostAvailable = false;

export function getAim() { return aimAngle; }
export function setAimAngle(a) { aimAngle = a; }
export function boostHeld() { return mouseHeld || keyBoost || btnBoost; }
export function setTouchBoostAvailable(v) {
  touchBoostAvailable = !!v;
  if (!boostBtn) return;
  boostBtn.classList.toggle('disabled', !touchBoostAvailable);
  if (!touchBoostAvailable) {
    boostId = null;
    btnBoost = false;
    boostBtn.classList.remove('on');
  }
}

const STICK_R = 52;              // max joystick knob travel, px
let stick, knob, boostBtn;
let stickId = null, boostId = null;

function aimFromScreen(cx, cy) {
  const dx = cx - cssW / 2, dy = cy - cssH / 2;
  if (dx * dx + dy * dy > 144) aimAngle = Math.atan2(dy, dx);   // small deadzone
}

export function initInput() {
  stick = document.getElementById('stick');
  knob = document.getElementById('stickKnob');
  boostBtn = document.getElementById('boostBtn');
  setTouchBoostAvailable(false);

  // ---- desktop mouse ----
  window.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;               // touch steers via joystick only
    if (e.target && e.target.closest && e.target.closest('.overlay, button, #stick')) return;
    if (e.button === 0) mouseHeld = true;
    aimFromScreen(e.clientX, e.clientY);
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') aimFromScreen(e.clientX, e.clientY);
  });
  const mouseEnd = e => { if (e.pointerType === 'mouse') mouseHeld = false; };
  window.addEventListener('pointerup', mouseEnd);
  window.addEventListener('pointercancel', mouseEnd);

  // ---- touch joystick (right) ----
  const stickMove = e => {
    const r = stick.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 10) aimAngle = Math.atan2(dy, dx);
    const k = d > STICK_R ? STICK_R / d : 1;
    knob.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)';
  };
  stick.addEventListener('pointerdown', e => {
    if (stickId !== null) return;                        // one steering pointer
    stickId = e.pointerId;
    if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
    stickMove(e);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
  const stickEnd = e => {
    if (e.pointerId === stickId) {
      stickId = null;
      knob.style.transform = 'translate(0px, 0px)';      // knob recenters, heading persists
    }
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  // ---- touch boost button (left) ----
  boostBtn.addEventListener('pointerdown', e => {
    if (!touchBoostAvailable || boostId !== null) return;
    boostId = e.pointerId;
    btnBoost = true;
    boostBtn.classList.add('on');
    // capture so boost holds even if the thumb rolls off the button; releases
    // only on this pointer's up/cancel, independent of the joystick finger
    if (boostBtn.setPointerCapture) boostBtn.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  const boostEnd = e => {
    if (e.pointerId === boostId) { boostId = null; btnBoost = false; boostBtn.classList.remove('on'); }
  };
  boostBtn.addEventListener('pointerup', boostEnd);
  boostBtn.addEventListener('pointercancel', boostEnd);

  // ---- keyboard boost ----
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ShiftLeft') {
      keyBoost = true;
      if (e.code === 'Space') e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ShiftLeft') keyBoost = false;
  });
}
