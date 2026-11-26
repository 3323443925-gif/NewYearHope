import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

const HASH_SALT = process.env.HASH_SALT || 'starlight-isle-default-salt';

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function saltedHash(input: string): string {
  return sha256(`${HASH_SALT}:${input}`);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

export function getClientIpHash(req: NextRequest): string {
  return saltedHash(getClientIp(req));
}

export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN || 'starlight-admin-dev';
}

export function isAdminAuthorized(req: NextRequest): boolean {
  const expected = getAdminToken();
  const headerToken =
    req.headers.get('x-admin-token') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    req.cookies.get('starlight_admin_token')?.value ||
    '';

  if (!headerToken || headerToken.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(expected));
}
