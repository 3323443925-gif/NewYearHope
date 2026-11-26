import type { ModerationResult } from '@/types/lantern';

const SPAM_PATTERNS: RegExp[] = [
  /(https?:\/\/|www\.)\S+/i,
  /(加微|加v|威信|微信|vx|qq群|代刷|兼职日结|刷单|博彩|赌博|彩票计划|色情网站|裸聊|办证)/i,
  /(buy now|free crypto|casino bonus|telegram\s*@|whatsapp\s*\+?\d|click here to earn)/i,
  /([0-9a-zA-Z])\1{10,}/, // excessive repeated characters
];

const PROFANITY_PATTERNS: RegExp[] = [
  /(傻逼|操你妈|草泥马|去死吧|滚蛋|nmsl|cnm|智障|贱人|婊子|垃圾废物)/i,
  /\b(fuck\s+you|kill\s+yourself|kys|bitch|cunt|nigger|faggot|whore|retard)\b/i,
];

const CRISIS_PATTERNS: RegExp[] = [
  /(不想活了|想自杀|想结束生命|想离开这个世界|跳楼|割腕|活不下去了|活着没意思)/i,
  /\b(want to die|kill myself|end my life|suicidal|don't want to live|no reason to live)\b/i,
];

function detectImageType(buffer: Buffer): 'webp' | 'png' | 'jpeg' | null {
  if (buffer.length < 12) return null;
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

async function callOpenAIModeration(input: unknown): Promise<{
  flagged: boolean;
  selfHarm: boolean;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.OPENAI_MODERATION_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(`${baseUrl}/moderations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        flagged?: boolean;
        categories?: Record<string, boolean>;
      }>;
    };
    const first = data.results?.[0];
    if (!first) return null;
    const cats = first.categories ?? {};
    const selfHarm = Boolean(
      cats['self-harm'] || cats['self-harm/intent'] || cats['self-harm/instructions']
    );
    const harmfulOthers = Boolean(
      cats['sexual'] ||
        cats['sexual/minors'] ||
        cats['hate'] ||
        cats['hate/threatening'] ||
        cats['harassment'] ||
        cats['harassment/threatening'] ||
        cats['violence'] ||
        cats['violence/graphic']
    );
    return { flagged: harmfulOthers, selfHarm };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const normalized = text.trim();
  const crisisSupport = CRISIS_PATTERNS.some((rx) => rx.test(normalized));

  if (SPAM_PATTERNS.some((rx) => rx.test(normalized))) {
    return { allowed: false, reason: 'spam', crisisSupport };
  }
  if (PROFANITY_PATTERNS.some((rx) => rx.test(normalized))) {
    return { allowed: false, reason: 'profanity', crisisSupport };
  }

  const cloud = await callOpenAIModeration(normalized);
  if (cloud?.flagged) {
    return {
      allowed: false,
      reason: 'profanity',
      crisisSupport: crisisSupport || cloud.selfHarm,
    };
  }

  return {
    allowed: true,
    crisisSupport: crisisSupport || Boolean(cloud?.selfHarm),
  };
}

export async function moderateImageBuffer(
  buffer: Buffer
): Promise<{ allowed: boolean; format: 'webp' | 'png' | 'jpeg' | null; reason?: string }> {
  if (buffer.length === 0 || buffer.length > 600 * 1024) {
    return { allowed: false, format: null, reason: 'size' };
  }
  const format = detectImageType(buffer);
  if (!format) {
    return { allowed: false, format: null, reason: 'format' };
  }

  if (process.env.OPENAI_API_KEY) {
    const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    const cloud = await callOpenAIModeration([
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
    if (cloud?.flagged) {
      return { allowed: false, format, reason: 'inappropriate_image' };
    }
  }

  return { allowed: true, format };
}
