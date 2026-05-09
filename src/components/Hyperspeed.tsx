import { useEffect, useRef } from "react";

interface HyperspeedProps {
  background?: string;
  roadColor?: string;
  leftCars?: string[];
  rightCars?: string[];
  sticks?: string;
  opacity?: number;
  /** Quality: "low" | "medium" | "high" — affects streak count & blur. */
  quality?: "low" | "medium" | "high";
}

interface Streak {
  side: -1 | 1;       // -1 = left lane, 1 = right lane
  lane: number;       // 0..lanes-1 within side
  z: number;          // 0 = far, 1 = near
  speed: number;
  color: string;
  length: number;     // 0..1 of trail length
}

/**
 * Lightweight Hyperspeed-style background using Canvas2D.
 * Two-lane perspective road with streaking light trails.
 * No three.js / postprocessing dependencies — keeps bundle small.
 */
export default function Hyperspeed({
  background = "#000000",
  roadColor = "#080808",
  leftCars = ["#d856bf", "#6750a2", "#c247ac"],
  rightCars = ["#03b3c3", "#0e5ea5", "#324555"],
  sticks = "#03b3c3",
  opacity = 0.85,
  quality = "medium",
}: HyperspeedProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dprCap = quality === "low" ? 1 : quality === "medium" ? 1.25 : 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const lanes = 3;
    const streakCount =
      quality === "low" ? 60 : quality === "medium" ? 110 : 180;

    let w = 0;
    let h = 0;
    let horizonY = 0;
    let cx = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizonY = h * 0.55;
      cx = w / 2;
    }
    resize();
    window.addEventListener("resize", resize);

    const streaks: Streak[] = [];
    function spawn(initial = false) {
      const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
      const palette = side === -1 ? leftCars : rightCars;
      streaks.push({
        side,
        lane: Math.floor(Math.random() * lanes),
        z: initial ? Math.random() : Math.random() * 0.15,
        speed: 0.0035 + Math.random() * 0.006,
        color: palette[Math.floor(Math.random() * palette.length)],
        length: 0.06 + Math.random() * 0.12,
      });
    }
    for (let i = 0; i < streakCount; i++) spawn(true);

    // Project a road-space point (sideOffset in lanes, z 0..1) to screen.
    function project(side: -1 | 1, lane: number, z: number) {
      // Perspective: scale grows from 0 (horizon) to 1 (near)
      const t = z; // 0 far, 1 near
      const persp = 0.05 + t * t * 0.95; // ease in
      const roadHalf = 30 + persp * (w * 0.55);
      const laneOffset = (lane + 0.5) / lanes; // 0..1
      const x = cx + side * laneOffset * roadHalf;
      const y = horizonY + persp * (h - horizonY);
      const size = 1.2 + persp * 6;
      return { x, y, size, persp };
    }

    function drawRoad() {
      // Sky/background
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);

      // Road trapezoid
      const nearHalf = w * 0.6;
      ctx.fillStyle = roadColor;
      ctx.beginPath();
      ctx.moveTo(cx - 12, horizonY);
      ctx.lineTo(cx + 12, horizonY);
      ctx.lineTo(cx + nearHalf, h);
      ctx.lineTo(cx - nearHalf, h);
      ctx.closePath();
      ctx.fill();

      // Center divider sticks
      ctx.strokeStyle = sticks;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 14; i++) {
        const t = ((i / 14) + (performance.now() * 0.0002) % (1 / 14)) % 1;
        const persp = 0.05 + t * t * 0.95;
        const y = horizonY + persp * (h - horizonY);
        const len = 4 + persp * 22;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Horizon glow
      const grad = ctx.createRadialGradient(cx, horizonY, 0, cx, horizonY, w * 0.4);
      grad.addColorStop(0, "rgba(3,179,195,0.18)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, horizonY - 80, w, 220);
    }

    function step() {
      drawRoad();

      ctx.globalCompositeOperation = "lighter";
      for (const s of streaks) {
        s.z += s.speed;
        if (s.z >= 1) {
          // recycle
          s.z = 0;
          s.lane = Math.floor(Math.random() * lanes);
          const palette = s.side === -1 ? leftCars : rightCars;
          s.color = palette[Math.floor(Math.random() * palette.length)];
          s.speed = 0.0035 + Math.random() * 0.006;
          s.length = 0.06 + Math.random() * 0.12;
        }

        const head = project(s.side, s.lane, s.z);
        const tailZ = Math.max(0.001, s.z - s.length);
        const tail = project(s.side, s.lane, tailZ);

        const trailGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        trailGrad.addColorStop(0, "rgba(0,0,0,0)");
        trailGrad.addColorStop(1, s.color);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = head.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();

        // bright head glow
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.min(1, head.persp + 0.2);
        ctx.beginPath();
        ctx.arc(head.x, head.y, head.size * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [background, roadColor, leftCars, rightCars, sticks, quality]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        opacity,
        mixBlendMode: "normal",
      }}
    />
  );
}
