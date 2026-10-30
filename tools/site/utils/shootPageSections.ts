import { join } from 'node:path';
import type { Page } from '@playwright/test';

import type { SectionBand } from '../@types/SectionBand';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

/**
 * Writes `<out>/<prefix>-full.png` and one `<prefix>-<n>-<slug>.png` per h2 section (n from 0) of a
 * page opened by `openScrolledSitePage`, and returns the sections' bands.
 */
export async function shootPageSections(
  page: Page,
  out: string,
  prefix: string,
): Promise<SectionBand[]> {
  const width = page.viewportSize()!.width;
  await page.screenshot({ path: join(out, `${prefix}-full.png`), fullPage: true });
  // A section is the outermost box between the h2 and <main>, so its whole band is shot. An island
  // wrapper (`astro-island`) is `display: contents` and has no box of its own, so it never counts.
  const sections = await page.$$eval('main h2', (headings) =>
    headings.map((h) => {
      let el: Element = h;
      let band: Element = h;
      while (el.parentElement && el.parentElement.tagName !== 'MAIN') {
        el = el.parentElement;
        if (getComputedStyle(el).display !== 'contents') band = el;
      }
      const box = band.getBoundingClientRect();
      return { text: h.textContent ?? '', y: box.top + window.scrollY, h: box.height };
    }),
  );
  for (const [n, s] of sections.entries()) {
    await page.evaluate((top) => window.scrollTo(0, top), s.y);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(out, `${prefix}-${n}-${slug(s.text)}.png`),
      fullPage: true,
      clip: { x: 0, y: s.y, width, height: Math.max(1, s.h) },
    });
  }
  return sections;
}
