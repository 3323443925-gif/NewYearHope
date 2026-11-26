'use client';

import React, { useEffect, useRef } from 'react';
import type { LanternItem } from '@/types/lantern';
import { getLocalDayClock } from '@/lib/festival';
import { ambientAudio } from '@/lib/ambientAudio';

interface FallbackSkyCanvasProps {
  lanterns: LanternItem[];
  skyBatchKey?: number;
  getClockDate: () => Date;
  onSelectLantern: (lantern: LanternItem) => void;
  onClickCannon: () => void;
  sparkSignal: number;
}

interface LanternNode2D {
  item: LanternItem;
  x: number;
  y: number;
  vx: number;
  phase: number;
  radius: number;
}

interface Rocket2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  palette: string[];
  style: 'chrysanthemum' | 'willow' | 'double';
}

interface Spark2D {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  color: string;
  size: number;
  isStar: boolean;
  twinkle: boolean;
  phase: number;
}

interface Flash2D {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

const PALETTES_2D: string[][] = [
  ['#FFE49C', '#FFB852', '#FFF8DC'],
  ['#7FD4FF', '#B8E8FF', '#FFF3CF'],
  ['#FF7CA8', '#FFC196', '#FFF0F7'],
  ['#C59CFF', '#7DD8FF', '#FFF1C7'],
  ['#6CF0C4', '#99E0FF', '#FFF6D4'],
  ['#FF6868', '#FFC566', '#FFF5D6'],
];

/**
 * Lightweight 2D Canvas night sky fallback for devices without WebGL,
 * low-power Lite Mode, or prefers-reduced-motion users.
 */
export default function FallbackSkyCanvas({
  lanterns,
  skyBatchKey = 0,
  getClockDate,
  onSelectLantern,
  onClickCannon,
  sparkSignal,
}: FallbackSkyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<LanternNode2D[]>([]);
  const rocketsRef = useRef<Rocket2D[]>([]);
  const sparksRef = useRef<Spark2D[]>([]);
  const flashesRef = useRef<Flash2D[]>([]);
  const lastDayKeyRef = useRef<string>(getLocalDayClock(getClockDate()).dayKey);

  const launchShell2D = (w: number, h: number) => {
    const startX = w / 2 + 54;
    const startY = h * 0.62 + 16;
    const targetX = w * (0.18 + Math.random() * 0.64);
    const targetY = h * (0.13 + Math.random() * 0.25);
    const frames = 36 + Math.random() * 14;
    const g = 0.085;
    const styles: Array<'chrysanthemum' | 'willow' | 'double'> = [
      'chrysanthemum',
      'willow',
      'double',
    ];
    rocketsRef.current.push({
      x: startX,
      y: startY,
      vx: (targetX - startX) / frames,
      vy: (targetY - startY - 0.5 * g * frames * frames) / frames,
      targetY,
      palette: PALETTES_2D[Math.floor(Math.random() * PALETTES_2D.length)],
      style: styles[Math.floor(Math.random() * styles.length)],
    });
  };

  const detonate2D = (cx: number, cy: number, palette: string[], style: Rocket2D['style']) => {
    ambientAudio.playBoom(style === 'willow' ? 0.85 : 0.65);

    flashesRef.current.push({
      x: cx,
      y: cy,
      life: 0,
      maxLife: 12,
      radius: 42,
      color: palette[0],
    });

    // Core flash-powder micro-sparks
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 4.2;
      sparksRef.current.push({
        x: cx,
        y: cy,
        px: cx,
        py: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0,
        maxLife: 14 + Math.random() * 14,
        drag: 0.91,
        gravity: 0.04,
        color: '#FFF9E6',
        size: 1.4 + Math.random() * 1.1,
        isStar: false,
        twinkle: true,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const isWillow = style === 'willow';
    const count = isWillow ? 64 : style === 'double' ? 58 : 74;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.14;
      const baseSpd = isWillow ? 4.4 : 5.4;
      const spd = baseSpd * (0.86 + Math.random() * 0.28);
      sparksRef.current.push({
        x: cx,
        y: cy,
        px: cx,
        py: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0,
        maxLife: (isWillow ? 76 : 54) + Math.random() * 34,
        drag: isWillow ? 0.962 : 0.954,
        gravity: isWillow ? 0.072 : 0.052,
        color: isWillow ? (i % 2 === 0 ? '#FFE299' : '#FFB34D') : palette[i % palette.length],
        size: isWillow ? 2.1 : 2.3,
        isStar: true,
        twinkle: i % 3 === 0,
        phase: Math.random() * Math.PI * 2,
      });
    }

    if (style === 'double') {
      for (let i = 0; i < 32; i++) {
        const a = (Math.PI * 2 * i) / 32 + (Math.random() - 0.5) * 0.16;
        const spd = 2.7 * (0.88 + Math.random() * 0.24);
        sparksRef.current.push({
          x: cx,
          y: cy,
          px: cx,
          py: cy,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          life: 0,
          maxLife: 42 + Math.random() * 20,
          drag: 0.955,
          gravity: 0.045,
          color: palette[2],
          size: 1.9,
          isStar: true,
          twinkle: true,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sparkSignal === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    launchShell2D(w, h);
    const t1 = setTimeout(() => launchShell2D(w, h), 300);
    const t2 = setTimeout(() => launchShell2D(w, h), 650);
    const t3 = setTimeout(() => launchShell2D(w, h), 1020);
    const t4 = setTimeout(() => launchShell2D(w, h), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [sparkSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    nodesRef.current = lanterns.slice(0, 32).map((item, idx) => ({
      item,
      x: (((idx * 137.5 + skyBatchKey * 41.3) % 86) + 7) * 0.01 * w,
      y: (((idx * 53.1 + skyBatchKey * 29.7) % 58) + 12) * 0.01 * h,
      vx: ((idx + skyBatchKey) % 2 === 0 ? 1 : -1) * (0.08 + (idx % 5) * 0.025),
      phase: idx * 0.9 + skyBatchKey,
      radius: item.isMine ? 16 : 12,
    }));
  }, [lanterns, skyBatchKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let tick = 0;

    const stars = Array.from({ length: 110 }, (_, i) => ({
      x: Math.sin(i * 19.3) * 0.5 + 0.5,
      y: (Math.cos(i * 7.7) * 0.5 + 0.5) * 0.85,
      r: 0.7 + (i % 3) * 0.65,
      phase: i * 0.7,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      rafId = requestAnimationFrame(render);
      if (document.hidden) return;
      tick += 0.016;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Stars
      for (const s of stars) {
        const alpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(tick * 1.6 + s.phase));
        ctx.fillStyle = `rgba(225, 238, 255, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stylized glowing snow island + Christmas tree silhouette at center
      const cx = w / 2;
      const cy = h * 0.62;
      const glow = ctx.createRadialGradient(cx, cy - 55, 8, cx, cy - 35, 165);
      glow.addColorStop(0, 'rgba(255, 217, 132, 0.36)');
      glow.addColorStop(0.5, 'rgba(110, 155, 235, 0.14)');
      glow.addColorStop(1, 'rgba(7, 14, 36, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy - 35, 165, 0, Math.PI * 2);
      ctx.fill();

      // Snowy mound
      ctx.fillStyle = '#c5dcff';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 28, 108, 28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Layered pine tree
      ctx.fillStyle = '#1b473d';
      for (let i = 0; i < 4; i++) {
        const topY = cy - 95 + i * 26;
        const halfW = 24 + i * 18;
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx - halfW, topY + 42);
        ctx.lineTo(cx + halfW, topY + 42);
        ctx.closePath();
        ctx.fill();
      }
      // Top star
      ctx.fillStyle = '#FFE499';
      ctx.beginPath();
      ctx.arc(cx, cy - 102, 7, 0, Math.PI * 2);
      ctx.fill();

      // 24h local fuse progress bar right on island snow edge
      const dayClock = getLocalDayClock(getClockDate());
      if (dayClock.dayKey !== lastDayKeyRef.current) {
        lastDayKeyRef.current = dayClock.dayKey;
        launchShell2D(w, h);
        setTimeout(() => launchShell2D(w, h), 450);
        setTimeout(() => launchShell2D(w, h), 900);
      }
      const fuseX0 = cx + 18;
      const fuseX1 = cx + 76;
      const fuseY = cy + 26;
      const emberX = fuseX0 + (fuseX1 - fuseX0) * dayClock.progress;
      ctx.strokeStyle = 'rgba(255, 217, 132, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(emberX, fuseY);
      ctx.lineTo(fuseX1, fuseY);
      ctx.stroke();

      ctx.fillStyle = '#FFAD54';
      ctx.beginPath();
      ctx.arc(emberX, fuseY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Floating lanterns
      for (const n of nodesRef.current) {
        n.x += n.vx;
        if (n.x < 24) n.x = w - 24;
        if (n.x > w - 24) n.x = 24;
        const drawY = n.y + Math.sin(tick * 1.1 + n.phase) * 7;

        const baseColor =
          n.item.type === 'wish'
            ? 'rgba(255, 162, 82,'
            : n.item.type === 'unspoken'
            ? 'rgba(218, 234, 255,'
            : 'rgba(255, 192, 148,';

        const halo = ctx.createRadialGradient(n.x, drawY, 2, n.x, drawY, n.radius * 2.2);
        halo.addColorStop(0, `${baseColor} 0.95)`);
        halo.addColorStop(0.5, `${baseColor} 0.3)`);
        halo.addColorStop(1, `${baseColor} 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(n.x, drawY, n.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        if (n.item.isMine) {
          ctx.strokeStyle = 'rgba(255, 226, 150, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(n.x, drawY, n.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Additive pyrotechnic rendering for realistic glowing sparks
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Ascending shells shedding golden sparks
      for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
        const r = rocketsRef.current[i];
        r.vy += 0.085;
        r.x += r.vx;
        r.y += r.vy;

        // Shed exhaust sparks
        for (let k = 0; k < 2; k++) {
          sparksRef.current.push({
            x: r.x,
            y: r.y,
            px: r.x,
            py: r.y,
            vx: r.vx * 0.1 + (Math.random() - 0.5) * 0.8,
            vy: 0.6 + Math.random() * 1.1,
            life: 0,
            maxLife: 16 + Math.random() * 14,
            drag: 0.94,
            gravity: 0.05,
            color: '#FFD07A',
            size: 1.3,
            isStar: false,
            twinkle: true,
            phase: Math.random() * Math.PI * 2,
          });
        }

        ctx.fillStyle = '#FFF6D6';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
        ctx.fill();

        if (r.y <= r.targetY || r.vy >= 0) {
          detonate2D(r.x, r.y, r.palette, r.style);
          rocketsRef.current.splice(i, 1);
        }
      }

      // Core incandescent flashes
      for (let i = flashesRef.current.length - 1; i >= 0; i--) {
        const fl = flashesRef.current[i];
        fl.life += 1;
        if (fl.life >= fl.maxLife) {
          flashesRef.current.splice(i, 1);
          continue;
        }
        const p = fl.life / fl.maxLife;
        const rad = fl.radius * (0.4 + 0.8 * p);
        const grad = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rad);
        grad.addColorStop(0, `rgba(255, 250, 232, ${(0.85 * (1 - p)).toFixed(2)})`);
        grad.addColorStop(0.5, `rgba(255, 212, 130, ${(0.3 * (1 - p)).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(255, 212, 130, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2D firework stars & shed micro-sparks with glowing trails
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life += 1;
        if (sp.life >= sp.maxLife) {
          sparks.splice(i, 1);
          continue;
        }
        sp.px = sp.x;
        sp.py = sp.y;
        sp.vx *= sp.drag;
        sp.vy = sp.vy * sp.drag + sp.gravity;
        sp.x += sp.vx;
        sp.y += sp.vy;

        const progress = sp.life / sp.maxLife;

        // Primary burning stars shed fine trailing micro-sparks
        if (sp.isStar && progress < 0.85 && sparks.length < 950 && Math.random() < 0.45) {
          sparks.push({
            x: sp.x,
            y: sp.y,
            px: sp.px,
            py: sp.py,
            vx: sp.vx * 0.2 + (Math.random() - 0.5) * 0.5,
            vy: sp.vy * 0.2 + (Math.random() - 0.5) * 0.5,
            life: 0,
            maxLife: 14 + Math.random() * 14,
            drag: 0.92,
            gravity: 0.035,
            color: '#FFC46B',
            size: 1.15,
            isStar: false,
            twinkle: true,
            phase: Math.random() * Math.PI * 2,
          });
        }

        const fade = Math.pow(Math.max(0, 1 - progress), 1.35);
        const flicker = sp.twinkle
          ? 0.55 + 0.45 * Math.sin(tick * 42 + sp.phase * 6)
          : 1;
        const alpha = fade * flicker;

        // Glowing spark tail streak
        ctx.globalAlpha = alpha * (sp.isStar ? 0.72 : 0.45);
        ctx.strokeStyle = sp.color;
        ctx.lineWidth = sp.isStar ? 1.5 : 0.9;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - (sp.x - sp.px) * 3.2, sp.y - (sp.y - sp.py) * 3.2);
        ctx.stroke();

        // Incandescent pinpoint core + colored halo
        ctx.globalAlpha = alpha;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * (1 - progress * 0.45), 0, Math.PI * 2);
        ctx.fill();

        if (sp.isStar && progress < 0.7) {
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = '#FFFDF5';
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * 0.48, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    render();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [getClockDate]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const n of nodesRef.current) {
      if (Math.hypot(x - n.x, y - n.y) <= n.radius + 14) {
        onSelectLantern(n.item);
        return;
      }
    }

    // Check cannon region on right side of island
    const cx = rect.width / 2 + 56;
    const cy = rect.height * 0.62 + 24;
    if (Math.hypot(x - cx, y - cy) <= 44) {
      onClickCannon();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="fixed inset-0 z-0 h-full w-full cursor-pointer"
      aria-label="Starlight Isle Lite Sky"
    />
  );
}
