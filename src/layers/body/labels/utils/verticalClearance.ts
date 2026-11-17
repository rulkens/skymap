/**
 * verticalClearance — how far (px, y down) to move `rect` up or down so it clears every
 * `kept` rect by `padPx` and stays `inside` (the disc), the smaller move first, never more
 * than `slackPx`; null when no such move exists. A sea's name steps off a higher-ranked
 * sea's name instead of losing the declutter to it (Crisium under Tranquillitatis).
 */

import type { ScreenRectPx } from '../../../../@types/rendering/ScreenRectPx';

export function verticalClearance(
  rect: ScreenRectPx,
  slackPx: number,
  kept: readonly ScreenRectPx[],
  padPx: number,
  inside: (moved: ScreenRectPx) => boolean,
): number | null {
  const clears = (dy: number): boolean =>
    kept.every(
      (k) =>
        rect.x0 - padPx >= k.x1 ||
        rect.x1 + padPx <= k.x0 ||
        rect.y0 + dy - padPx >= k.y1 ||
        rect.y1 + dy + padPx <= k.y0,
    );
  if (clears(0)) return 0;
  // Each blocker's edge is a candidate stop; the nearest that clears all and fits wins.
  const stops = kept
    .flatMap((k) => [k.y1 + padPx - rect.y0, k.y0 - padPx - rect.y1])
    .filter((dy) => Math.abs(dy) <= slackPx)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  const dy = stops.find(
    (d) => clears(d) && inside({ x0: rect.x0, y0: rect.y0 + d, x1: rect.x1, y1: rect.y1 + d }),
  );
  return dy ?? null;
}
