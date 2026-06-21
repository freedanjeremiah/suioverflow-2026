"use client";

import { useEffect, useRef } from "react";

interface Props {
  density?: number;
  className?: string;
  /** 0..1 overall opacity of the field */
  intensity?: number;
}

// A cheap 2D living-network backdrop: drifting spores joined by faint hyphae.
// Used site-wide so the graph theme is present even without the 3D engine.
export function AmbientField({ density = 0.00008, className, intensity = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const hues = [110, 92, 138, 175, 305, 350, 28];
    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      hue: number;
      a: number;
    }
    let pts: P[] = [];

    function seed() {
      const count = Math.max(18, Math.min(80, Math.round(w * h * density)));
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.6 + Math.random() * 2.2,
        hue: hues[Math.floor(Math.random() * hues.length)],
        a: 0.3 + Math.random() * 0.6,
      }));
    }

    function resize() {
      const parent = canvas!.parentElement;
      w = parent?.clientWidth ?? window.innerWidth;
      h = parent?.clientHeight ?? window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function frame() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";

      // hyphae: connect near pairs
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20;
          if (p.y > h + 20) p.y = -20;
        }
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          const max = 150;
          if (d2 < max * max) {
            const t = 1 - Math.sqrt(d2) / max;
            ctx!.strokeStyle = `oklch(0.8 0.12 ${p.hue} / ${t * 0.16 * intensity})`;
            ctx!.lineWidth = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(q.x, q.y);
            ctx!.stroke();
          }
        }
      }

      // spores
      for (const p of pts) {
        const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `oklch(0.9 0.16 ${p.hue} / ${p.a * intensity})`);
        g.addColorStop(1, `oklch(0.9 0.16 ${p.hue} / 0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    resize();
    frame();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, intensity]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
