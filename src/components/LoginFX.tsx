"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const GREEN = "107, 241, 105";
const GREEN_BRIGHT = "127, 255, 125";

// Física normalizada pra 60fps via dt. Três interações:
//  - mover o mouse: transfere velocidade pras bolhas (mexer/arremessar)
//  - clique/tap: onda de choque radial + anéis do logo expandindo
//  - segurar: vórtice — bolhas entram em órbita em dois raios e formam o logo O2 girando
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  phase: number;
  hero: boolean;
  spin: 1 | -1;
  orbitJitter: number;
};

type Ripple = { x: number; y: number; age: number };

const ORBIT_INNER = 34;
const ORBIT_OUTER = 62;

function makeGlowSprite(rgb: string): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = 128;
  s.height = 128;
  const g = s.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb}, 0.5)`);
  grad.addColorStop(0.3, `rgba(${rgb}, 0.16)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return s;
}

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

    const glow = makeGlowSprite(GREEN);
    const glowBright = makeGlowSprite(GREEN_BRIGHT);

    const particles: Particle[] = [];
    const count = reduced ? 40 : Math.min(120, Math.floor(window.innerWidth / 11));
    for (let i = 0; i < count; i++) {
      const hero = i % 12 === 0;
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.1 + Math.random() * 0.3),
        r: hero ? 3.2 + Math.random() * 1.4 : 1.1 + Math.random() * 1.9,
        alpha: hero ? 0.9 : 0.35 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        hero,
        spin: hero ? 1 : -1,
        orbitJitter: (Math.random() - 0.5) * 8,
      });
    }

    // modo reduzido: um frame estático de pontos, sem loop nem interação
    if (reduced) {
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${GREEN}, ${p.alpha * 0.6})`;
        ctx.fill();
      }
      return () => window.removeEventListener("resize", resize);
    }

    const ripples: Ripple[] = [];
    const pointer = {
      x: width / 2,
      y: height * 0.4,
      vx: 0,
      vy: 0,
      lastX: 0,
      lastY: 0,
      seen: false,
      down: false,
      downAt: 0,
    };
    let vortexT = 0; // 0→1, engata suave ao segurar
    const auroraPos = { x: pointer.x, y: pointer.y };

    function onMove(e: PointerEvent) {
      if (!e.isPrimary) return;
      if (pointer.seen) {
        const dx = e.clientX - pointer.lastX;
        const dy = e.clientY - pointer.lastY;
        pointer.vx = Math.max(-60, Math.min(60, pointer.vx * 0.6 + dx * 0.4));
        pointer.vy = Math.max(-60, Math.min(60, pointer.vy * 0.6 + dy * 0.4));
      }
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = true;
    }

    function onDown(e: PointerEvent) {
      if (!e.isPrimary) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      pointer.seen = true;
      pointer.down = true;
      pointer.downAt = performance.now();

      // onda de choque: arremessa as bolhas pra longe do toque
      for (const p of particles) {
        const dx = p.x - e.clientX;
        const dy = p.y - e.clientY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 320 && d > 2) {
          const imp = Math.pow(1 - d / 320, 1.6) * 11;
          const jitter = 1 + (Math.random() - 0.5) * 0.4;
          p.vx += (dx / d) * imp * jitter;
          p.vy += (dy / d) * imp * jitter;
        }
      }

      ripples.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (ripples.length > 8) ripples.shift();
    }

    function onUp(e: PointerEvent) {
      if (!e.isPrimary) return;
      pointer.down = false;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const MARGIN = 24;
    let raf = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      ctx!.clearRect(0, 0, width, height);

      const vortexTarget = pointer.down && now - pointer.downAt > 180 ? 1 : 0;
      vortexT += (vortexTarget - vortexT) * Math.min(1, 0.09 * dt);

      const friction = Math.pow(0.986, dt);
      pointer.vx *= Math.pow(0.85, dt);
      pointer.vy *= Math.pow(0.85, dt);

      // física
      for (const p of particles) {
        // flutuação: sobem devagar, com balanço
        p.phase += 0.02 * dt;
        p.vy -= 0.010 * dt;
        p.vx += Math.sin(p.phase) * 0.012 * dt;

        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (pointer.seen && d > 2) {
          if (vortexT > 0.02 && d < 620) {
            // vórtice: mola limitada em direção ao raio de órbita + amortecimento
            // radial (circulariza) + giro tangencial calibrado pra órbita estável
            const orbitR = (p.hero ? ORBIT_INNER : ORBIT_OUTER) + p.orbitJitter;
            const fall = d < 300 ? 1 : 1 - (d - 300) / 320;
            const nx = dx / d;
            const ny = dy / d;
            const spring = Math.max(-0.8, Math.min(0.8, (orbitR - d) * 0.02)) * vortexT * fall;
            p.vx += nx * spring * dt;
            p.vy += ny * spring * dt;
            // remove o quique: dissipa só a componente radial da velocidade
            const vr = p.vx * nx + p.vy * ny;
            const damp = Math.min(0.6, 0.22 * vortexT * fall * dt);
            p.vx -= nx * vr * damp;
            p.vy -= ny * vr * damp;
            const swirl = 0.075 * Math.pow(orbitR / ORBIT_OUTER, 0.75) * vortexT * (d < 300 ? 1 : fall * 0.4);
            p.vx += -ny * swirl * p.spin * dt;
            p.vy += nx * swirl * p.spin * dt;
          } else if (vortexT <= 0.02) {
            // mexer: transfere a velocidade do ponteiro (arrastar/arremessar)
            if (d < 150) {
              const fall = 1 - d / 150;
              p.vx += pointer.vx * 0.1 * fall * dt;
              p.vy += pointer.vy * 0.1 * fall * dt;
            }
            // arado: o cursor abre caminho mesmo devagar
            if (d < 70) {
              const push = (1 - d / 70) * 0.6 * dt;
              p.vx += (dx / d) * push;
              p.vy += (dy / d) * push;
            }
          }
        }

        p.vx *= friction;
        p.vy *= friction;
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > 15) {
          p.vx = (p.vx / sp) * 15;
          p.vy = (p.vy / sp) * 15;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // toro: sai de um lado, volta do outro (nada some)
        if (p.x < -MARGIN) p.x = width + MARGIN;
        else if (p.x > width + MARGIN) p.x = -MARGIN;
        if (p.y < -MARGIN) p.y = height + MARGIN;
        else if (p.y > height + MARGIN) p.y = -MARGIN;
      }

      // teia emergente: linhas entre bolhas próximas (aparece quando o vórtice agrupa)
      ctx!.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 55 * 55) {
            const d = Math.sqrt(d2);
            ctx!.strokeStyle = `rgba(${GREEN}, ${(1 - d / 55) * 0.18})`;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // rastros de movimento (só quando rápidas)
      ctx!.lineCap = "round";
      for (const p of particles) {
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp > 1.5) {
          ctx!.strokeStyle = `rgba(${GREEN}, ${Math.min(0.4, (sp - 1.5) * 0.045)})`;
          ctx!.lineWidth = Math.max(0.6, p.r * 0.7);
          ctx!.beginPath();
          ctx!.moveTo(p.x - p.vx * 3, p.y - p.vy * 3);
          ctx!.lineTo(p.x, p.y);
          ctx!.stroke();
        }
      }

      // glow aditivo + núcleos
      ctx!.globalCompositeOperation = "lighter";
      for (const p of particles) {
        const sprite = p.hero ? glowBright : glow;
        const gs = p.r * (p.hero ? 10 : 7);
        ctx!.globalAlpha = p.alpha * 0.8;
        ctx!.drawImage(sprite, p.x - gs / 2, p.y - gs / 2, gs, gs);
      }
      if (pointer.seen) {
        ctx!.globalAlpha = 0.3 + vortexT * 0.35;
        const cs = 90 + vortexT * 40;
        ctx!.drawImage(glowBright, pointer.x - cs / 2, pointer.y - cs / 2, cs, cs);
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${p.hero ? GREEN_BRIGHT : GREEN}, ${p.alpha})`;
        ctx!.fill();
      }

      // guias do vórtice: dois arcos girando em sentidos opostos (eco do logo)
      if (vortexT > 0.03 && pointer.seen) {
        const rot = now * 0.0025;
        ctx!.lineWidth = 2.2;
        ctx!.strokeStyle = `rgba(${GREEN_BRIGHT}, ${0.4 * vortexT})`;
        ctx!.beginPath();
        ctx!.arc(pointer.x, pointer.y, ORBIT_INNER, rot, rot + Math.PI * 1.45);
        ctx!.stroke();
        ctx!.lineWidth = 1.8;
        ctx!.strokeStyle = `rgba(${GREEN}, ${0.32 * vortexT})`;
        ctx!.beginPath();
        ctx!.arc(pointer.x, pointer.y, ORBIT_OUTER, -rot, -rot + Math.PI * 1.2);
        ctx!.stroke();
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
      auroraPos.x += (pointer.x - auroraPos.x) * 0.045 * dt;
      auroraPos.y += (pointer.y - auroraPos.y) * 0.045 * dt;
      aurora!.style.transform = `translate(${auroraPos.x - 400}px, ${auroraPos.y - 400}px)`;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
