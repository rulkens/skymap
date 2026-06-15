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
 * ## Sizing: the impostor's visible extent, not the selection ring
 *
 * The hit target tracks what the user SEES — the glowing disc — not the
 * selection ring, which is deliberately drawn ~3× larger to leave breathing
 * room around the object.  So this projects the Milky Way's disc radius to
 * screen with the bare apparent-size formula:
 *
 *   apparentPxRadius = (discRadiusMpc / camDist) * pxPerRad
 *
 * No ring scale, no points-pipeline 4× padding — just the disc's angular
 * half-extent.  The disc's bright emission fades around this radius (the
 * fragment shader's `MILKY_WAY_RADIUS_MPC` scale), so the click area lands on
 * the glow rather than the empty padding of the 240-kpc billboard quad.  A
 * galaxy point-size floor keeps a small/far disk hittable.
 *
 * `camDist` is the distance from the camera to the galactic centre (NOT
 * from the origin).  `pxPerRad` is derived the same way `frameContext` does:
 * `canvasHeight / (2 * tan(fovY/2))`, using the backing-store canvas height
 * (texture pixels), because the pick pass renders into a texture of that size.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../../data/milkyWay/galacticCenter';
import { milkyWayPickVisible } from './milkyWayPickVisible';

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
  const apparentPxRadius =
    (MILKY_WAY_DISC_RADIUS_KPC / 1000 / Math.max(camDistMpc, 0.001)) * pxPerRad;

  // Floor at the galaxy point size — the same far-field minimum the points
  // shader applies — so a small/far disk stays clickable.
  return Math.max(state.settings.galaxyCatalogs.sizePx, apparentPxRadius);
}
