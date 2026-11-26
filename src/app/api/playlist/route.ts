import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const AUDIO_EXTENSIONS = new Set([
  '.mp4',
  '.mp3',
  '.m4a',
  '.ogg',
  '.wav',
  '.flac',
  '.webm',
  '.aac',
]);

export const dynamic = 'force-static';

const PREFERRED_ORDER = ['1猫猫.mp4', '2lostmypieces.mp4', '3黄昏之时.mp4'];

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    const entries = await readdir(publicDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        return AUDIO_EXTENSIONS.has(ext);
      })
      .map((entry) => entry.name)
      .sort((a, b) => {
        const ia = PREFERRED_ORDER.indexOf(a);
        const ib = PREFERRED_ORDER.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b, 'zh-CN', { numeric: true });
      });

    const tracks = files.map((filename) => ({
      id: filename,
      title: filename.replace(/\.[^.]+$/, ''),
      src: `/${encodeURIComponent(filename)}`,
    }));

    return NextResponse.json(
      { tracks },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch {
    return NextResponse.json({ tracks: [] }, { status: 200 });
  }
}
