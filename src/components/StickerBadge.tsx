'use client';

import React from 'react';
import { getStickerById } from '@/data/stickers';

interface StickerBadgeProps {
  stickerId: string | null | undefined;
  size?: number;
  className?: string;
}

export default function StickerBadge({
  stickerId,
  size = 44,
  className = '',
}: StickerBadgeProps) {
  const sticker = getStickerById(stickerId);
  if (!sticker) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-white/5 p-1.5 ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
      aria-label={sticker.en}
      dangerouslySetInnerHTML={{ __html: sticker.svg }}
    />
  );
}
