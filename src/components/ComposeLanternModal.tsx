'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Sparkles, X, Loader2, Trash2 } from 'lucide-react';
import type { LanternItem, LanternType, MoodKey } from '@/types/lantern';
import { HEALING_STICKERS } from '@/data/stickers';
import { useI18n, interpolate } from '@/lib/i18n';
import { compressAndStripExif, type ProcessedImage } from '@/lib/imageProcessor';
import { getOrCreateOwnerSecret } from '@/lib/ownerStorage';

interface ComposeLanternModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (lantern: LanternItem, showCrisisSupport: boolean) => void;
}

const LANTERN_TYPES: LanternType[] = ['wish', 'unspoken', 'greeting'];
const MOOD_KEYS: MoodKey[] = [
  'hopeful',
  'missing',
  'relieved',
  'lonely',
  'grateful',
  'encouraging',
];

export default function ComposeLanternModal({
  open,
  onClose,
  onCreated,
}: ComposeLanternModalProps) {
  const { locale, dict } = useI18n();
  const [type, setType] = useState<LanternType>('wish');
  const [mood, setMood] = useState<MoodKey>('hopeful');
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [stickerId, setStickerId] = useState<string | null>('sky-lantern');
  const [allowReplies, setAllowReplies] = useState(true);
  const [processedImg, setProcessedImg] = useState<ProcessedImage | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (processedImg?.previewUrl) {
        URL.revokeObjectURL(processedImg.previewUrl);
      }
    };
  }, [processedImg]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setCompressing(true);
    try {
      if (processedImg?.previewUrl) {
        URL.revokeObjectURL(processedImg.previewUrl);
      }
      const result = await compressAndStripExif(file);
      setProcessedImg(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'IMAGE_TOO_LARGE') {
        setErrorMsg(dict.errors.imageTooLarge);
      } else {
        setErrorMsg(dict.errors.imageBlocked);
      }
    } finally {
      setCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    if (processedImg?.previewUrl) {
      URL.revokeObjectURL(processedImg.previewUrl);
    }
    setProcessedImg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 500) {
      setErrorMsg(dict.errors.contentRequired);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      let uploadedImageUrl: string | null = null;
      if (processedImg) {
        const fd = new FormData();
        const ext = processedImg.blob.type === 'image/jpeg' ? 'jpg' : 'webp';
        fd.append('file', processedImg.blob, `photo.${ext}`);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!uploadRes.ok) {
          const errData = (await uploadRes.json().catch(() => ({}))) as { error?: string };
          if (errData.error === 'rate_limited') {
            setErrorMsg(dict.errors.rateLimited);
          } else {
            setErrorMsg(dict.errors.imageBlocked);
          }
          setSubmitting(false);
          return;
        }
        const uploadJson = (await uploadRes.json()) as { url: string };
        uploadedImageUrl = uploadJson.url;
      }

      const ownerSecret = getOrCreateOwnerSecret();
      const res = await fetch('/api/lanterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          mood,
          content: trimmed,
          nickname: nickname.trim(),
          stickerId,
          imageUrl: uploadedImageUrl,
          allowReplies,
          locale,
          ownerSecret,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        lantern?: LanternItem;
        crisisSupport?: boolean;
        error?: string;
      };

      if (!res.ok || !data.lantern) {
        if (data.error === 'moderation_blocked') {
          setErrorMsg(dict.errors.moderationBlocked);
        } else if (data.error === 'rate_limited') {
          setErrorMsg(dict.errors.rateLimited);
        } else {
          setErrorMsg(dict.errors.networkError);
        }
        setSubmitting(false);
        return;
      }

      // Reset form cleanly
      setContent('');
      setNickname('');
      removeImage();
      setAllowReplies(true);
      onCreated(data.lantern, Boolean(data.crisisSupport));
      onClose();
    } catch {
      setErrorMsg(dict.errors.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[#030714]/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-amber-200/20 bg-[#0b1736]/92 p-5 text-slate-100 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:p-6">
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label={dict.detail.close}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 pr-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-100 sm:text-xl">
            <Sparkles className="h-5 w-5 text-amber-300" />
            {dict.compose.title}
          </h2>
          <p className="mt-1 text-xs text-slate-300/85 sm:text-sm">
            {dict.compose.subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lantern Type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-amber-100/90">
              {dict.compose.typeLabel}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {LANTERN_TYPES.map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-amber-300/70 bg-amber-300/15 text-amber-100 shadow-[0_0_20px_rgba(255,210,125,0.16)]'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="text-xs font-medium sm:text-sm">{dict.types[t]}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-amber-200/70">{dict.typeHints[type]}</p>
          </div>

          {/* Mood */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-amber-100/90">
              {dict.compose.moodLabel}
            </label>
            <div className="flex flex-wrap gap-2">
              {MOOD_KEYS.map((m) => {
                const active = mood === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(m)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? 'border-sky-300/70 bg-sky-300/20 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {dict.moods[m]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-amber-100/90">
                {dict.compose.contentLabel}
              </label>
              <span className="text-[11px] text-slate-400">{content.length} / 500</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 500))}
              rows={4}
              placeholder={dict.compose.contentPlaceholder}
              className="font-letter w-full resize-none rounded-2xl border border-white/15 bg-[#060f26]/80 px-3.5 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-400/75 focus:border-amber-300/60 focus:outline-none"
            />
          </div>

          {/* Nickname */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-amber-100/90">
              {dict.compose.nicknameLabel}
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              placeholder={dict.compose.nicknamePlaceholder}
              className="w-full rounded-xl border border-white/15 bg-[#060f26]/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400/70 focus:border-amber-300/60 focus:outline-none"
            />
          </div>

          {/* Healing Stickers */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-amber-100/90">
              {dict.compose.stickerLabel}
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setStickerId(null)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs transition ${
                  stickerId === null
                    ? 'border-amber-300/70 bg-amber-300/15 text-amber-100'
                    : 'border-white/10 bg-white/5 text-slate-300'
                }`}
              >
                {dict.compose.noSticker}
              </button>
              {HEALING_STICKERS.map((s) => {
                const active = stickerId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStickerId(s.id)}
                    title={locale === 'zh' ? s.zh : s.en}
                    className={`flex shrink-0 flex-col items-center rounded-xl border p-1.5 transition ${
                      active
                        ? 'border-amber-300/80 bg-amber-300/15'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="h-9 w-9"
                      dangerouslySetInnerHTML={{ __html: s.svg }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photo upload with automatic WebP compression + EXIF stripping */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-amber-100/90">
              {dict.compose.imageLabel}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {!processedImg ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressing}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-3 text-xs text-slate-200 transition hover:border-amber-200/40 hover:bg-white/[0.06]"
              >
                {compressing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                    {dict.compose.imageCompressing}
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 text-amber-300" />
                    {dict.compose.imagePick}
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={processedImg.previewUrl}
                  alt="Preview"
                  className="h-16 w-16 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-amber-100">
                    {interpolate(dict.compose.imageReady, { size: processedImg.sizeKb })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {processedImg.width} × {processedImg.height}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeImage}
                  className="rounded-xl p-2 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-200"
                  title={dict.compose.imageRemove}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Allow replies switch */}
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div>
              <div className="text-xs font-medium text-slate-100 sm:text-sm">
                {dict.compose.allowRepliesTitle}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-300/80">
                {dict.compose.allowRepliesDesc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={allowReplies}
              onChange={(e) => setAllowReplies(e.target.checked)}
              className="mt-1 h-4 w-4 accent-amber-400"
            />
          </label>

          {errorMsg && (
            <div className="rounded-xl border border-rose-300/30 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-100">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || compressing}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 px-5 py-3 text-sm font-semibold text-[#1c1309] shadow-[0_6px_28px_rgba(255,190,105,0.35)] transition hover:brightness-105 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {dict.compose.submitting}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {dict.compose.submit}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
