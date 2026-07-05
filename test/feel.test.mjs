import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraGrow, BASE_SPEED, BOOST_SPEED } from '../src/constants.js';
import { Snake } from '../src/snake.js';

test('camera zoom growth is gentler for large snakes', () => {
  const OLD_CAMERA_GROW_START_R = 7;
  const OLD_CAMERA_GROW_RATE = 0.05;
  const OLD_CAMERA_GROW_MAX = 1;
  const oldGrow = r => 1 + Math.min(OLD_CAMERA_GROW_MAX, Math.max(0, r - OLD_CAMERA_GROW_START_R) * OLD_CAMERA_GROW_RATE);
  assert.equal(cameraGrow(7), 1);
  assert.ok(cameraGrow(12) < oldGrow(12), 'mid-size snakes should keep more screen presence');
  assert.ok(cameraGrow(32) < oldGrow(32), 'large snakes should zoom out less than before');
  assert.equal(cameraGrow(100), 1.7, 'zoom growth should cap to avoid over-zooming out');
});

test('snake movement speed is independent of size', () => {
  const dt = 0.5;
  const small = new Snake(1000, 1000, 0, false);
  const big = new Snake(1000, 1000, 1, false);
  small.mass = 10;
  big.mass = 800;
  small.dir = 0; small.targetAngle = 0;
  big.dir = 0; big.targetAngle = 0;

  small.update(dt);
  big.update(dt);
  assert.equal(small.x - 1000, BASE_SPEED * dt);
  assert.equal(big.x - 1000, BASE_SPEED * dt);

  const smallBoost = new Snake(1000, 1000, 0, false);
  const bigBoost = new Snake(1000, 1000, 1, false);
  smallBoost.mass = 30;
  bigBoost.mass = 800;
  smallBoost.boost = true;
  bigBoost.boost = true;
  smallBoost.dir = 0; smallBoost.targetAngle = 0;
  bigBoost.dir = 0; bigBoost.targetAngle = 0;

  smallBoost.update(dt);
  bigBoost.update(dt);
  assert.equal(smallBoost.x - 1000, BOOST_SPEED * dt);
  assert.equal(bigBoost.x - 1000, BOOST_SPEED * dt);
});
