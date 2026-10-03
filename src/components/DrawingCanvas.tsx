import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Stroke } from "../store";

const W = 1200;
const H = 900;

export type DrawingCanvasHandle = {
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
};

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvas(
    { color, size, mode, locked = false, background = "#fffdf8" },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const inProgress = useRef<Stroke | null>(null);

    /* Clean redraw whenever committed strokes change */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
      for (const s of strokes) drawStroke(ctx, s, background);
    }, [strokes, background]);

    useImperativeHandle(ref, () => ({
      undo: () => setStrokes((s) => s.slice(0, -1)),
      clear: () => setStrokes([]),
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
      const canvas = canvasRef.current!;
      canvas.setPointerCapture(e.pointerId);
      const p = toCanvasPoint(e);
      inProgress.current = { points: [p], color, size, mode };

      /* draw the initial dot so a tap registers */
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = mode === "eraser" ? background : color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (locked || !inProgress.current) return;
      const stroke = inProgress.current;
      const p = toCanvasPoint(e);
      const prev = stroke.points[stroke.points.length - 1];
      stroke.points.push(p);

      /* draw just the new segment — cheap and smooth */
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
        /* pointer already released */
      }
      const finished = inProgress.current;
      inProgress.current = null;
      setStrokes((s) => [...s, finished]);
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
  }
);

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  background: string
) {
  if (stroke.points.length === 0) return;
  const colour = stroke.mode === "eraser" ? background : stroke.color;

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.size;
  ctx.strokeStyle = colour;
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}
