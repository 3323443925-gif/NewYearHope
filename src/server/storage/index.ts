import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateId } from '@/server/crypto';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

function getStorageMode(): 'local' | 'supabase' {
  if (
    process.env.STORAGE_PROVIDER === 'supabase' &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return 'supabase';
  }
  return 'local';
}

function getSupabaseStorage() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'lantern-images';
  const client = createClient(url, key, { auth: { persistSession: false } });
  return { client, bucket };
}

export function sanitizeMediaKey(rawKey: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(webp|png|jpeg|jpg)$/.test(rawKey)) {
    return null;
  }
  return rawKey;
}

export async function saveUploadedImage(
  buffer: Buffer,
  format: 'webp' | 'png' | 'jpeg'
): Promise<{ key: string; url: string }> {
  const key = `${generateId()}.${format}`;
  const mode = getStorageMode();

  if (mode === 'supabase') {
    const { client, bucket } = getSupabaseStorage();
    const contentType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
    const { error } = await client.storage.from(bucket).upload(key, buffer, {
      contentType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }
  } else {
    await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, key), buffer);
  }

  // Always serve via our own domain proxy route so mainland users never connect to *.supabase.co
  return { key, url: `/api/media/${key}` };
}

export async function readUploadedImage(
  rawKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const key = sanitizeMediaKey(rawKey);
  if (!key) return null;

  const ext = key.split('.').pop()?.toLowerCase();
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : 'image/webp';

  const mode = getStorageMode();
  if (mode === 'supabase') {
    const { client, bucket } = getSupabaseStorage();
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  try {
    const buffer = await fs.readFile(path.join(LOCAL_UPLOAD_DIR, key));
    return { buffer, contentType };
  } catch {
    return null;
  }
}

export async function deleteUploadedImageByUrl(imageUrl: string | null | undefined): Promise<void> {
  if (!imageUrl || !imageUrl.startsWith('/api/media/')) return;
  const rawKey = imageUrl.slice('/api/media/'.length);
  const key = sanitizeMediaKey(rawKey);
  if (!key) return;

  const mode = getStorageMode();
  if (mode === 'supabase') {
    try {
      const { client, bucket } = getSupabaseStorage();
      await client.storage.from(bucket).remove([key]);
    } catch {
      // Ignore cleanup errors
    }
    return;
  }

  try {
    await fs.unlink(path.join(LOCAL_UPLOAD_DIR, key));
  } catch {
    // Ignore missing file
  }
}
