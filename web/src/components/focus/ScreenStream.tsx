import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';

interface ScreenStreamProps {
  name: string;
  running: boolean;
  fps?: number;
  active?: boolean;
  onFirstFrame?: () => void;
}

export default function ScreenStream({ name, running, fps = 3, active = true, onFirstFrame }: ScreenStreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onFirstFrameRef = useRef(onFirstFrame);

  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    if (!running || !active) return;
    let alive = true;
    let gotFrame = false;
    let pollTimer: number | undefined;
    let ws: WebSocket | null = null;
    const canvas = canvasRef.current;

    const draw = async (blob: Blob) => {
      if (!canvas || !alive) return;
      try {
        const bitmap = await createImageBitmap(blob);
        if (!alive || !canvas) {
          bitmap.close();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        if (!gotFrame) {
          gotFrame = true;
          onFirstFrameRef.current?.();
        }
      } catch {
        // frame corrupto o navegador sin createImageBitmap
      }
    };

    const startPolling = () => {
      if (pollTimer !== undefined || !alive) return;
      const tick = () => {
        const img = new Image();
        img.onload = () => {
          if (!alive || !canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
          if (!gotFrame) {
            gotFrame = true;
            onFirstFrameRef.current?.();
          }
        };
        img.src = api.getScreenUrl(name);
      };
      tick();
      pollTimer = window.setInterval(tick, 1500);
    };

    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/api/v1/instances/${name}/ws-stream?fps=${fps}`);
      ws.binaryType = 'blob';
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') return;
        void draw(ev.data as Blob);
      };
      ws.onerror = () => {
        if (!gotFrame) startPolling();
      };
      ws.onclose = () => {
        if (!gotFrame) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      alive = false;
      ws?.close();
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
    };
  }, [name, running, active, fps]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full object-contain"
      width={270}
      height={585}
    />
  );
}
