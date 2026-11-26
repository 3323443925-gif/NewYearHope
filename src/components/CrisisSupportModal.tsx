'use client';

import React from 'react';
import { HeartHandshake, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface CrisisSupportModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CrisisSupportModal({ open, onClose }: CrisisSupportModalProps) {
  const { dict } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#030714]/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-amber-200/30 bg-[#0d1a3b]/96 p-6 text-slate-100 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-300 hover:bg-white/10"
          aria-label={dict.detail.close}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2.5 text-amber-200">
          <HeartHandshake className="h-6 w-6 shrink-0" />
          <h2 className="text-base font-semibold sm:text-lg">{dict.crisis.title}</h2>
        </div>

        <p className="text-xs leading-6 text-slate-200/90 sm:text-sm">{dict.crisis.desc}</p>

        <div className="mt-4 space-y-2.5">
          {dict.crisis.hotlines.map((line) => (
            <div
              key={line.region}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5"
            >
              <div className="text-[11px] font-medium text-amber-200/90">{line.region}</div>
              <div className="text-xs font-medium text-white">{line.name}</div>
              <div className="mt-0.5 text-xs text-sky-200">{line.contact}</div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-amber-100/85">{dict.crisis.continueNotice}</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-amber-300/90 py-2.5 text-xs font-semibold text-[#1c1309] transition hover:bg-amber-300 sm:text-sm"
        >
          {dict.crisis.closeBtn}
        </button>
      </div>
    </div>
  );
}
