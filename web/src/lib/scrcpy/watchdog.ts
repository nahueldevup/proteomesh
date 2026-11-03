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
