import type { Page } from '@playwright/test';

import type { PictureMeasure } from '../@types/PictureMeasure';

// A `preload="none"` film reports no size until asked for its metadata; a dev server answers well inside this.
const LOAD_MS = 3000;

/**
 * Every `<img>` and `<video>` in `<main>`, measured as drawn, each marked `data-judge-index` so the
 * caller can shoot it later. Lazy pictures still waiting are loaded and films that loaded nothing
 * are asked for their metadata first.
 */
export async function measurePictures(page: Page): Promise<PictureMeasure[]> {
  // No helper function in here: tsx wraps a named one in a call the page does not have.
  return page.evaluate(async (loadMs) => {
    const media = [
      ...document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('main img, main video'),
    ];
    await Promise.all(
      media.map(
        (el) =>
          new Promise((done) => {
            if (el instanceof HTMLVideoElement ? el.readyState > 0 : el.complete) return done(null);
            el.addEventListener(el instanceof HTMLVideoElement ? 'loadedmetadata' : 'load', done, {
              once: true,
            });
            el.addEventListener('error', done, { once: true });
            setTimeout(done, loadMs);
            if (el instanceof HTMLVideoElement) {
              el.preload = 'metadata';
              el.load();
            } else el.loading = 'eager';
          }),
      ),
    );
    return media.map((el, index) => {
      el.setAttribute('data-judge-index', String(index));
      const rect = el.getBoundingClientRect();
      const video = el instanceof HTMLVideoElement;
      // The layout box, not the transformed one: a screen turned in 3D draws narrower than it lays out.
      return {
        index,
        kind: video ? ('video' as const) : ('img' as const),
        src:
          el.currentSrc ||
          el.getAttribute('src') ||
          (video ? (el.querySelector('source')?.src ?? '') : ''),
        box: {
          x: rect.left,
          y: rect.top + window.scrollY,
          width: el.offsetWidth,
          height: el.offsetHeight,
        },
        naturalWidth: video ? el.videoWidth : el.naturalWidth,
        naturalHeight: video ? el.videoHeight : el.naturalHeight,
        objectFit: getComputedStyle(el).objectFit,
        alt: el.getAttribute('alt'),
        shown: rect.width > 0 && rect.height > 0,
      };
    });
  }, LOAD_MS);
}
