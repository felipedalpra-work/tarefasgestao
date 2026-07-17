"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const GREEN = "107, 241, 105";

type Bubble = {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobble: number;
  phase: number;
  alpha: number;
};

type Ripple = { x: number; y: number; age: number };

export function LoginFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const auroraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const aurora = auroraRef.current;
    if (!canvas || !aurora) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const bubbles: Bubble[] = [];
    const bubbleCount = reduced ? 0 : Math.min(70, Math.floor(window.innerWidth / 20));
    function spawnBubble(fromBottom: boolean): Bubble {
      return {
        x: Math.random() * width,
        y: fromBottom ? height + 10 : Math.random() * height,
        r: 1 + Math.random() * 2.4,
        vy: 0.15 + Math.random() * 0.45,
        wobble: 0.1 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.12 + Math.random() * 0.3,
      };
    }
    for (let i = 0; i < bubbleCount; i++) bubbles.push(spawnBubble(false));

    const ripples: Ripple[] = [];
    const mouse = { x: width / 2, y: height * 0.4 };
    const auroraPos = { x: mouse.x, y: mouse.y };

    function onMove(e: PointerEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }
    function onDown(e: PointerEvent) {
      if (reduced) return;
      ripples.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (ripples.length > 8) ripples.shift();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);

    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      ctx!.clearRect(0, 0, width, height);

      for (const b of bubbles) {
        b.y -= b.vy * dt;
        b.phase += 0.012 * dt;
        b.x += Math.sin(b.phase) * b.wobble * dt;

        // repulsão suave perto do cursor
        const dx = b.x - mouse.x;
        const dy = b.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 130 * 130 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 130) * 1.6;
          b.x += (dx / d) * f * dt;
          b.y += (dy / d) * f * dt;
        }

        if (b.y < -12) Object.assign(b, spawnBubble(true));
        if (b.x < -12) b.x = width + 12;
        else if (b.x > width + 12) b.x = -12;

        ctx!.beginPath();
        ctx!.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${GREEN}, ${b.alpha})`;
        ctx!.fill();
      }

      // anéis concêntricos expandindo do toque (eco do logo O2)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.age += dt;
        const t = rp.age / 55;
        if (t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const ease = 1 - Math.pow(1 - t, 3);
        const radius = 12 + ease * 190;
        const alpha = (1 - t) * 0.55;

        ctx!.lineWidth = 3;
        ctx!.strokeStyle = `rgba(${GREEN}, ${alpha})`;
        ctx!.beginPath();
        ctx!.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
        ctx!.stroke();

        ctx!.lineWidth = 2.5;
        ctx!.strokeStyle = `rgba(${GREEN}, ${alpha * 0.75})`;
        ctx!.beginPath();
        ctx!.arc(rp.x, rp.y, radius * 0.55, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // aurora persegue o mouse com atraso
      auroraPos.x += (mouse.x - auroraPos.x) * 0.045 * dt;
      auroraPos.y += (mouse.y - auroraPos.y) * 0.045 * dt;
      aurora!.style.transform = `translate(${auroraPos.x - 400}px, ${auroraPos.y - 400}px)`;

      raf = requestAnimationFrame(frame);
    }
    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        ref={auroraRef}
        className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full bg-o2-green/8 blur-3xl will-change-transform"
      />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-o2-green/3 rounded-full blur-3xl" />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transition = "transform 0.08s ease-out";
    el.style.transform = `perspective(900px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) scale(1.01)`;
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg) scale(1)";
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
