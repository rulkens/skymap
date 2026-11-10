/**
 * findHiiSegment — a tier's span in the packed `hiiSegments` (`first`/`count`
 * in RECORDS), or `undefined` when it has none or an empty one. `planFieldFrame`
 * uses it to decide which tiers encode; the renderer uses it only for the
 * instance range.
 */
import type { HiiSegment } from '../@types/HiiSegment';

export function findHiiSegment(
  segments: readonly HiiSegment[],
  label: string,
): HiiSegment | undefined {
  return segments.find((s) => s.label === label && s.count > 0);
}
