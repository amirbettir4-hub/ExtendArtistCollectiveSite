import { useEffect, useMemo, useRef, useState } from "react";
import type { Stroke } from "../store";

const W = 1200;
const H = 900;

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  size: number;
};

export function TimelapseReplay({
  strokes,
  duration = 8000,
  background = "#fffdf8",
  autoplay = true,
}: {
  strokes: Stroke[];
  duration?: number;
  background?: string;
  autoplay?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(autoplay);

  const segments = useMemo<Segment[]>(() => {
    const out: Segment[] = [];
    for (const s of strokes) {
      const colour = s.mode === "eraser" ? background : s.color;
      if (s.points.length === 1) {
        out.push({
          x1: s.points[0].x,
          y1: s.points[0].y,
          x2: s.points[0].x,
          y2: s.points[0].y,
          color: colour,
          size: s.size,
        });
        continue;
      }
      for (let i = 1; i < s.points.length; i++) {
        out.push({
          x1: s.points[i - 1].x,
          y1: s.points[i - 1].y,
          x2: s.points[i].x,
          y2: s.points[i].y,
          color: colour,
          size: s.size,
        });
      }
    }
    return out;
  }, [strokes, background]);

  useEffect(() => {
    if (!playing || segments.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    const msPerSegment = duration / segments.length;
    const start = performance.now();
    let drawn = 0;
    let raf = 0;

    const frame = (now: number) => {
      const target = Math.min(
        segments.length,
        Math.floor((now - start) / msPerSegment)
      );
      while (drawn < target) {
        const seg = segments[drawn];
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = seg.size;
        ctx.strokeStyle = seg.color;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
        drawn++;
      }
      if (drawn < segments.length) {
        raf = requestAnimationFrame(frame);
      } else {
        setPlaying(false);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, segments, duration, background]);

  const restart = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, W, H);
      }
    }
    setPlaying(true);
  };

  return (
    <div className="timelapse">
      <canvas ref={canvasRef} width={W} height={H} className="timelapse__canvas" />
      <div className="timelapse__controls">
        <button className="button button--outline" onClick={restart} disabled={playing}>
          {playing ? "Playing…" : "Replay"}
        </button>
        <span>{segments.length} segments</span>
      </div>
    </div>
  );
}
