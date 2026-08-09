/**
 * hiiTexSegments — the HII segments `hiiTex`'s own pass(es) still draw, now
 * that DIG has its own target: every `model.hiiSegments` entry except
 * `hii:dig`, `count > 0` only (a zero-count draw call is a wasted API round
 * trip, and `firstInstance` on it points at a range no shader ever reads).
 * Pulled out of `drawFrame`'s HII block because BOTH the merged single-pass
 * loop and the timing-split sub-pass loop need the exact same filter, and a
 * copy in each would be the copy that drifts the next time `hiiRegions.ts`
 * adds a segment.
 */
import type { HiiSegment } from '../../../@types/engine/HiiSegment';

export function hiiTexSegments(segments: readonly HiiSegment[]): readonly HiiSegment[] {
  return segments.filter((s) => s.label !== 'hii:dig' && s.count > 0);
}
