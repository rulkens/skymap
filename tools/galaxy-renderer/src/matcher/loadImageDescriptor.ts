/**
 * loadImageDescriptor — load a same-origin (or CORS-enabled) image and
 * compute its `GalaxyDescriptor`, so `autoFit` can target a real reference
 * photo. Ported from the spike's `galaxy-matcher.js`: a centre-square "cover" crop
 * (matches the shorter image dimension so a non-square source isn't
 * stretched) scaled down to `size`, then handed to `computeDescriptor`.
 *
 * DOM-thin by design — `Image`/`canvas` have no node equivalent, so this is
 * exercised visually via the compare panel, not by a unit test.
 */
import { computeDescriptor } from './computeDescriptor';
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';

export async function loadImageDescriptor(
  url: string,
  size = 116,
): Promise<{ desc: GalaxyDescriptor | null; width: number; height: number }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('img load: ' + url));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  // cover-fit (centre square crop) so scale roughly matches a centered galaxy
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  return { desc: computeDescriptor(data, size), width: img.width, height: img.height };
}
