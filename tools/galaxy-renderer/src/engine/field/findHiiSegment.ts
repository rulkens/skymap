/**
 * findHiiSegment — the one lookup `drawFrame`'s per-tier HII passes and the
 * `hii:extras` pass share to find their own span in `model.hiiSegments`
 * (`first`/`count` in RECORDS). Folds "has a span" and "that span is
 * nonempty" into one call, so a tier with no content (or no span at all —
 * DIG off, no extras on screen) reads as a single `undefined` a caller can
 * gate a pass AND its composite push on, rather than a zero-count draw call
 * (a wasted API round trip whose `firstInstance` points at a range no
 * shader ever reads).
 */
import type { HiiSegment } from '../../../@types/engine/HiiSegment';

export function findHiiSegment(
  segments: readonly HiiSegment[],
  label: string,
): HiiSegment | undefined {
  return segments.find((s) => s.label === label && s.count > 0);
}
