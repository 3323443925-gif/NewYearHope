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

interface Spark2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

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
  const sparksRef = useRef<Spark2D[]>([]);
  const lastDayKeyRef = useRef<string>(getLocalDayClock(getClockDate()).dayKey);

  const spawnBurst = (w: number, h: number) => {
    ambientAudio.playBoom(0.6);
    const cx = w * (0.18 + Math.random() * 0.64);
    const cy = h * (0.14 + Math.random() * 0.3);
    const colors = ['#FFE49C', '#FF9E57', '#8CD8FF', '#FF8CB8', '#C8A8FF'];
    for (let i = 0; i < 64; i++) {
      const a = (Math.PI * 2 * i) / 64 + Math.random() * 0.2;
      const spd = 1.4 + Math.random() * 4.4;
      sparksRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0,
        maxLife: 52 + Math.random() * 38,
        color: colors[i % colors.length],
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sparkSignal === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    spawnBurst(w, h);
    const t1 = setTimeout(() => spawnBurst(w, h), 280);
    const t2 = setTimeout(() => spawnBurst(w, h), 620);
    const t3 = setTimeout(() => spawnBurst(w, h), 980);
    const t4 = setTimeout(() => spawnBurst(w, h), 1350);
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
      x: (Math.sin(i * 19.3) * 0.5 + 0.5),
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
        spawnBurst(w, h);
        setTimeout(() => spawnBurst(w, h), 550);
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

      // 2D firework sparks
      for (let i = sparksRef.current.length - 1; i >= 0; i--) {
        const sp = sparksRef.current[i];
        sp.life += 1;
        if (sp.life >= sp.maxLife) {
          sparksRef.current.splice(i, 1);
          continue;
        }
        sp.vx *= 0.97;
        sp.vy = sp.vy * 0.97 + 0.045;
        sp.x += sp.vx;
        sp.y += sp.vy;
        ctx.globalAlpha = Math.max(0, 1 - sp.life / sp.maxLife);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
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
