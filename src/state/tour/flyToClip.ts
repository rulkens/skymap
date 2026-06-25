/**
 * flyToClip — builds the establishing-move clip that flies the camera to the
 * beat's resolved focus pose.
 *
 * ### Why pure over a pre-resolved pose?
 *
 * The builder has no business knowing HOW a SelectionRef maps to world
 * coordinates — that is engine state (galaxy clouds, structure catalogs). The
 * resolver seam (Task 6, `tourSaga`) resolves the SelectionRef BEFORE calling
 * this function and passes the result as `ResolvedFocus`. This keeps `flyToClip`
 * a pure function over plain data: deterministic, synchronous, testable without
 * a running engine.
 *
 * ### Why hold-only when focus is null or unresolved?
 *
 * Some beats are narration beats (no focus target). Others have a focus that
 * could not be resolved at play time (structure not yet loaded). In both cases
 * there is no target pose to fly to, so the clip simply holds for the fly
 * duration and lets the dwell phase carry the beat. The tour does not skip or
 * error — it pauses gracefully.
 */

import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { ResolvedFocus } from '../../@types/animation/tour/ResolvedFocus';
import type { ClipData } from '../../@types/animation/ClipData';
import { all, dollyTo, hold, moveTarget } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds. */
const FLY_SEC = 5;

export function flyToClip(beat: BeatData, resolved: ResolvedFocus | null): ClipData {
  if (beat.focus === null || resolved === null) {
    // Narration beat or unresolved focus — hold camera in place for the fly duration.
    return { start: 'live', timeline: [hold(FLY_SEC)] };
  }

  // Pan the orbit target and dolly to the focus distance concurrently. The two
  // arms write distinct channels (`target` and `distance`), so the `all` has no
  // single-writer conflict.
  return {
    start: 'live',
    timeline: [
      all([
        moveTarget(resolved.worldPos, FLY_SEC, 'inOut'),
        dollyTo(resolved.focusMpc, FLY_SEC, 'inOut'),
      ]),
    ],
  };
}
