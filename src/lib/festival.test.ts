import { describe, expect, it } from 'vitest';
import {
  getDaysUntil2027,
  getFestivalStage,
  getLocalDayClock,
} from '@/lib/festival';

describe('festival local clock & stage progression', () => {
  it('computes 24h fuse burn progress accurately from local time', () => {
    const startOfDay = new Date(2026, 11, 20, 0, 0, 0, 0);
    const noon = new Date(2026, 11, 20, 12, 0, 0, 0);
    const almostMidnight = new Date(2026, 11, 20, 23, 59, 50, 0);

    const cStart = getLocalDayClock(startOfDay);
    expect(cStart.progress).toBe(0);
    expect(cStart.isMidnightWindow).toBe(true);
    expect(cStart.dayKey).toBe('2026-12-20');

    const cNoon = getLocalDayClock(noon);
    expect(cNoon.progress).toBeCloseTo(0.5, 4);
    expect(cNoon.countdownText).toBe('12:00:00');
    expect(cNoon.isMidnightWindow).toBe(false);

    const cLate = getLocalDayClock(almostMidnight);
    expect(cLate.progress).toBeGreaterThan(0.999);
    expect(cLate.countdownText).toBe('00:00:10');
  });

  it('transitions festival stages across Dec -> Jan -> Eternal Isle', () => {
    expect(getFestivalStage(new Date(2026, 11, 5))).toBe('early_dec');
    expect(getFestivalStage(new Date(2026, 11, 24))).toBe('christmas_week');
    expect(getFestivalStage(new Date(2026, 11, 31))).toBe('countdown');
    expect(getFestivalStage(new Date(2027, 0, 1))).toBe('new_year_finale');
    expect(getFestivalStage(new Date(2027, 0, 15))).toBe('eternal_isle');
  });

  it('calculates remaining days until 2027 without going negative', () => {
    expect(getDaysUntil2027(new Date(2026, 11, 31))).toBe(1);
    expect(getDaysUntil2027(new Date(2027, 0, 1))).toBe(0);
    expect(getDaysUntil2027(new Date(2027, 1, 10))).toBe(0);
  });
});
