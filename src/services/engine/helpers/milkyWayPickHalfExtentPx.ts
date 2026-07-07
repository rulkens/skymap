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
 * ## Sizing: the RENDERED disc's extent, not the selection ring
 *
 * The hit target tracks what the user SEES — the glowing star/dust cloud —
 * not the selection ring, which is deliberately drawn ~3× larger to leave
 * breathing room around the object.  So this projects the cloud's physical
 * radius (`milkyWayCalibration.MILKY_WAY_RADIUS_MPC`, the same constant
 * that scales the generated cloud into the scene) to screen with the bare
 * apparent-size formula:
 *
 *   apparentPxRadius = (MILKY_WAY_RADIUS_MPC / camDist) * pxPerRad
 *
 * No ring scale, no points-pipeline 4× padding — just the disc's angular
 * half-extent, so the click area lands on the glow rather than the empty
 * sky around it.  A galaxy point-size floor keeps a small/far disk
 * hittable.  (The selection ring keys off `MILKY_WAY_DISC_RADIUS_KPC`
 * instead — a conventional-literature figure, not the rendered size; the
 * hit target must match the pixels actually drawn.)
 *
 * ## Camera: the last VISUAL frame, not the drag register
 *
 * All camera facts come from `state.picking.lastFrameCam` — the snapshot
 * stashed beside `lastFrameUniformBytes` by the point-sprites pass — so
 * the billboard is sized for the exact camera the pick pass replays.
 * Reading the live `state.cam` drag register instead would size the hit
 * target for a stale pose whenever the camera moves without a drag (wheel
 * zoom, tweens): the register only re-seeds on drag start.
 *
 * `camDist` is the distance from the camera to the galactic centre (NOT
 * from the origin).  `pxPerRad` is derived the same way `frameContext` does:
 * `canvasHeight / (2 * tan(fovY/2))`, using the backing-store canvas height
 * (texture pixels), because the pick pass renders into a texture of that size.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { MILKY_WAY_CENTER_WORLD } from '../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_RADIUS_MPC } from '../../gpu/galaxy/milkyWayCalibration';
import { milkyWayPickVisible } from './milkyWayPickVisible';

export function milkyWayPickHalfExtentPx(
  state: EngineState,
  canvasHeightPx: number,
): number | null {
  const cam = state.picking.lastFrameCam;
  if (!milkyWayPickVisible(state, canvasHeightPx) || !cam) return null;

  const p = cam.position;
  const dx = MILKY_WAY_CENTER_WORLD[0] - p[0]!;
  const dy = MILKY_WAY_CENTER_WORLD[1] - p[1]!;
  const dz = MILKY_WAY_CENTER_WORLD[2] - p[2]!;
  const camDistMpc = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const pxPerRad = canvasHeightPx / (2 * Math.tan(cam.fovYRad / 2));
  const apparentPxRadius = (MILKY_WAY_RADIUS_MPC / Math.max(camDistMpc, 0.001)) * pxPerRad;

  // Floor at the galaxy point size — the same far-field minimum the points
  // shader applies — so a small/far disk stays clickable.
  return Math.max(state.settings.galaxyCatalogs.sizePx, apparentPxRadius);
}
