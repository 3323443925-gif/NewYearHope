import { describe, expect, it } from 'vitest';
import { moderateImageBuffer, moderateText } from '@/server/moderation';

describe('content moderation & crisis support', () => {
  it('allows warm bilingual New Year messages', async () => {
    const zh = await moderateText('愿 2027 年大家都平安喜乐，孤独的时候也有温暖陪伴。');
    expect(zh.allowed).toBe(true);
    expect(zh.crisisSupport).toBe(false);

    const en = await moderateText('Wishing every stranger here a peaceful and hopeful 2027!');
    expect(en.allowed).toBe(true);
    expect(en.crisisSupport).toBe(false);
  });

  it('blocks spam links and abusive language in both Chinese and English', async () => {
    const spam = await moderateText('兼职日结加微 123456 https://spam.example.com');
    expect(spam.allowed).toBe(false);
    expect(spam.reason).toBe('spam');

    const abuseEn = await moderateText('you are a stupid bitch');
    expect(abuseEn.allowed).toBe(false);
    expect(abuseEn.reason).toBe('profanity');
  });

  it('flags crisis distress with gentle helpline support instead of cold rejection', async () => {
    const zhCrisis = await moderateText('最近太累了，有时候真的不想活了，好孤单。');
    expect(zhCrisis.allowed).toBe(true);
    expect(zhCrisis.crisisSupport).toBe(true);

    const enCrisis = await moderateText('Tonight I feel so lonely I want to die.');
    expect(enCrisis.allowed).toBe(true);
    expect(enCrisis.crisisSupport).toBe(true);
  });

  it('validates image magic bytes and rejects non-images', async () => {
    const fakeText = Buffer.from('not an image at all');
    const bad = await moderateImageBuffer(fakeText);
    expect(bad.allowed).toBe(false);

    // Minimal valid WebP RIFF header
    const validWebpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const ok = await moderateImageBuffer(validWebpHeader);
    expect(ok.allowed).toBe(true);
    expect(ok.format).toBe('webp');
  });
});
