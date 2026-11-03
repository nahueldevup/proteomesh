import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActivePopoverId,
  setActivePopoverId,
  closeActivePopover,
  releaseIfActive,
  subscribePopover,
} from '../src/lib/popoverStore.ts';

test('popoverStore: inicialmente null', () => {
  closeActivePopover();
  assert.equal(getActivePopoverId(), null);
});

test('popoverStore: abrir A activa A', () => {
  setActivePopoverId('card:phone-1:router');
  assert.equal(getActivePopoverId(), 'card:phone-1:router');
});

test('popoverStore: abrir B cierra A y activa B', () => {
  setActivePopoverId('card:phone-1:router');
  setActivePopoverId('focus:phone-2:apk');
  assert.equal(getActivePopoverId(), 'focus:phone-2:apk');
});

test('popoverStore: closeActivePopover deja el store en null', () => {
  setActivePopoverId('card:phone-1:text');
  closeActivePopover();
  assert.equal(getActivePopoverId(), null);
});

test('popoverStore: releaseIfActive libera solo si coincide el id', () => {
  setActivePopoverId('card:phone-1:bell');

  // Intentar liberar un id distinto (ej. componente B que se desmonta)
  const releasedWrong = releaseIfActive('card:phone-2:bell');
  assert.equal(releasedWrong, false);
  assert.equal(getActivePopoverId(), 'card:phone-1:bell'); // Sigue activo

  // Liberar el id correcto (componente A que se desmonta o cierra)
  const releasedCorrect = releaseIfActive('card:phone-1:bell');
  assert.equal(releasedCorrect, true);
  assert.equal(getActivePopoverId(), null);
});

test('popoverStore: subscribePopover notifica al cambiar y no notifica con mismo id', () => {
  closeActivePopover();
  let calls = 0;
  const unsubscribe = subscribePopover(() => calls++);

  setActivePopoverId('card:phone-1:url');
  assert.equal(calls, 1);

  // Mismo id: no dispara notificación redundante
  setActivePopoverId('card:phone-1:url');
  assert.equal(calls, 1);

  // Cambio de id
  setActivePopoverId('bulk:text');
  assert.equal(calls, 2);

  // Unsubscribe
  unsubscribe();
  setActivePopoverId(null);
  assert.equal(calls, 2); // Ya no se incrementa
});
