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

test('store: cada instancia (clave) tiene su propio valor', () => {
  setFpsValue(5580, 30);
  setFpsValue(5581, 15);
  assert.equal(getFpsSnapshot(5580), 30);
  assert.equal(getFpsSnapshot(5581), 15);
  assert.equal(getFpsSnapshot(9999), 0); // clave desconocida => 0
});

test('store: setFpsValue notifica solo cuando el valor cambia', () => {
  setFpsValue(5580, 0);
  let calls = 0;
  const unsubscribe = subscribeFps(5580, () => calls++);
  setFpsValue(5580, 0); // mismo valor: no notifica
  assert.equal(calls, 0);
  setFpsValue(5580, 24);
  assert.equal(calls, 1);
  assert.equal(getFpsSnapshot(5580), 24);
  unsubscribe();
});

test('store: unsubscribe deja de notificar y resetear a 0 no notifica a otros', () => {
  setFpsValue(5580, 60);
  let callsA = 0;
  let callsB = 0;
  const unsubA = subscribeFps(5580, () => callsA++);
  subscribeFps(5581, () => callsB++);

  setFpsValue(5580, 0); // reset de la instancia A
  assert.equal(callsA, 1);
  assert.equal(callsB, 0); // B no se ve afectado

  unsubA();
  setFpsValue(5580, 42);
  assert.equal(callsA, 1); // ya desuscrito
  assert.equal(callsB, 0);
});
