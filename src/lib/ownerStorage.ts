import type { BlessingType } from '@/types/lantern';

const SECRET_KEY = 'starlight_owner_secret_v1';
const MY_IDS_KEY = 'starlight_my_lantern_ids_v1';
const SEEN_REPLIES_KEY = 'starlight_seen_replies_v1';
const BLESSED_KEY = 'starlight_blessed_v1';

function randomHex(byteLen = 24): string {
  const arr = new Uint8Array(byteLen);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < byteLen; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateOwnerSecret(): string {
  if (typeof window === 'undefined') return 'server-placeholder-secret';
  try {
    let secret = window.localStorage.getItem(SECRET_KEY);
    if (!secret || secret.length < 16) {
      secret = randomHex(24);
      window.localStorage.setItem(SECRET_KEY, secret);
    }
    return secret;
  } catch {
    return randomHex(24);
  }
}

export function getMyLanternIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MY_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberMyLanternId(id: string): string[] {
  const current = getMyLanternIds().filter((x) => x !== id);
  const next = [id, ...current].slice(0, 50);
  try {
    window.localStorage.setItem(MY_IDS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function forgetMyLanternId(id: string): string[] {
  const next = getMyLanternIds().filter((x) => x !== id);
  try {
    window.localStorage.setItem(MY_IDS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function getSeenReplyCounts(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SEEN_REPLIES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function markLanternRepliesSeen(id: string, replyCount: number): void {
  try {
    const map = getSeenReplyCounts();
    map[id] = replyCount;
    window.localStorage.setItem(SEEN_REPLIES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function hasBlessed(lanternId: string, type: BlessingType): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(BLESSED_KEY);
    if (!raw) return false;
    const set = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(set[`${lanternId}:${type}`]);
  } catch {
    return false;
  }
}

export function recordBlessed(lanternId: string, type: BlessingType): void {
  try {
    const raw = window.localStorage.getItem(BLESSED_KEY);
    const set = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    set[`${lanternId}:${type}`] = true;
    window.localStorage.setItem(BLESSED_KEY, JSON.stringify(set));
  } catch {
    // ignore
  }
}
