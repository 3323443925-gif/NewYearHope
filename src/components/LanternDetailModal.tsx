'use client';

import React, { useEffect, useState } from 'react';
import {
  Flag,
  Heart,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
  PartyPopper,
  Lock,
} from 'lucide-react';
import type {
  BlessingType,
  LanternItem,
  ReplyItem,
  ReportReason,
} from '@/types/lantern';
import { useI18n, interpolate } from '@/lib/i18n';
import {
  getOrCreateOwnerSecret,
  hasBlessed,
  markLanternRepliesSeen,
  recordBlessed,
} from '@/lib/ownerStorage';
import StickerBadge from './StickerBadge';

interface LanternDetailModalProps {
  lantern: LanternItem | null;
  onClose: () => void;
  onLanternUpdated: (lantern: LanternItem) => void;
  onLanternRemoved: (id: string) => void;
  onTriggerCrisisSupport: () => void;
  onToast: (msg: string) => void;
}

const REPORT_REASONS: ReportReason[] = ['spam', 'unkind', 'inappropriate_image', 'other'];

export default function LanternDetailModal({
  lantern,
  onClose,
  onLanternUpdated,
  onLanternRemoved,
  onTriggerCrisisSupport,
  onToast,
}: LanternDetailModalProps) {
  const { dict, formatRelativeTime } = useI18n();
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyNick, setReplyNick] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [blessedState, setBlessedState] = useState<Record<BlessingType, boolean>>({
    wish: false,
    hug: false,
    newyear: false,
  });

  const [reportTarget, setReportTarget] = useState<{
    targetType: 'lantern' | 'reply';
    targetId: string;
  } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('unkind');
  const [submittingReport, setSubmittingReport] = useState(false);

  const [confirmRetract, setConfirmRetract] = useState(false);
  const [retracting, setRetracting] = useState(false);
  const [zoomImage, setZoomImage] = useState(false);

  useEffect(() => {
    if (!lantern) return;
    setBlessedState({
      wish: hasBlessed(lantern.id, 'wish'),
      hug: hasBlessed(lantern.id, 'hug'),
      newyear: hasBlessed(lantern.id, 'newyear'),
    });
    setReportTarget(null);
    setConfirmRetract(false);
    setReplyError(null);
    setZoomImage(false);

    if (lantern.isMine) {
      markLanternRepliesSeen(lantern.id, lantern.replyCount);
    }

    let cancelled = false;
    setLoadingReplies(true);
    fetch(`/api/lanterns/${encodeURIComponent(lantern.id)}/replies`)
      .then((r) => r.json())
      .then((data: { replies?: ReplyItem[] }) => {
        if (!cancelled) {
          const list = data.replies ?? [];
          setReplies(list);
          if (lantern.isMine) {
            markLanternRepliesSeen(lantern.id, list.length);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setReplies([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingReplies(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lantern?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lantern) return null;

  const handleBless = async (type: BlessingType) => {
    if (blessedState[type]) return;
    setBlessedState((prev) => ({ ...prev, [type]: true }));
    recordBlessed(lantern.id, type);

    try {
      const res = await fetch(`/api/lanterns/${encodeURIComponent(lantern.id)}/bless`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const json = (await res.json()) as { lantern?: LanternItem };
        if (json.lantern) {
          onLanternUpdated({ ...json.lantern, isMine: lantern.isMine });
        }
      }
    } catch {
      // Keep optimistic state quietly
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed || trimmed.length > 300) {
      setReplyError(dict.errors.replyRequired);
      return;
    }

    setSubmittingReply(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/lanterns/${encodeURIComponent(lantern.id)}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, nickname: replyNick.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        reply?: ReplyItem;
        crisisSupport?: boolean;
        error?: string;
      };
      if (!res.ok || !json.reply) {
        if (json.error === 'moderation_blocked') {
          setReplyError(dict.errors.moderationBlocked);
        } else if (json.error === 'rate_limited') {
          setReplyError(dict.errors.rateLimited);
        } else {
          setReplyError(dict.errors.networkError);
        }
        setSubmittingReply(false);
        return;
      }

      const nextReplies = [...replies, json.reply];
      setReplies(nextReplies);
      setReplyText('');
      setReplyNick('');
      onLanternUpdated({
        ...lantern,
        replyCount: lantern.replyCount + 1,
      });
      if (lantern.isMine) {
        markLanternRepliesSeen(lantern.id, nextReplies.length);
      }
      onToast(dict.detail.replySuccess);
      if (json.crisisSupport) {
        onTriggerCrisisSupport();
      }
    } catch {
      setReplyError(dict.errors.networkError);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportTarget) return;
    setSubmittingReport(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: reportTarget.targetType,
          targetId: reportTarget.targetId,
          reason: reportReason,
          reporterId: getOrCreateOwnerSecret().slice(0, 24),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { hiddenTriggered?: boolean };
      onToast(dict.detail.reportSuccess);
      if (json.hiddenTriggered) {
        if (reportTarget.targetType === 'lantern') {
          onLanternRemoved(reportTarget.targetId);
          onClose();
        } else {
          setReplies((prev) => prev.filter((r) => r.id !== reportTarget.targetId));
        }
      }
      setReportTarget(null);
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleRetract = async () => {
    setRetracting(true);
    try {
      const res = await fetch(`/api/lanterns/${encodeURIComponent(lantern.id)}`, {
        method: 'DELETE',
        headers: {
          'x-owner-secret': getOrCreateOwnerSecret(),
        },
      });
      if (res.ok) {
        onToast(dict.detail.retractSuccess);
        onLanternRemoved(lantern.id);
        onClose();
      } else {
        onToast(dict.errors.networkError);
      }
    } finally {
      setRetracting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#030714]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-amber-200/20 bg-[#0b1736]/94 p-5 text-slate-100 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:p-6">
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
        {/* Top bar */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/35 bg-amber-300/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-100">
              {dict.types[lantern.type]}
            </span>
            <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-0.5 text-[11px] text-sky-100">
              {dict.moods[lantern.mood]}
            </span>
            {lantern.isMine && (
              <span className="rounded-full border border-amber-200/40 bg-amber-200/20 px-2.5 py-0.5 text-[11px] text-amber-100">
                ✨ {dict.detail.mineBadge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {lantern.isMine ? (
              <button
                type="button"
                onClick={() => setConfirmRetract(true)}
                className="rounded-full p-2 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-200"
                title={dict.detail.retract}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setReportTarget({ targetType: 'lantern', targetId: lantern.id })
                }
                className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
                title={dict.detail.report}
              >
                <Flag className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label={dict.detail.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Main letter body */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            {lantern.stickerId && <StickerBadge stickerId={lantern.stickerId} size={52} />}
            <div className="min-w-0 flex-1">
              <p className="font-letter whitespace-pre-wrap break-words text-sm leading-8 text-slate-50 sm:text-[15px]">
                {lantern.content}
              </p>
            </div>
          </div>

          {lantern.imageUrl && (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lantern.imageUrl}
                alt="Lantern attachment"
                loading="lazy"
                onClick={() => setZoomImage((z) => !z)}
                className={`w-full cursor-zoom-in rounded-xl border border-white/10 object-cover transition ${
                  zoomImage ? 'max-h-[70vh] object-contain' : 'max-h-60'
                }`}
              />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-amber-100/90">
              — {lantern.nickname || dict.compose.anonymous}
            </span>
            <span>{formatRelativeTime(lantern.createdAt)}</span>
          </div>
        </div>

        {/* Gentle blessings bar (always available) */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleBless('wish')}
            className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-2.5 text-xs transition ${
              blessedState.wish
                ? 'border-amber-300/60 bg-amber-300/20 text-amber-100'
                : 'border-white/10 bg-white/5 text-slate-200 hover:border-amber-200/40 hover:bg-white/10'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span className="truncate">{dict.detail.blessWish}</span>
            <span className="text-[11px] opacity-80">{lantern.blessWishCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleBless('hug')}
            className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-2.5 text-xs transition ${
              blessedState.hug
                ? 'border-rose-300/60 bg-rose-300/20 text-rose-100'
                : 'border-white/10 bg-white/5 text-slate-200 hover:border-rose-200/40 hover:bg-white/10'
            }`}
          >
            <Heart className="h-3.5 w-3.5 text-rose-300" />
            <span className="truncate">{dict.detail.blessHug}</span>
            <span className="text-[11px] opacity-80">{lantern.blessHugCount}</span>
          </button>

          <button
            type="button"
            onClick={() => handleBless('newyear')}
            className={`flex items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-2.5 text-xs transition ${
              blessedState.newyear
                ? 'border-sky-300/60 bg-sky-300/20 text-sky-100'
                : 'border-white/10 bg-white/5 text-slate-200 hover:border-sky-200/40 hover:bg-white/10'
            }`}
          >
            <PartyPopper className="h-3.5 w-3.5 text-sky-300" />
            <span className="truncate">{dict.detail.blessNewyear}</span>
            <span className="text-[11px] opacity-80">{lantern.blessNewyearCount}</span>
          </button>
        </div>

        {/* Replies Section */}
        <div className="mt-5 border-t border-white/10 pt-4">
          {!lantern.allowReplies ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-xs text-slate-300">
              <Lock className="h-4 w-4 shrink-0 text-amber-200/75" />
              <span>{dict.detail.repliesClosed}</span>
            </div>
          ) : (
            <>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-100/85">
                {interpolate(dict.detail.repliesTitle, { count: replies.length })}
              </h3>

              {loadingReplies ? (
                <div className="flex items-center justify-center py-4 text-xs text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                </div>
              ) : replies.length === 0 ? (
                <p className="rounded-xl bg-white/[0.03] px-3.5 py-3 text-xs text-slate-400">
                  {dict.detail.repliesEmpty}
                </p>
              ) : (
                <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                  {replies.map((r) => (
                    <div
                      key={r.id}
                      className="group rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5"
                    >
                      <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-100 sm:text-sm">
                        {r.content}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {r.nickname || dict.compose.anonymous} ·{' '}
                          {formatRelativeTime(r.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({ targetType: 'reply', targetId: r.id })
                          }
                          className="opacity-60 transition hover:text-rose-200 hover:opacity-100"
                          title={dict.detail.report}
                        >
                          <Flag className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Free reply form */}
              <form onSubmit={handleReplySubmit} className="mt-3.5 space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value.slice(0, 300))}
                  rows={2}
                  placeholder={dict.detail.replyPlaceholder}
                  className="w-full resize-none rounded-2xl border border-white/15 bg-[#060f26]/80 px-3.5 py-2.5 text-xs leading-relaxed text-slate-100 placeholder:text-slate-400/75 focus:border-amber-300/60 focus:outline-none sm:text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyNick}
                    onChange={(e) => setReplyNick(e.target.value.slice(0, 20))}
                    placeholder={dict.detail.replyNicknamePlaceholder}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#060f26]/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400/70 focus:border-amber-300/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submittingReply}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-300/90 px-4 py-2 text-xs font-semibold text-[#1a1208] transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {submittingReply ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    {submittingReply
                      ? dict.detail.replySubmitting
                      : dict.detail.replySubmit}
                  </button>
                </div>
                {replyError && <p className="text-xs text-rose-200">{replyError}</p>}
              </form>
            </>
          )}
        </div>

        {/* Inline Report confirmation */}
        {reportTarget && (
          <div className="mt-4 rounded-2xl border border-rose-300/25 bg-[#19122e]/95 p-4">
            <h4 className="text-xs font-semibold text-rose-100">
              {dict.detail.reportTitle}
            </h4>
            <p className="mt-1 text-[11px] text-slate-300">{dict.detail.reportDesc}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setReportReason(reason)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    reportReason === reason
                      ? 'border-rose-300/70 bg-rose-400/20 text-rose-100'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {dict.detail.reportReasons[reason]}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-xl px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
              >
                {dict.detail.close}
              </button>
              <button
                type="button"
                disabled={submittingReport}
                onClick={handleSubmitReport}
                className="rounded-xl bg-rose-400/85 px-3.5 py-1.5 text-xs font-medium text-[#1b0b12] hover:bg-rose-400"
              >
                {dict.detail.reportSubmit}
              </button>
            </div>
          </div>
        )}

        {/* Inline Owner Retract confirmation */}
        {confirmRetract && (
          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-[#1c1a33]/95 p-4">
            <h4 className="text-sm font-semibold text-amber-100">
              {dict.detail.retractConfirmTitle}
            </h4>
            <p className="mt-1 text-xs text-slate-300">{dict.detail.retractConfirmDesc}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRetract(false)}
                className="rounded-xl border border-white/15 px-3.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                {dict.detail.retractCancelBtn}
              </button>
              <button
                type="button"
                disabled={retracting}
                onClick={handleRetract}
                className="rounded-xl bg-rose-400/90 px-3.5 py-1.5 text-xs font-semibold text-[#1a0a10] hover:bg-rose-400"
              >
                {dict.detail.retractConfirmBtn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
