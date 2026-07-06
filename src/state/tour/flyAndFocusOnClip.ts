/**
 * flyAndFocusOnClip — builds an establishing-move clip that flies the camera
 * to a target AND sets the selection focus, both addressed by a durable `FocusId`.
 *
 * A thin `ClipData` wrapper over the `focusOnId` composite — the clip-land
 * equivalent of `requestFocus`. The focus cue fires at beat start (so the UI
 * isolation lands while the approach is still in progress), then the camera
 * glides to the id's framing. Use `flyToClip` when the beat should move the
 * camera WITHOUT changing what is focused.
 *
 * ### Why FocusId rather than a pre-resolved ref?
 *
 * Clip builders run at module-load time, before any catalog is available.
 * `resolveClipFoci` rewrites the id-bearing arms to concrete values at play
 * time. This keeps the builder pure and testable without a running engine.
 */

import type { ClipData } from '../../@types/animation/ClipData';
import type { FocusId } from '../../@types/animation/FocusId';
import { focusOnId } from '../../services/engine/animation/effectHelpers';

/** Duration of the establishing move in seconds. Kept in sync with flyToClip. */
const FLY_SEC = 5;

export function flyAndFocusOnClip(id: FocusId): ClipData {
  return {
    start: 'live',
    timeline: [focusOnId(id, FLY_SEC)],
  };
}
