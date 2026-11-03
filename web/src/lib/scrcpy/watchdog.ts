/**
 * Constantes y lógica de evaluación del watchdog de primer frame para scrcpy.
 *
 * Si tras conectar el WebSocket no se recibe ni decodifica ningún frame (IDR)
 * en FIRST_FRAME_TIMEOUT_MS, se reintenta la conexión un máximo de
 * MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS veces antes de suspender y solicitar
 * reintento manual.
 */

export const FIRST_FRAME_TIMEOUT_MS = 6000;
export const MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS = 3;

export interface WatchdogEvaluation {
  nextAttempt: number;
  exhausted: boolean;
}

export interface ShouldHandleSocketCloseParams {
  active: boolean;
  isCurrentSocket: boolean;
  currentStatus: string;
}

/**
 * Determina si debe procesarse el evento `onclose` de un WebSocket.
 * Ignora el evento si:
 * - El componente ya no está activo/montado.
 * - El evento proviene de un socket que ya no es el actual (descartado/obsoleto).
 * - El estado actual ya es 'error' definitivo (protege contra carreras que
 *   sobrescribirían el error con un nuevo intento de reconexión).
 */
export function shouldHandleSocketClose({
  active,
  isCurrentSocket,
  currentStatus,
}: ShouldHandleSocketCloseParams): boolean {
  if (!active) return false;
  if (!isCurrentSocket) return false;
  if (currentStatus === 'error') return false;
  return true;
}

/**
 * Evalúa la expiración del temporizador de primer frame.
 * Incrementa el contador de intentos y determina si se agotaron las oportunidades.
 */
export function evaluateFirstFrameTimeout(
  currentAttempt: number,
  maxAttempts: number = MAX_FIRST_FRAME_TIMEOUT_ATTEMPTS
): WatchdogEvaluation {
  const nextAttempt = currentAttempt + 1;
  return {
    nextAttempt,
    exhausted: nextAttempt >= maxAttempts,
  };
}
