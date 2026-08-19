/**
 * scaleBar — pure helper that computes the bottom-right distance legend
 * (label + pixel width) from a camera snapshot and viewport size.
 *
 * ### Where this runs
 *
 * Called engine-side at the frame site (`runFrame.ts`), which feeds the
 * per-frame camera snapshot alongside the live canvas CSS size.  The pure
 * return value is dispatched via `engineScaleChanged`, whose dedup-on-write
 * reducer skips the assignment when label + widthPx are unchanged — so an
 * autorotate frame that produces an identical legend never re-renders the
 * HUD.  React reads the dispatched value via `selectScale`.
 *
 * The file still lives under `services/engine/helpers/` alongside the frame
 * loop that calls it; logically it's a pure UI helper.
 *
 * ### The math
 *
 * With a perspective camera, the visible vertical world height at a
 * distance `d` from the camera is:
 *
 *     h_world(d) = 2 · d · tan(fovY / 2)
 *
 * One world unit therefore takes up:
 *
 *     pxPerMpc(d) = viewportHeightPx / h_world(d)
 *
 * pixels at distance d.  We measure at the GROUND when the pivot is a body
 * or star — `cam.distance` is to its CENTRE, which saturates at ~1 radius
 * near the surface and would otherwise pin the legend there — and at the
 * pivot itself otherwise (empty space, galaxy, structure).
 *
 * Given a `targetPx` (the rough pixel width we'd like the legend to
 * occupy — currently 150 px), we want to render a "nice" round number
 * of Mpc that fits within that target:
 *
 *     desiredMpc = targetPx / pxPerMpc
 *     niceMpc    = niceRound(desiredMpc)         // {1, 2, 5} × 10^k
 *     widthPx    = niceMpc · pxPerMpc            // ≤ targetPx
 *
 * `niceRound` rounds *down* (rather than to nearest) so the rendered bar
 * always fits inside `targetPx` rather than overflowing it.
 *
 * ### CSS pixels vs. backing-store pixels
 *
 * The caller passes `canvasSize.height` in CSS pixels (typically
 * `canvas.clientHeight`), not the DPR-multiplied backing-store size.
 * That keeps the bar's physical width on screen consistent across DPRs
 * — a 150 px legend looks the same on a Retina display as on a regular
 * one, even though the underlying GPU framebuffer has 4× as many
 * texels.  Same rationale that drove the original engine.ts choice.
 *
 * ### Returning null
 *
 * Two failure cases short-circuit cleanly to `null` so the caller can
 * skip the setState step without special-casing zero/inf:
 *
 *   - `viewportCssHeight === 0` — pre-resize, no usable scale yet.
 *   - `pxPerMpc` non-finite or non-positive — degenerate camera state
 *     (distance ≈ 0 or fovY ≈ π).  Could only happen during a tween or
 *     a programmatic mis-set; safer to skip the legend update than to
 *     emit garbage.
 */

import { formatDistance } from '../../../utils/format/formatDistance';
import { niceRound } from '../../../utils/math/niceRound';
import type { ScaleInfo } from '../../../@types/engine/ScaleInfo';
import type { ScaleBarCamera } from '../../../@types/camera/ScaleBarCamera';

/**
 * Compute the next ScaleInfo (label + rounded pixel width) for the
 * legend, or `null` if the input camera/viewport is degenerate.
 *
 * Pure: no I/O, no mutation.
 *
 * @param cam             Camera state (only `distance` and `fovYRad` are read).
 * @param canvasSize      Viewport dimensions in CSS pixels.  Only `height` is
 *                        used by the math; `width` is accepted for symmetry
 *                        and possible future use (e.g. a horizontal-bar
 *                        variant).
 * @param targetPx        Desired legend bar width in CSS pixels.  The
 *                        returned `widthPx` will be ≤ `targetPx` thanks to
 *                        `niceRound`'s floor behaviour.
 * @param pivotRadiusMpc  Physical radius of whatever sits at the orbit pivot,
 *                        or `null` when it has no surface. Required, not
 *                        optional: an optional param lets a call site
 *                        silently fall back to measuring at the pivot.
 */
export function computeScaleInfo({
  cam,
  canvasSize,
  targetPx,
  pivotRadiusMpc,
}: {
  cam: ScaleBarCamera;
  canvasSize: { width: number; height: number };
  targetPx: number;
  pivotRadiusMpc: number | null;
}): ScaleInfo | null {
  const viewportCssHeight = canvasSize.height;
  if (viewportCssHeight === 0) return null;

  const effectiveDistance = cam.distance - (pivotRadiusMpc ?? 0);
  const pxPerMpc = viewportCssHeight / (2 * effectiveDistance * Math.tan(cam.fovYRad / 2));
  if (!isFinite(pxPerMpc) || pxPerMpc <= 0) return null;

  const desiredMpc = targetPx / pxPerMpc;
  const niceMpc = niceRound(desiredMpc);
  const widthPx = niceMpc * pxPerMpc;

  return {
    label: formatDistance(niceMpc),
    widthPx: Math.round(widthPx),
  };
}
