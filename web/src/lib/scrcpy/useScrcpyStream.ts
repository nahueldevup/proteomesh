import { useEffect, useRef, useState, useCallback } from 'react';
import {
  parseSpsCodec,
  createVideoSettingsBuffer,
  createTouchBuffer,
  createScrollBuffer,
  createKeycodeBuffer,
  createTextBuffer,
  TouchAction,
  AndroidKeyCode,
} from './protocol';
import { clientToVideo } from './coords';

export type ScrcpyStatus =
  | 'idle'
  | 'connecting'
  | 'waiting-idr'
  | 'live'
  | 'reconnecting'
  | 'error';

export interface ScrcpyTelemetry {
  framesPainted: number;
  fpsPainted: number;
  decodeQueueSizeMax: number;
  bufferedAmountMax: number;
  reconnects: number;
  firstFrameMs: number | null;
  decoderConfig: string;
}

interface UseScrcpyStreamOptions {
  adbPort: number;
  width?: number;
  height?: number;
  enabled?: boolean;
  onFirstFrame?: () => void;
  onError?: (err: Error) => void;
}

function concatBuffers(a: Uint8Array | null, b: Uint8Array): Uint8Array {
  if (!a) return b;
  const c = new Uint8Array(a.length + b.length);
  c.set(a, 0);
  c.set(b, a.length);
  return c;
}

// Límites solicitados al encoder. Se escala de forma uniforme para no distorsionar
// la relación de aspecto del dispositivo.
const MAX_TARGET_WIDTH = 720;
const MAX_TARGET_HEIGHT = 1560;

const SCROLL_THROTTLE_MS = 25;
const DECODE_QUEUE_HIGH = 8;
const DECODE_QUEUE_HIGH_DURATION_MS = 1000;
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
const MAX_RECONNECT_ATTEMPTS = 20;

function computeTargetSize(width: number, height: number) {
  const scale = Math.min(1, MAX_TARGET_WIDTH / width, MAX_TARGET_HEIGHT / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function useScrcpyStream({
  adbPort,
  width = 720,
  height = 1560,
  enabled = true,
  onFirstFrame,
  onError,
}: UseScrcpyStreamOptions) {
  const { width: targetWidth, height: targetHeight } = computeTargetSize(width, height);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [status, setStatus] = useState<ScrcpyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const [fps, setFps] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [telemetry, setTelemetry] = useState<ScrcpyTelemetry>({
    framesPainted: 0,
    fpsPainted: 0,
    decodeQueueSizeMax: 0,
    bufferedAmountMax: 0,
    reconnects: 0,
    firstFrameMs: null,
    decoderConfig: 'unknown',
  });

  const statusRef = useRef<ScrcpyStatus>('idle');
  const setStatusAndRef = useCallback((next: ScrcpyStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const onFirstFrameRef = useRef(onFirstFrame);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
    onErrorRef.current = onError;
  }, [onFirstFrame, onError]);

  const videoSizeRef = useRef<{ width: number; height: number }>({
    width: targetWidth,
    height: targetHeight,
  });

  const bufferRef = useRef<Uint8Array | null>(null);
  const hadIdrRef = useRef(false);
  const firstFrameFiredRef = useRef(false);
  const configSentRef = useRef(false);

  const pendingFrameRef = useRef<VideoFrame | null>(null);
  const rafRef = useRef<number | null>(null);

  const pendingMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const flushMoveRafRef = useRef<number | null>(null);

  const lastScrollTimeRef = useRef(0);
  const queueHighSinceRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const telemetryRef = useRef<ScrcpyTelemetry>(telemetry);
  const sessionStartRef = useRef<number>(0);

  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  const sendRaw = useCallback((buffer: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buffer);
      telemetryRef.current.bufferedAmountMax = Math.max(
        telemetryRef.current.bufferedAmountMax,
        ws.bufferedAmount
      );
    }
  }, []);

  const sendTouchImpl = useCallback(
    (action: number, clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y, inside } = clientToVideo(
        canvas,
        clientX,
        clientY,
        videoSizeRef.current.width || targetWidth,
        videoSizeRef.current.height || targetHeight
      );
      if (!inside) return;

      const buf = createTouchBuffer(
        action,
        x,
        y,
        videoSizeRef.current.width || targetWidth,
        videoSizeRef.current.height || targetHeight
      );
      sendRaw(buf);
    },
    [targetWidth, targetHeight, sendRaw]
  );

  const flushPendingMove = useCallback(() => {
    flushMoveRafRef.current = null;
    const move = pendingMoveRef.current;
    if (!move) return;
    pendingMoveRef.current = null;
    sendTouchImpl(TouchAction.ACTION_MOVE, move.clientX, move.clientY);
  }, [sendTouchImpl]);

  const sendTouch = useCallback(
    (action: number, clientX: number, clientY: number) => {
      if (action === TouchAction.ACTION_MOVE) {
        pendingMoveRef.current = { clientX, clientY };
        if (flushMoveRafRef.current === null) {
          flushMoveRafRef.current = requestAnimationFrame(flushPendingMove);
        }
        return;
      }

      // DOWN / UP deben descargar cualquier MOVE pendiente y enviarse inmediatamente
      // para preservar el orden (especialmente el UP).
      if (flushMoveRafRef.current !== null) {
        cancelAnimationFrame(flushMoveRafRef.current);
        flushMoveRafRef.current = null;
      }
      const move = pendingMoveRef.current;
      if (move) {
        pendingMoveRef.current = null;
        sendTouchImpl(TouchAction.ACTION_MOVE, move.clientX, move.clientY);
      }
      sendTouchImpl(action, clientX, clientY);
    },
    [flushPendingMove, sendTouchImpl]
  );

  const sendScroll = useCallback(
    (clientX: number, clientY: number, deltaX: number, deltaY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const now = performance.now();
      if (now - lastScrollTimeRef.current < SCROLL_THROTTLE_MS) return;
      lastScrollTimeRef.current = now;

      const { x, y, insideVideo } = clientToVideo(
        canvas,
        clientX,
        clientY,
        videoSizeRef.current.width || targetWidth,
        videoSizeRef.current.height || targetHeight
      );
      if (!insideVideo) return;

      const hScroll = deltaX > 0 ? -1 : deltaX < 0 ? 1 : 0;
      const vScroll = deltaY > 0 ? -1 : deltaY < 0 ? 1 : 0;
      if (hScroll === 0 && vScroll === 0) return;

      const buf = createScrollBuffer(
        x,
        y,
        videoSizeRef.current.width || targetWidth,
        videoSizeRef.current.height || targetHeight,
        hScroll,
        vScroll
      );
      sendRaw(buf);
    },
    [targetWidth, targetHeight, sendRaw]
  );

  const sendKeyCode = useCallback(
    (action: number, keyCode: number, metaState = 0) => {
      const buf = createKeycodeBuffer(action, keyCode, metaState);
      sendRaw(buf);
    },
    [sendRaw]
  );

  const sendText = useCallback(
    (text: string) => {
      const buf = createTextBuffer(text);
      sendRaw(buf);
    },
    [sendRaw]
  );

  const reconnectNow = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    setError(null);
    setRetryVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !adbPort || typeof window === 'undefined') {
      setStatusAndRef('idle');
      return;
    }

    if (!('VideoDecoder' in window)) {
      const err = new Error('WebCodecs no es soportado por este navegador');
      setStatusAndRef('error');
      setError(err.message);
      onErrorRef.current?.(err);
      return;
    }

    let active = true;
    sessionStartRef.current = Date.now();
    setHasFirstFrame(false);
    setFps(0);
    setError(null);
    setStatusAndRef('connecting');
    bufferRef.current = null;
    hadIdrRef.current = false;
    firstFrameFiredRef.current = false;
    configSentRef.current = false;
    videoSizeRef.current = { width: targetWidth, height: targetHeight };
    queueHighSinceRef.current = null;
    telemetryRef.current = {
      framesPainted: 0,
      fpsPainted: 0,
      decodeQueueSizeMax: 0,
      bufferedAmountMax: 0,
      reconnects: 0,
      firstFrameMs: null,
      decoderConfig: 'unknown',
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctxRef.current = canvas.getContext('2d', { alpha: false, desynchronized: true });
      ctxRef.current?.clearRect(0, 0, canvas.width, canvas.height);
    }

    const scheduleReconnect = () => {
      if (!active || reconnectTimerRef.current) return;
      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setStatusAndRef('error');
        setError('Máximo de reconexiones alcanzado');
        return;
      }
      const attempt = reconnectAttemptRef.current;
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      telemetryRef.current.reconnects += 1;
      setStatusAndRef('reconnecting');
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!active) return;
        setRetryVersion((v) => v + 1);
      }, delay);
    };

    const drawPending = () => {
      rafRef.current = null;
      const frame = pendingFrameRef.current;
      if (!frame || !active) {
        frame?.close();
        pendingFrameRef.current = null;
        return;
      }
      pendingFrameRef.current = null;

      const cvs = canvasRef.current;
      if (!cvs) {
        frame.close();
        return;
      }

      if (cvs.width !== frame.displayWidth || cvs.height !== frame.displayHeight) {
        cvs.width = frame.displayWidth;
        cvs.height = frame.displayHeight;
        ctxRef.current = cvs.getContext('2d', { alpha: false, desynchronized: true });
      }

      const ctx = ctxRef.current;
      if (!ctx) {
        frame.close();
        return;
      }

      ctx.drawImage(frame, 0, 0);
      frame.close();
      telemetryRef.current.framesPainted += 1;
    };

    const decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        if (!active) {
          frame.close();
          return;
        }

        if (frame.displayWidth && frame.displayHeight) {
          videoSizeRef.current = {
            width: frame.displayWidth,
            height: frame.displayHeight,
          };
        }

        // latest-frame-wins: solo mantenemos el frame más reciente pendiente de pintar.
        if (pendingFrameRef.current) {
          pendingFrameRef.current.close();
        }
        pendingFrameRef.current = frame;
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(drawPending);
        }

        if (!firstFrameFiredRef.current) {
          firstFrameFiredRef.current = true;
          setHasFirstFrame(true);
          setStatusAndRef('live');
          reconnectAttemptRef.current = 0;
          telemetryRef.current.firstFrameMs = Date.now() - sessionStartRef.current;
          onFirstFrameRef.current?.();
        }
      },
      error: (e) => {
        if (!active) return;
        console.error('[WebCodecs] Error en decodificador:', e);
        setStatusAndRef('error');
        setError(e.message);
        onErrorRef.current?.(new Error(e.message));
        scheduleReconnect();
      },
    });
    decoderRef.current = decoder;

    const configureDecoder = async (codec: string) => {
      try {
        const prefer = {
          codec,
          optimizeForLatency: true,
          hardwareAcceleration: 'prefer-hardware',
        } as VideoDecoderConfig;
        const supported = await VideoDecoder.isConfigSupported(prefer);
        if (supported.supported) {
          decoder.configure(prefer);
          telemetryRef.current.decoderConfig = 'prefer-hardware';
          return;
        }
      } catch {
        // fallthrough
      }
      const fallback: VideoDecoderConfig = { codec, optimizeForLatency: true };
      decoder.configure(fallback);
      telemetryRef.current.decoderConfig = 'software/no-preference';
    };

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/ws-scrcpy/?action=proxy-adb&remote=tcp:8886&udid=127.0.0.1:${adbPort}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (!active) return;
      setStatusAndRef('waiting-idr');
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!active || !(event.data instanceof ArrayBuffer)) return;
      const data = new Uint8Array(event.data);

      if (
        data.length >= 14 &&
        data[0] === 0x73 &&
        data[1] === 0x63 &&
        data[2] === 0x72 &&
        data[3] === 0x63 &&
        data[4] === 0x70 &&
        data[5] === 0x79
      ) {
        if (!configSentRef.current) {
          configSentRef.current = true;
          const configBuf = createVideoSettingsBuffer(targetWidth, targetHeight, 30, 2000000);
          ws.send(configBuf);
        }
        return;
      }

      if (data.length < 5) return;
      const naluType = data[4] & 0x1f;
      const isSps = naluType === 7;
      const isPps = naluType === 8;
      const isIdr = naluType === 5;

      if (isSps) {
        const codec = parseSpsCodec(data);
        configureDecoder(codec).catch((err) => {
          console.warn('[WebCodecs] Error al configurar decoder:', err);
        });
        bufferRef.current = concatBuffers(bufferRef.current, data);
        hadIdrRef.current = false;
        return;
      }

      if (isPps) {
        bufferRef.current = concatBuffers(bufferRef.current, data);
        return;
      }

      const chunk = concatBuffers(bufferRef.current, data);
      hadIdrRef.current = hadIdrRef.current || isIdr;

      if (chunk && decoder.state === 'configured' && hadIdrRef.current) {
        bufferRef.current = null;
        try {
          const queueSize = (decoder as unknown as { decodeQueueSize: number }).decodeQueueSize ?? 0;
          telemetryRef.current.decodeQueueSizeMax = Math.max(
            telemetryRef.current.decodeQueueSizeMax,
            queueSize
          );

          if (queueSize > DECODE_QUEUE_HIGH) {
            if (!queueHighSinceRef.current) {
              queueHighSinceRef.current = performance.now();
            } else if (
              performance.now() - queueHighSinceRef.current >
              DECODE_QUEUE_HIGH_DURATION_MS
            ) {
              queueHighSinceRef.current = null;
              console.warn('[useScrcpyStream] Cola de decode alta. Reiniciando sesión.');
              ws.close();
              decoder.close();
              scheduleReconnect();
              return;
            }
          } else {
            queueHighSinceRef.current = null;
          }

          decoder.decode(
            new EncodedVideoChunk({
              type: isIdr ? 'key' : 'delta',
              timestamp: Math.round(performance.now() * 1000),
              data: chunk,
            })
          );
        } catch {
          // Ignorar chunks corruptos durante la inicialización
        }
      }
    };

    ws.onerror = (e) => {
      if (active) {
        console.warn(`[useScrcpyStream] Error WebSocket en :${adbPort}:`, e);
      }
    };

    ws.onclose = () => {
      if (!active) return;
      setStatusAndRef('reconnecting');
      scheduleReconnect();
    };

    const telemetryInterval = window.setInterval(() => {
      if (!active) return;
      const elapsed = (Date.now() - sessionStartRef.current) / 1000 || 1;
      telemetryRef.current.fpsPainted = Math.round(
        telemetryRef.current.framesPainted / elapsed
      );
      setFps(telemetryRef.current.fpsPainted);
      setTelemetry({ ...telemetryRef.current });
    }, 1000);

    return () => {
      active = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      window.clearInterval(telemetryInterval);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingFrameRef.current?.close();
      pendingFrameRef.current = null;
      setHasFirstFrame(false);
      setFps(0);

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;

      try {
        if (decoder.state !== 'closed') {
          decoder.close();
        }
      } catch {
        // Silenciar
      }
      decoderRef.current = null;
    };
  }, [enabled, adbPort, targetWidth, targetHeight, setStatusAndRef, retryVersion]);

  return {
    canvasRef,
    status,
    error,
    isConnected: status !== 'idle' && status !== 'error',
    hasFirstFrame,
    fps,
    telemetry,
    sendTouch,
    sendScroll,
    sendKeyCode,
    sendText,
    reconnectNow,
    TouchAction,
    AndroidKeyCode,
  };
}
