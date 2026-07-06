// Integration smoke test: boot the real browser entry (main.js) under DOM stubs
// and drive menu -> play, mouse steer+boost, simultaneous joystick+boost, keyboard,
// resize, slow frames and tab-visibility. Guards against import/wiring breakage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installStubs } from './helpers/dom-stub.js';
import { LS_GAMES_PLAYED_KEY, LS_XP_KEY, MIN_BOOST_MASS, START_MASS } from '../src/constants.js';
import { achievementBonus, evaluateAchievements, readCompletedAchievements } from '../src/achievements.js';
import * as world from '../src/world.js';

test('main menu places Resume before New Game', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="menuResumeBtn"') < html.indexOf('id="playBtn"'), 'Resume appears above New Game in the menu markup');
  assert.equal(html.includes('id="bestDead"'), false, 'best score is reserved for profile, not the death screen');
  assert.equal(html.includes('id="bestKillsDead"'), false, 'best kills is reserved for profile, not the death screen');
  assert.ok(html.indexOf('id="profileBtn"') > html.indexOf('id="playBtn"'), 'Profile is a secondary menu action');
});

test('browser entry boots and handles all input paths without throwing', async () => {
  const h = installStubs();
  h.win.localStorage.setItem(LS_XP_KEY, '1e309');
  await import('../src/main.js');       // boots into menu + starts the loop

  h.advance(60, 16.7);                  // idle menu frames
  assert.equal(h.els.menu.classList.contains('hidden'), false, 'main menu is visible on boot');
  assert.equal(h.els.playBtn.textContent, 'NEW GAME', 'main menu starts fresh games');
  assert.equal(h.els.playerLevel.textContent, 'LEVEL 1', 'main menu labels XP section with current level');
  assert.equal(h.els.xpProgress.textContent, '0 / 250 XP', 'main menu XP tally includes XP unit');
  assert.equal(h.els.nextLevel.textContent, '+250 XP TO REACH LEVEL 2', 'main menu shows XP needed for next level');
  assert.equal(h.els.menuResumeBtn.classList.contains('hidden'), true, 'resume is hidden without a pause save');
  h.fireEl('profileBtn', 'click', {});
  assert.equal(h.els.profile.classList.contains('hidden'), false, 'Profile opens from the main menu');
  assert.equal(h.els.gamesPlayed.textContent, '0', 'Profile shows games played');
  assert.equal(h.els.achievementSummary.textContent, '0 / 12 COMPLETE', 'Profile summarizes achievement completion');
  assert.equal(h.els.achievementList.children.length, 4, 'Profile renders achievement groups');
  h.fireEl('profileBackBtn', 'click', {});
  assert.equal(h.els.menu.classList.contains('hidden'), false, 'Profile Back returns to main menu');
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

  h.fireEl('returnMenuBtn', 'click', {});
  assert.equal(h.els.menu.classList.contains('hidden'), false, 'Return to Menu shows main menu');
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'pause overlay hidden after Return to Menu');
  assert.equal(h.els.menuResumeBtn.classList.contains('hidden'), false, 'main menu offers Resume when a pause save exists');
  h.advance(30, 16.7);                  // menu preview should not become the real run
  h.fireEl('menuResumeBtn', 'click', {});
  assert.equal(h.els.pause.classList.contains('hidden'), false, 'menu Resume reloads the paused state');
  h.fireEl('resumeBtn', 'click', {});
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'pause overlay hidden after resume');
  assert.equal(h.els.pauseBtn.classList.contains('hidden'), false, 'pause button visible after resume');
  assert.equal(h.win.localStorage.getItem('neon-serpent-pause'), null, 'pause state removed from localStorage on resume');

  // Escape key toggles pause
  h.fireWin('keydown', { code: 'Escape' });
  assert.equal(h.els.pause.classList.contains('hidden'), false, 'Escape key pauses game');
  h.fireWin('keydown', { code: 'Escape' });
  assert.equal(h.els.pause.classList.contains('hidden'), true, 'second Escape resumes game');

  const q = world.getPlayer();
  const killsAtDeath = world.getPlayerKillCount();
  const foodAtDeath = world.getPlayerFoodCount();
  const gamesPlayedBeforeDeath = Number(h.win.localStorage.getItem(LS_GAMES_PLAYED_KEY) || 0);
  const storedXpBeforeDeath = Number(h.win.localStorage.getItem(LS_XP_KEY) || 0);
  const xpBeforeDeath = Number.isFinite(storedXpBeforeDeath) ? storedXpBeforeDeath : 0;
  q.mass = START_MASS + 1200;
  const scoreAtDeath = 1200;
  const achievementXpAtDeath = achievementBonus(evaluateAchievements({
    score: scoreAtDeath,
    kills: killsAtDeath,
    food: foodAtDeath,
  }, readCompletedAchievements(h.win.localStorage)));
  q.alive = false;
  h.advance(1, 16.7);
  assert.equal(h.els.dead.classList.contains('hidden'), false, 'dead overlay visible after player death');
  assert.equal(Number(h.win.localStorage.getItem(LS_GAMES_PLAYED_KEY)), gamesPlayedBeforeDeath + 1, 'game result is saved before death animation completes');
  assert.equal(Number(h.win.localStorage.getItem(LS_XP_KEY)), xpBeforeDeath + scoreAtDeath + achievementXpAtDeath, 'XP includes achievement bonuses before death animation completes');
  assert.equal(h.els.deadActions.classList.contains('hidden'), true, 'death actions hidden while results animate');
  assert.equal(h.els.deathImpact.textContent, `+${killsAtDeath} KILLS`, 'kills impact appears first');
  h.advance(84, 16.7);
  assert.equal(h.els.deathImpact.textContent, `+${killsAtDeath} KILLS`, 'kills stays present for at least 1.5 seconds');
  h.advance(25, 16.7);
  assert.equal(h.els.deathImpact.textContent, `+${foodAtDeath} FOOD`, 'food impact follows kills');
  h.advance(110, 16.7);
  assert.equal(h.els.deathImpact.textContent, `+${achievementXpAtDeath} BONUS`, 'achievement bonus impact follows food');
  h.advance(110, 16.7);
  assert.equal(h.els.deathScoreLine.classList.contains('hidden'), false, 'score tally appears after the bonus phase');
  assert.equal(h.els.deathXpPanel.classList.contains('hidden'), false, 'XP progress appears with score tally');
  h.advance(520, 16.7);
  assert.equal(h.els.finalScore.textContent, String(scoreAtDeath + achievementXpAtDeath), 'score tally reaches final score with bonuses');
  assert.match(h.els.deathLevelText.textContent, /^(REACHED LEVEL|LEVEL) \d+$/, 'final level text reflects level result');
  assert.equal(h.els.deadActions.classList.contains('hidden'), false, 'death actions appear after XP completes');
  assert.equal(h.els.deadActions.classList.contains('ready'), true, 'death actions fade into the ready state');
  assert.equal(h.els.respawnBtn.textContent, 'NEW GAME', 'death screen restart action is labeled New Game');
  h.fireEl('deadMenuBtn', 'click', {});
  assert.equal(h.els.menu.classList.contains('hidden'), false, 'dead screen Main Menu button shows main menu');
  assert.equal(h.els.dead.classList.contains('hidden'), true, 'dead overlay hidden after Return to Menu');

  assert.ok(true, 'reached the end with no exceptions');
});
