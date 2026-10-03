import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { RoomMessage, Stroke } from "../lib/realtime";

const W = 1200;
const H = 900;

export type LiveCanvasHandle = {
  undo: () => void;
  clear: () => void;
  getStrokes: () => Stroke[];
  toDataURL: () => string;
};

type Props = {
  color: string;
  size: number;
  mode: "brush" | "eraser";
  locked?: boolean;
  background?: string;
  myUserId: string;
  send: (msg: RoomMessage) => void;
  remoteStrokes: Stroke[];
  liveStrokesRef: React.MutableRefObject<{ [userId: string]: Stroke }>;
};

export const LiveCanvas = forwardRef<LiveCanvasHandle, Props>(function LiveCanvas(
  {
    color,
    size,
    mode,
    locked = false,
    background = "#fffdf8",
    myUserId,
    send,
    remoteStrokes,
    liveStrokesRef,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const inProgress = useRef<Stroke | null>(null);
  const cursorThrottle = useRef(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    for (const s of strokes) drawStroke(ctx, s, background);
    for (const s of remoteStrokes) drawStroke(ctx, s, background);
    for (const s of Object.values(liveStrokesRef.current)) {
      drawStroke(ctx, s, background);
    }
  }, [strokes, remoteStrokes, background, liveStrokesRef]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (Object.keys(liveStrokesRef.current).length > 0) redraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [redraw, liveStrokesRef]);

  useImperativeHandle(ref, () => ({
    undo: () => {
      setStrokes((s) => (s.length > 0 ? s.slice(0, -1) : s));
    },
    clear: () => {
      setStrokes([]);
      send({ type: "clear", userId: myUserId });
    },
    getStrokes: () => strokes,
    toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
  }));

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (locked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const p = toCanvasPoint(e);
    const stroke: Stroke = { points: [p], color, size, mode };
    inProgress.current = stroke;
    send({ type: "stroke-start", stroke, userId: myUserId });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = mode === "eraser" ? background : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e);

    const now = performance.now();
    if (now - cursorThrottle.current > 50) {
      cursorThrottle.current = now;
      send({ type: "cursor", x: p.x, y: p.y, userId: myUserId });
    }

    if (locked || !inProgress.current) return;
    const stroke = inProgress.current;
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(p);
    send({ type: "stroke-point", x: p.x, y: p.y, userId: myUserId });

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = stroke.mode === "eraser" ? background : stroke.color;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inProgress.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const finished = inProgress.current;
    inProgress.current = null;
    setStrokes((s) => [...s, finished]);
    send({ type: "stroke-commit", stroke: finished, userId: myUserId });
  };

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className={`drawing-canvas ${locked ? "drawing-canvas--locked" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
      onPointerLeave={finishStroke}
      style={{ touchAction: "none", cursor: locked ? "default" : "crosshair" }}
    />
  );
});

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, bg: string) {
  if (s.points.length === 0) return;
  const colour = s.mode === "eraser" ? bg : s.color;

  if (s.points.length === 1) {
    const p = s.points[0];
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  ctx.strokeStyle = colour;
  ctx.beginPath();
  ctx.moveTo(s.points[0].x, s.points[0].y);
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x, s.points[i].y);
  }
  ctx.stroke();
}