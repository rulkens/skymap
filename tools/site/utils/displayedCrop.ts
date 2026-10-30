import type { Page } from '@playwright/test';
import sharp from 'sharp';

import type { PictureMeasure } from '../@types/PictureMeasure';

// Pictures that unmask or settle as they arrive need this long in view before they are shot.
const REVEAL_MS = 700;

/**
 * A picture as a visitor sees it: scrolled to the middle of the window, given time to arrive, then
 * shot from the page with whatever lies over it. A slide hidden under another at that moment would
 * show its neighbour, so it is drawn from its own file, framed to its box as its `object-fit` does,
 * and returned as `hidden`.
 */
export async function displayedCrop(
  page: Page,
  m: PictureMeasure,
  dpr: number,
): Promise<{ png: Buffer; hidden: boolean }> {
  const el = page.locator(`[data-judge-index="${m.index}"]`);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(REVEAL_MS);
  const box = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    // A slide waiting under another sits in a faded, `visibility: hidden` layer.
    let opacity = 1;
    for (let a: Element | null = node; a && a.tagName !== 'MAIN'; a = a.parentElement)
      opacity *= Number(getComputedStyle(a).opacity);
    const visible = getComputedStyle(node).visibility === 'visible' && opacity > 0.05;
    return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height, visible };
  });
  if (!box.visible && m.kind === 'img') {
    const file = await (await page.request.get(m.src)).body();
    const png = await sharp(file)
      .resize({
        width: Math.round(m.box.width * dpr),
        height: Math.round(m.box.height * dpr),
        fit: m.objectFit === 'cover' ? 'cover' : m.objectFit === 'fill' ? 'fill' : 'contain',
        background: '#000',
      })
      .png()
      .toBuffer();
    return { png, hidden: true };
  }
  const width = page.viewportSize()!.width;
  const x = Math.max(0, box.x);
  const png = await page.screenshot({
    fullPage: true,
    clip: {
      x,
      y: box.y,
      width: Math.max(1, Math.min(width, box.x + box.width) - x),
      height: Math.max(1, box.height),
    },
  });
  return { png, hidden: !box.visible };
}
