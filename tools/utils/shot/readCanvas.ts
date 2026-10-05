import type { Page } from '@playwright/test';
import { SHOT_JPEG_QUALITY } from './SHOT_JPEG_QUALITY';
import type { ShotFormat } from '../../shot/@types/ShotFormat';

/**
 * readCanvas — encoded bytes of the WebGPU canvas alone, with no page chrome.
 * The frame and `toBlob` share one task: a WebGPU canvas is cleared once
 * presented, so any await between them reads back transparent black. The page
 * script is a string because tsx wraps a nested named function in `__name`,
 * which does not exist in the page.
 */
export async function readCanvas(page: Page, format: ShotFormat): Promise<Buffer> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const b64 = await page.evaluate<string | null>(`(async () => {
    await window.__skymap.nextFrame();
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const blob = await new Promise((r) => canvas.toBlob(r, '${mime}', ${SHOT_JPEG_QUALITY / 100}));
    if (!blob) return null;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  })()`);
  if (b64 === null) throw new Error('canvas readback produced no image');
  return Buffer.from(b64, 'base64');
}
