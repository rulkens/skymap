/**
 * flyToClip — builds a camera-only establishing-move clip addressed by a
 * durable `FocusId`.
 *
 * ### Why FocusId rather than a pre-resolved pose?
 *
 * Clip builders run at module-load time, before any galaxy catalog or structure
 * catalog is available. Accepting a `FocusId` — a branded string that identifies
 * a target by a stable key — keeps the builder a pure function over plain data.
 * The engine resolves world positions and focus distances at play time, just
 * before `compileClip` runs, via `resolveClipFoci`. This separates authoring
 * from resolution: clips can be defined statically in tour scripts, while the
 * actual coordinates are looked up from whichever tier is loaded at runtime.
 *
 * ### Why no focus cue here?
 *
 * `flyToClip` is the camera-only variant. It moves the orbit target and adjusts
 * the dolly distance, but does NOT set a selection focus. Use `flyAndFocusOnClip`
 * when you also want to isolate the target galaxy or structure in the UI.
 * Separating the two keeps each builder's effect set minimal and composable.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { FocusId } from '../../@types/animation/FocusId';
import { all, moveTargetId, dollyToId } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds. */
const FLY_SEC = 5;

export function flyToClip(id: FocusId): ClipData {
  // Pan the orbit target and dolly to the focus distance concurrently. The two
  // arms write distinct channels ('target' and 'distance'), so the `all` has no
  // single-writer conflict. Both arms carry the same FocusId; resolveClipFoci
  // will look up the world position (for moveTargetId) and focus distance (for
  // dollyToId) from the catalog at play time.
  return {
    start: 'live',
    timeline: [
      all([
        moveTargetId(id, FLY_SEC, 'easeInOutCubic'),
        dollyToId(id, FLY_SEC, { ease: 'easeInOutCubic' }),
      ]),
    ],
  };
}
