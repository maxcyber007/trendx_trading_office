"use client";
import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; vx: number; vy: number };
const REACH = 150;

// a slow neural mesh behind the login card; nodes link when close and lean toward the pointer
export default function LoginBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d")!;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: -999, y: -999 };
    let w = 0, h = 0, dots: Dot[] = [], frame = 0;

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.round((w * h) / 16000));
      dots = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45 }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;
      }
      ctx.lineWidth = 1;
      dots.forEach((a, i) => {
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j], dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > REACH) continue;
          ctx.strokeStyle = `rgba(57,255,106,${(1 - dist / REACH) * .42})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        const near = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (near < REACH * 1.4) {
          ctx.strokeStyle = `rgba(53,224,255,${(1 - near / (REACH * 1.4)) * .7})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(57,255,106,.16)";
        ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, 7); ctx.fill();
        ctx.fillStyle = "#39ff6a";
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.8, 0, 7); ctx.fill();
      });
      if (!still) frame = requestAnimationFrame(draw);
    };

    const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; };
    const resize = () => { size(); if (still) draw(); };
    size(); draw();
    addEventListener("resize", resize);
    addEventListener("pointermove", move);
    return () => { cancelAnimationFrame(frame); removeEventListener("resize", resize); removeEventListener("pointermove", move); };
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <i className="orb a" /><i className="orb b" />
      <div className="floor"><i /></div>
      <canvas ref={ref} />
    </div>
  );
}
