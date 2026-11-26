export interface ProcessedImage {
  blob: Blob;
  previewUrl: string;
  sizeKb: number;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1280;
const TARGET_MAX_BYTES = 300 * 1024;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/**
 * Compresses a user-selected image in the browser via offscreen Canvas:
 * - Resizes longest edge to <= 1280px
 * - Converts to WebP (with JPEG fallback) under <= 300KB
 * - Re-encoding through Canvas automatically strips all EXIF metadata (including GPS).
 */
export async function compressAndStripExif(file: File): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const bitmap = await loadImageFromFile(file);
  const ratio = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('CANVAS_UNAVAILABLE');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, 'image/webp', 0.84);
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  }
  if (!blob) {
    throw new Error('ENCODE_FAILED');
  }

  // Step down quality gently until under target size
  const qualities = [0.72, 0.6, 0.48, 0.36];
  for (const q of qualities) {
    if (blob.size <= TARGET_MAX_BYTES) break;
    const next = await canvasToBlob(canvas, blob.type, q);
    if (next) blob = next;
  }

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    width,
    height,
  };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
