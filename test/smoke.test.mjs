// Integration smoke test: boot the real browser entry (main.js) under DOM stubs
// and drive menu -> play, mouse steer+boost, simultaneous joystick+boost, keyboard,
// resize, slow frames and tab-visibility. Guards against import/wiring breakage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installStubs } from './helpers/dom-stub.js';
import { MIN_BOOST_MASS, START_MASS } from '../src/constants.js';
import * as world from '../src/world.js';

test('browser entry boots and handles all input paths without throwing', async () => {
  const h = installStubs();
  await import('../src/main.js');       // boots into menu + starts the loop

  h.advance(60, 16.7);                  // idle menu frames
  h.fireEl('playBtn', 'click', {});     // start the game
  h.advance(1, 16.7);
  assert.equal(h.els.score.textContent, '0', 'score starts at zero for the initial mass');
  assert.equal(h.els.boostBtn.classList.contains('disabled'), true, 'boost button starts unavailable');
  h.fireEl('boostBtn', 'pointerdown', { pointerId: 30, preventDefault() {} });
  assert.equal(h.els.boostBtn.classList.contains('on'), false, 'unavailable boost button ignores touch');

  const p = world.getPlayer();
  p.mass = START_MASS + 6.9;
  h.advance(1, 16.7);
  assert.equal(h.els.score.textContent, '6', 'score counts only mass gained above the starting mass');
  p.mass = MIN_BOOST_MASS + 1;
  h.advance(1, 16.7);
  assert.equal(h.els.boostBtn.classList.contains('disabled'), false, 'boost button enables above min mass');

  // desktop: mouse steer + hold-to-boost
  h.fireWin('pointermove', { pointerType: 'mouse', clientX: 900, clientY: 200 });
  h.fireWin('pointerdown', { pointerType: 'mouse', button: 0, clientX: 900, clientY: 200, target: h.plain() });
  h.advance(120, 16.7);
  h.fireWin('pointerup', { pointerType: 'mouse' });

  // touch: joystick + boost button held simultaneously on separate pointers
  p.mass = MIN_BOOST_MASS + 1;
  h.advance(1, 16.7);
  h.fireEl('stick', 'pointerdown', { pointerId: 31, clientX: 1192, clientY: 628, preventDefault() {} });
  h.fireEl('boostBtn', 'pointerdown', { pointerId: 32, preventDefault() {} });
  assert.equal(h.els.boostBtn.classList.contains('on'), true, 'available boost button presses');
  h.fireEl('stick', 'pointermove', { pointerId: 31, clientX: 1160, clientY: 560 });
  h.fireEl('stick', 'lostpointercapture', { pointerId: 31 });
  assert.equal(h.els.stickKnob.style.transform, 'translate(0px, 0px)', 'lost joystick capture recenters the knob');
  h.fireEl('stick', 'pointerdown', { pointerId: 33, clientX: 1192, clientY: 628, preventDefault() {} });
  h.fireEl('stick', 'pointermove', { pointerId: 33, clientX: 1160, clientY: 560 });
  assert.notEqual(h.els.stickKnob.style.transform, 'translate(0px, 0px)', 'joystick accepts a new touch after lost capture');
  h.advance(60, 16.7);
  // stray extra touches must be ignored, then release out of order
  h.fireEl('stick', 'pointerdown', { pointerId: 35, clientX: 1192, clientY: 628, preventDefault() {} });
  h.fireEl('boostBtn', 'pointerdown', { pointerId: 34, preventDefault() {} });
  h.fireEl('boostBtn', 'pointerup', { pointerId: 32 });
  h.advance(30, 16.7);
  h.fireWin('pointerup', { pointerId: 33 });
  assert.equal(h.els.stickKnob.style.transform, 'translate(0px, 0px)', 'window-level pointerup releases the joystick');

  // keyboard boost, resize to portrait, slow frames (accumulator clamp), visibility
  h.fireWin('keydown', { code: 'Space', preventDefault() {} });
  h.advance(20, 16.7);
  h.fireWin('keyup', { code: 'Space' });
  h.win.innerWidth = 390; h.win.innerHeight = 844;
  h.fireWin('resize', {});
  h.advance(10, 16.7);
  h.advance(3, 400);                    // pathologically slow frames
  h.doc.hidden = true; h.fireDoc('visibilitychange', {});
  h.doc.hidden = false; h.fireDoc('visibilitychange', {});

  // long run to exercise the adaptive-resolution branch and many respawns
  h.advance(400, 8.3);

  // pause / resume flow
  h.fireEl('respawnBtn', 'click', {});   // ensure play mode
  h.advance(5, 16.7);
  assert.equal(h.els.pauseBtn.classList.contains('hidden'), false, 'pause button visible during play');
  h.fireEl('stick', 'pointerdown', { pointerId: 36, clientX: 1192, clientY: 628, preventDefault() {} });
  h.fireEl('stick', 'pointermove', { pointerId: 36, clientX: 1160, clientY: 560 });
  assert.notEqual(h.els.stickKnob.style.transform, 'translate(0px, 0px)', 'joystick active before pause');
  h.fireEl('pauseBtn', 'click', {});
  assert.equal(h.els.pause.classList.contains('hidden'), false, 'pause overlay visible when paused');
  assert.equal(h.els.pauseBtn.classList.contains('hidden'), true, 'pause button hidden while paused');
  assert.equal(h.els.stickKnob.style.transform, 'translate(0px, 0px)', 'pause releases active joystick input');
  assert.ok(h.win.localStorage.getItem('neon-serpent-pause') !== null, 'pause state saved to localStorage');

  h.fireEl('resumeBtn', 'click', {});
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'pause overlay hidden after resume');
  assert.equal(h.els.pauseBtn.classList.contains('hidden'), false, 'pause button visible after resume');
  assert.equal(h.win.localStorage.getItem('neon-serpent-pause'), null, 'pause state removed from localStorage on resume');

  // Escape key toggles pause
  h.fireWin('keydown', { code: 'Escape' });
  assert.equal(h.els.pause.classList.contains('hidden'), false, 'Escape key pauses game');
  h.fireWin('keydown', { code: 'Escape' });
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'second Escape resumes game');

  // new game from pause overlay
  h.fireWin('keydown', { code: 'Escape' });   // pause again
  h.fireEl('newGameBtn', 'click', {});
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'pause overlay hidden after New Game');
  assert.equal(h.els.pauseBtn.classList.contains('hidden'), false, 'pause button visible after New Game');

  assert.ok(true, 'reached the end with no exceptions');
});
