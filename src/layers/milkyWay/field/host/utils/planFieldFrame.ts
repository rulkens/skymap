import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { FieldTargetId } from '../../@types/FieldTargetId';
import type { HiiSegment } from '../../starFormation/@types/HiiSegment';

import { findHiiSegment } from '../../starFormation/utils/findHiiSegment';

/**
 * The only gating of field passes, over the targets the host was given (in
 * `FIELD_TARGET_IDS` order): the dust map and the field always encode, every
 * HII id iff its `hii:${id}` segment has components. Pure, so the caller
 * computes it once per frame and hands the same value to the encode and the
 * composite.
 */
export function planFieldFrame(
  segments: readonly HiiSegment[],
  targetIds: readonly FieldTargetId[],
): FieldFramePlan {
  const encodes = targetIds.filter(
    (id) => id === 'dustMap' || id === 'field' || findHiiSegment(segments, `hii:${id}`),
  );
  return { encodes, composites: encodes.filter((id) => id !== 'dustMap') };
}
