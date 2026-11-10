import type { FieldFramePlan } from '../../@types/FieldFramePlan';
import type { HiiSegment } from '../../starFormation/@types/HiiSegment';

import { FIELD_TARGET_IDS } from '../../data/fieldTargetIds';
import { findHiiSegment } from '../../starFormation/utils/findHiiSegment';

/**
 * The only gating of field passes: the dust map and the field always encode,
 * every HII id iff its `hii:${id}` segment has components. Pure, so the
 * caller computes it once per frame and hands the same value to the encode
 * and the composite.
 */
export function planFieldFrame(segments: readonly HiiSegment[]): FieldFramePlan {
  const encodes = FIELD_TARGET_IDS.filter(
    (id) => id === 'dustMap' || id === 'field' || findHiiSegment(segments, `hii:${id}`),
  );
  return { encodes, composites: encodes.filter((id) => id !== 'dustMap') };
}
