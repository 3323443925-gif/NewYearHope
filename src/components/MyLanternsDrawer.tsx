'use client';

import React from 'react';
import { Sparkles, X, MessageCircle } from 'lucide-react';
import type { LanternItem } from '@/types/lantern';
import { useI18n, interpolate } from '@/lib/i18n';
import StickerBadge from './StickerBadge';

interface MyLanternsDrawerProps {
  open: boolean;
  lanterns: LanternItem[];
  seenReplyCounts: Record<string, number>;
  onClose: () => void;
  onSelect: (lantern: LanternItem) => void;
}

export default function MyLanternsDrawer({
  open,
  lanterns,
  seenReplyCounts,
  onClose,
  onSelect,
}: MyLanternsDrawerProps) {
  const { dict, formatRelativeTime } = useI18n();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-[#030714]/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full max-w-md flex-col border-l border-amber-200/20 bg-[#0a1533]/95 p-5 text-slate-100 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-100">
            <Sparkles className="h-4 w-4 text-amber-300" />
            {dict.myLanterns.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label={dict.detail.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          {lanterns.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center text-xs leading-6 text-slate-300">
              {dict.myLanterns.empty}
            </div>
          ) : (
            lanterns.map((item) => {
              const seen = seenReplyCounts[item.id] ?? 0;
              const unread = Math.max(0, item.replyCount - seen);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect({ ...item, isMine: true });
                    onClose();
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition hover:border-amber-300/40 hover:bg-white/[0.08]"
                >
                  {item.stickerId && <StickerBadge stickerId={item.stickerId} size={40} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-amber-200/90">
                        {dict.types[item.type]} · {dict.moods[item.mood]}
                      </span>
                      {unread > 0 && (
                        <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-[#1a1208]">
                          {interpolate(dict.myLanterns.newReplies, { count: unread })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-100">
                      {item.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {item.replyCount}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-slate-400">
          {dict.myLanterns.storageNote}
        </p>
      </div>
    </div>
  );
}
