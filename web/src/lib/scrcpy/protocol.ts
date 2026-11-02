/**
 * Protocolo binario nativo de ws-scrcpy / scrcpy-server.
 * Construye y formatea paquetes binarios para VideoSettings, Touch, KeyCode y Text.
 */

export const ControlMessageType = {
  TYPE_KEYCODE: 0,
  TYPE_TEXT: 1,
  TYPE_TOUCH: 2,
  TYPE_SCROLL: 3,
  TYPE_BACK_OR_SCREEN_ON: 4,
  TYPE_CHANGE_STREAM_PARAMETERS: 101,
} as const;

export const AndroidKeyCode = {
  KEYCODE_HOME: 3,
  KEYCODE_BACK: 4,
  KEYCODE_DPAD_UP: 19,
  KEYCODE_DPAD_DOWN: 20,
  KEYCODE_DPAD_LEFT: 21,
  KEYCODE_DPAD_RIGHT: 22,
  KEYCODE_POWER: 26,
  KEYCODE_VOLUME_UP: 24,
  KEYCODE_VOLUME_DOWN: 25,
  KEYCODE_TAB: 61,
  KEYCODE_SPACE: 62,
  KEYCODE_ENTER: 66,
  KEYCODE_DEL: 67, // Backspace
  KEYCODE_APP_SWITCH: 187, // Recientes
} as const;

export const TouchAction = {
  ACTION_DOWN: 0,
  ACTION_UP: 1,
  ACTION_MOVE: 2,
} as const;

/**
 * Parsea el encabezado de un NAL unit SPS (Type 7) para generar el codec string de WebCodecs (ej. avc1.42C02A)
 */
export function parseSpsCodec(data: Uint8Array): string {
  if (data.length < 8) return 'avc1.42C02A';
  // H.264 Annex-B start code: 00 00 00 01
  // data[4] es el NAL header (0x67)
  // data[5] = profile_idc, data[6] = constraint_set_flags, data[7] = level_idc
  const p = data[5];
  const c = data[6];
  const l = data[7];
  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `avc1.${toHex(p)}${toHex(c)}${toHex(l)}`;
}

/**
 * Crea el búfer de comando de parámetros de video (TYPE_CHANGE_STREAM_PARAMETERS = 101)
 * para iniciar la codificación H.264 en ReDroid.
 */
export function createVideoSettingsBuffer(width = 720, height = 1560, maxFps = 30, bitrate = 2000000): ArrayBuffer {
  const buf = new ArrayBuffer(36);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, ControlMessageType.TYPE_CHANGE_STREAM_PARAMETERS);
  offset += 1;
  view.setInt32(offset, bitrate, false);
  offset += 4;
  view.setInt32(offset, maxFps, false);
  offset += 4;
  view.setInt8(offset, 5); // iFrameInterval = 5s
  offset += 1;
  view.setInt16(offset, width, false);
  offset += 2;
  view.setInt16(offset, height, false);
  offset += 2;
  view.setInt16(offset, 0, false); // crop left
  offset += 2;
  view.setInt16(offset, 0, false); // crop top
  offset += 2;
  view.setInt16(offset, 0, false); // crop right
  offset += 2;
  view.setInt16(offset, 0, false); // crop bottom
  offset += 2;
  view.setInt8(offset, 0); // sendFrameMeta = false
  offset += 1;
  view.setInt8(offset, -1); // lockedOrientation = -1 (unlocked)
  offset += 1;
  view.setInt32(offset, 0, false); // displayId = 0
  offset += 4;
  view.setInt32(offset, 0, false); // codecOptions length = 0
  offset += 4;
  view.setInt32(offset, 0, false); // encoderName length = 0

  return buf;
}

/**
 * Genera el paquete binario de Touch (29 bytes: 1 byte tipo + 28 bytes payload) para toques e interacciones táctiles en pantalla.
 */
export function createTouchBuffer(
  action: number,
  x: number,
  y: number,
  width: number,
  height: number,
  pressure = action === TouchAction.ACTION_UP ? 0 : 0xffff,
  buttons = action === TouchAction.ACTION_UP ? 0 : 1
): ArrayBuffer {
  const buf = new ArrayBuffer(29);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, ControlMessageType.TYPE_TOUCH);
  offset += 1;
  view.setUint8(offset, action);
  offset += 1;
  view.setUint32(offset, 0, false); // pointerId high 32
  offset += 4;
  view.setUint32(offset, 0, false); // pointerId low 32
  offset += 4;
  view.setUint32(offset, Math.max(0, Math.round(x)), false);
  offset += 4;
  view.setUint32(offset, Math.max(0, Math.round(y)), false);
  offset += 4;
  view.setUint16(offset, width, false);
  offset += 2;
  view.setUint16(offset, height, false);
  offset += 2;
  view.setUint16(offset, pressure, false);
  offset += 2;
  view.setUint32(offset, buttons, false);

  return buf;
}

/**
 * Genera el paquete binario de Scroll (21 bytes) para desplazamiento vertical u horizontal en Android.
 */
export function createScrollBuffer(
  x: number,
  y: number,
  width: number,
  height: number,
  hScroll: number,
  vScroll: number
): ArrayBuffer {
  const buf = new ArrayBuffer(21);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, ControlMessageType.TYPE_SCROLL);
  offset += 1;
  view.setUint32(offset, Math.max(0, Math.round(x)), false);
  offset += 4;
  view.setUint32(offset, Math.max(0, Math.round(y)), false);
  offset += 4;
  view.setUint16(offset, width, false);
  offset += 2;
  view.setUint16(offset, height, false);
  offset += 2;
  view.setInt32(offset, hScroll, false);
  offset += 4;
  view.setInt32(offset, vScroll, false);

  return buf;
}

/**
 * Genera el paquete binario de KeyCode (14 bytes) para pulsaciones físicas de teclado.
 */
export function createKeycodeBuffer(action: number, keycode: number, metaState = 0): ArrayBuffer {
  const buf = new ArrayBuffer(14);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, ControlMessageType.TYPE_KEYCODE);
  offset += 1;
  view.setUint8(offset, action); // 0 = DOWN, 1 = UP
  offset += 1;
  view.setInt32(offset, keycode, false);
  offset += 4;
  view.setInt32(offset, 0, false); // repeat = 0
  offset += 4;
  view.setInt32(offset, metaState, false);

  return buf;
}

/**
 * Genera el paquete binario de Texto (UTF-8) para inyección directa de caracteres en campos de Android.
 */
export function createTextBuffer(text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const buf = new ArrayBuffer(1 + 4 + textBytes.length);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint8(offset, ControlMessageType.TYPE_TEXT);
  offset += 1;
  view.setUint32(offset, textBytes.length, false);
  offset += 4;

  new Uint8Array(buf, offset).set(textBytes);
  return buf;
}
