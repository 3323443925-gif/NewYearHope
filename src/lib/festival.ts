import type { FestivalStage } from '@/types/lantern';

export interface LocalDayClock {
  /** 0.0 at 00:00:00 -> approaching 1.0 at 23:59:59.999 */
  progress: number;
  /** Remaining milliseconds until local midnight 00:00:00 */
  remainingMs: number;
  /** Formatted HH:MM:SS remaining */
  countdownText: string;
  /** Local date key YYYY-MM-DD used to detect midnight rollover */
  dayKey: string;
  /** True during the first 35 seconds after local midnight */
  isMidnightWindow: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function getLocalDayClock(now: Date = new Date()): LocalDayClock {
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const elapsedMs = Math.max(0, Math.min(MS_PER_DAY - 1, now.getTime() - startOfDay.getTime()));
  const remainingMs = Math.max(0, MS_PER_DAY - elapsedMs);
  const totalSec = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600) % 24;
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const dayKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  return {
    progress: elapsedMs / MS_PER_DAY,
    remainingMs,
    countdownText: `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`,
    dayKey,
    isMidnightWindow: elapsedMs < 35_000,
  };
}

export function getFestivalStage(now: Date = new Date()): FestivalStage {
  const month = now.getMonth() + 1; // 1..12
  const day = now.getDate();

  if (month === 12) {
    if (day <= 19) return 'early_dec';
    if (day <= 25) return 'christmas_week';
    return 'countdown';
  }
  if (month === 1 && day === 1) {
    return 'new_year_finale';
  }
  if (month === 11) {
    return 'early_dec';
  }
  return 'eternal_isle';
}

export function getDaysUntil2027(now: Date = new Date()): number {
  const target = new Date(2027, 0, 1, 0, 0, 0, 0);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diff = target.getTime() - startToday.getTime();
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

/**
 * Supports optional ?previewTime=2026-12-31T23:59:50 query param for testing
 * the 24h fuse burn and midnight fireworks rollover in local time.
 */
export function createVirtualClock(previewTimeParam: string | null): () => Date {
  if (!previewTimeParam) return () => new Date();
  const parsed = new Date(previewTimeParam);
  if (Number.isNaN(parsed.getTime())) return () => new Date();
  const anchorReal = Date.now();
  const anchorVirtual = parsed.getTime();
  return () => new Date(anchorVirtual + (Date.now() - anchorReal));
}
