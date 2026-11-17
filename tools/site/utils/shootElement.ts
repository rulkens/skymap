import type { Page } from '@playwright/test';

// Room round the element for its shadow and rounded corners.
const ELEMENT_MARGIN_PX = 24;

/** Nothing but the element is painted (not the canvas, a modal's backdrop or a neighbouring panel), so the PNG's ground is transparent. */
const onlyCss = (selector: string) =>
  `html, body, #root { background: transparent !important; }
   body * { visibility: hidden !important; }
   ${selector}, ${selector} * { visibility: visible !important; }`;

/** A PNG of one element of the app's interface on a transparent ground, its margin included and clamped to the window. */
export async function shootElement(page: Page, selector: string): Promise<Buffer> {
  await page.addStyleTag({ content: onlyCss(selector) });
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`element ${selector}: not on the page`);
  const view = page.viewportSize()!;
  const left = Math.max(0, Math.floor(box.x - ELEMENT_MARGIN_PX));
  const top = Math.max(0, Math.floor(box.y - ELEMENT_MARGIN_PX));
  const right = Math.min(view.width, Math.ceil(box.x + box.width + ELEMENT_MARGIN_PX));
  const bottom = Math.min(view.height, Math.ceil(box.y + box.height + ELEMENT_MARGIN_PX));
  return page.screenshot({
    type: 'png',
    omitBackground: true,
    clip: { x: left, y: top, width: right - left, height: bottom - top },
  });
}
