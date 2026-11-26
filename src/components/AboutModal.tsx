'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Sparkles, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  const { dict } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#030714]/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-amber-200/20 bg-[#0b1736]/95 p-6 text-slate-100 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-300 hover:bg-white/10"
          aria-label={dict.detail.close}
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-100">
          <Sparkles className="h-5 w-5 text-amber-300" />
          {dict.about.title}
        </h2>

        <p className="mt-3 text-xs leading-6 text-slate-200/90 sm:text-sm">
          {dict.about.body1}
        </p>
        <p className="mt-2.5 text-xs leading-6 text-slate-200/90 sm:text-sm">
          {dict.about.body2}
        </p>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
            <ShieldCheck className="h-4 w-4" />
            {dict.about.valuesTitle}
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
            {dict.about.values.map((v, i) => (
              <li key={i}>• {v}</li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Link
            href="/admin"
            className="text-xs text-slate-400 underline-offset-4 transition hover:text-amber-200 hover:underline"
          >
            {dict.about.adminLink}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-amber-300/90 px-5 py-2 text-xs font-semibold text-[#1a1208] hover:bg-amber-300"
          >
            {dict.about.close}
          </button>
        </div>
      </div>
    </div>
  );
}
