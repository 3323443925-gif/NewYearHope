'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import zh from '@/locales/zh.json';
import en from '@/locales/en.json';
import type { Locale } from '@/types/lantern';

type Dictionary = typeof zh;

const dictionaries: Record<Locale, Dictionary> = { zh, en };
const LOCALE_STORAGE_KEY = 'starlight_isle_locale_v1';

interface I18nContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  formatRelativeTime: (isoDate: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'zh' || saved === 'en') {
        setLocaleState(saved);
        return;
      }
      const browserLang = (navigator.language || 'zh').toLowerCase();
      setLocaleState(browserLang.startsWith('zh') ? 'zh' : 'en');
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    } catch {
      // Ignore
    }
  }, []);

  const toggleLocale = React.useCallback(
    () => setLocale(locale === 'zh' ? 'en' : 'zh'),
    [locale, setLocale]
  );

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];
    const formatRelativeTime = (isoDate: string) => {
      const diffMs = Math.max(0, Date.now() - new Date(isoDate).getTime());
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) return dict.time.justNow;
      if (minutes < 60) return interpolate(dict.time.minutesAgo, { n: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return interpolate(dict.time.hoursAgo, { n: hours });
      const days = Math.floor(hours / 24);
      return interpolate(dict.time.daysAgo, { n: days });
    };
    return { locale, dict, setLocale, toggleLocale, formatRelativeTime };
  }, [locale, setLocale, toggleLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}
