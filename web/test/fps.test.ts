import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWindowFps,
  setFpsValue,
  subscribeFps,
  getFpsSnapshot,
} from '../src/lib/scrcpy/fps.ts';

test('computeWindowFps: 30 frames en 1000ms => 30', () => {
  assert.equal(computeWindowFps(30, 1000), 30);
});

test('computeWindowFps: 15 frames en 500ms => 30', () => {
  assert.equal(computeWindowFps(15, 500), 30);
});

test('computeWindowFps: 0 frames => 0', () => {
  assert.equal(computeWindowFps(0, 1000), 0);
});

test('computeWindowFps: windowMs <= 0 se trata como 1s (sin division por cero)', () => {
  assert.equal(computeWindowFps(12, 0), 12);
  assert.equal(computeWindowFps(12, -5), 12);
});

test('computeWindowFps: redondea al entero mas cercano', () => {
  assert.equal(computeWindowFps(10, 3000), 3); // 10/3 = 3.33 -> 3
});

test('setFpsValue notifica solo cuando el valor cambia', () => {
  setFpsValue(0);
  let calls = 0;
  const unsubscribe = subscribeFps(() => calls++);
  setFpsValue(0); // mismo valor: no notifica
  assert.equal(calls, 0);
  setFpsValue(24);
  assert.equal(calls, 1);
  assert.equal(getFpsSnapshot(), 24);
  unsubscribe();
});
