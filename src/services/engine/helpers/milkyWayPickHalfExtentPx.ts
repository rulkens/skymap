/**
 * milkyWayPickHalfExtentPx — screen-pixel half-extent of the Milky-Way
 * pick billboard this frame, or `null` when the disk isn't on screen.
 *
 * Folds the pick gate and the pick size into one value the pick renderer
 * consumes as data: `null` means "don't draw the MW hit target" (the disk
 * is faded out — see `milkyWayPickVisible`), and a number means "draw it
 * this many pixels of half-extent".  The renderer stays free of
 * EngineState; it just draws what it's told.
 *
 * ## Why the size matches the selection ring
 *
 * The visible selection ring sizes itself from the Milky Way's 25 kpc disc
 * radius at the current camera distance via `selectionRingRadiusPx`.  The
 * pick target calls the SAME helper with the SAME inputs, so the click
 * area always equals the ring the user sees — it grows as you approach the
 * disk and never drops below the galaxy point-size floor (so a small/far
 * MW stays hittable).  This replaces the old fixed 16 px half-extent that
 * didn't track the disk's apparent size.
 *
 * `camDist` is the distance from the camera to the galactic centre (NOT
 * from the origin), matching the selection ring's `worldPos - drawCamPos`
 * — the ring and the hit target measure the same span.  `pxPerRad` is
 * derived the same way `frameContext` does: `canvasHeight / (2 *
 * tan(fovY/2))`, using the backing-store canvas height (texture pixels),
 * because the pick pass renders into a texture of that size.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../../data/milkyWay/galacticCenter';
import { milkyWayPickVisible } from './milkyWayPickVisible';
import { selectionRingRadiusPx } from './selectionRingRadiusPx';

export function milkyWayPickHalfExtentPx(
  state: EngineState,
  canvasHeightPx: number,
): number | null {
  if (!milkyWayPickVisible(state) || !state.cam) return null;

  const p = state.cam.position;
  const dx = MILKY_WAY_CENTER_WORLD[0] - p[0]!;
  const dy = MILKY_WAY_CENTER_WORLD[1] - p[1]!;
  const dz = MILKY_WAY_CENTER_WORLD[2] - p[2]!;
  const camDistMpc = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const pxPerRad = canvasHeightPx / (2 * Math.tan(state.cam.fovYRad / 2));

  return selectionRingRadiusPx(
    MILKY_WAY_DISC_RADIUS_KPC / 1000,
    camDistMpc,
    pxPerRad,
    state.settings.galaxyCatalogs.sizePx,
  );
}
