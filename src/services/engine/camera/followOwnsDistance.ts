/**
 * followOwnsDistance — is `clock.followDistanceTarget` the distance the camera
 * is heading for this frame?
 *
 * Two sites have to agree on this or a zoom tick measures itself against one
 * distance and lands in another: `applyWheelZoom` picks the slot the tick is
 * written to, `zoomSourceCamera` picks the distance it is measured from. The
 * ease target runs AHEAD of the rendered distance for the whole approach
 * (`followBody`'s pose lerps toward it over `FOCUS_TWEEN_MS`), so disagreement
 * there is not a rounding difference — it is the difference between a floored
 * zoom and one that walks the target through the planet.
 *
 * `null` means the follow driver's `pose` has not run yet to seed the target —
 * the one-frame window right after a focus, where `base` is still the honest
 * source.
 */

import type { CameraClock } from '../../../@types/engine/camera/CameraClock';

export function followOwnsDistance(clock: CameraClock, prevActiveId: string): boolean {
  return prevActiveId === 'followBody' && clock.followDistanceTarget !== null;
}
