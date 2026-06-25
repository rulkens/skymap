/**
 * flyAndFocusOnClip — builds an establishing-move clip that flies the camera
 * to a target AND sets the selection focus, both addressed by a durable `FocusId`.
 *
 * ### How this differs from flyToClip
 *
 * `flyToClip` moves the camera only — no selection change. This builder prepends
 * a `focus(id)` cue to the same camera timeline, so the UI isolation (InfoCard,
 * highlight ring) fires at the moment playback begins rather than after the fly.
 * Use this when the tour beat is about a specific galaxy or structure that the
 * viewer should be able to identify on-screen during the approach.
 *
 * ### Ordering: focus cue fires first
 *
 * The `timeline` is a sequential list: the `focus(id)` cue is a one-shot
 * scene-effect that fires instantly (no duration), then the `all([...])` block
 * runs. Setting focus before the camera arrives lets the InfoCard appear as the
 * pan begins, giving the viewer context while the approach is still in progress.
 *
 * ### Why FocusId rather than a pre-resolved ref?
 *
 * Same rationale as `flyToClip`: clip builders run at module-load time, before
 * any catalog is available. `resolveClipFoci` rewrites `focusId` cues to concrete
 * `SelectionRef` arms at play time. This keeps the builder pure and testable
 * without a running engine.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { FocusId } from '../../@types/animation/FocusId';
import { all, moveTargetId, dollyToId, focus } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds. Kept in sync with flyToClip. */
const FLY_SEC = 5;

export function flyAndFocusOnClip(id: FocusId): ClipData {
  // The focus cue fires instantly at beat start; then the camera moves.
  // resolveClipFoci will rewrite both the focusId cue and the moveTargetId /
  // dollyToId arms to concrete values before compileClip runs.
  return {
    start: 'live',
    timeline: [
      focus(id),
      all([moveTargetId(id, FLY_SEC, 'inOut'), dollyToId(id, FLY_SEC, 'inOut')]),
    ],
  };
}
