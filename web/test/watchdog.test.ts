import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_FRAME_TIMEOUT_MS,
  MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS,
  evaluateFirstFrameTimeout,
} from '../src/lib/scrcpy/watchdog.ts';

test('watchdog: constantes con valores esperados', () => {
  assert.equal(FIRST_FRAME_TIMEOUT_MS, 6000);
  assert.equal(MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS, 3);
});

test('watchdog: primer timeout pasa a intento 1 y no se agota', () => {
  const res = evaluateFirstFrameTimeout(0);
  assert.equal(res.nextAttempt, 1);
  assert.equal(res.exhausted, false);
});

test('watchdog: segundo timeout pasa a intento 2 y no se agota', () => {
  const res = evaluateFirstFrameTimeout(1);
  assert.equal(res.nextAttempt, 2);
  assert.equal(res.exhausted, false);
});

test('watchdog: tercer timeout pasa a intento 3 y se agota (exhausted = true)', () => {
  const res = evaluateFirstFrameTimeout(2);
  assert.equal(res.nextAttempt, 3);
  assert.equal(res.exhausted, true);
});

test('watchdog: intentos posteriores se mantienen agotados', () => {
  const res = evaluateFirstFrameTimeout(3);
  assert.equal(res.nextAttempt, 4);
  assert.equal(res.exhausted, true);
});

test('watchdog: soporta maxAttempts configurable', () => {
  const res = evaluateFirstFrameTimeout(0, 1);
  assert.equal(res.nextAttempt, 1);
  assert.equal(res.exhausted, true);
});
