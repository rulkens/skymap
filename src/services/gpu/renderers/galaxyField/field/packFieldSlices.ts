/**
 * packFieldSlices — `fieldComps`' whole contents: the central galaxy's
 * emission mixture, then every extra's (already in world space), then the
 * central galaxy's dust RESERVATION — a zero block (amplitude 0 draws nothing)
 * that the `place:dust` stage fills in a LATER, separate GPU pass; this pack's
 * own job is sizing it. Dust trails every emission component (never
 * interleaved) so `dustOffset == counts.emission` holds with no bookkeeping
 * pass of its own — see io.wesl's layout comment.
 */

import type { FieldSliceCounts } from '../../../../../@types/galaxy/FieldSliceCounts';
import type { GalaxyFieldComponent } from '../../../../../@types/galaxy/GalaxyFieldComponent';
import { FIELD_COMPONENT_FLOATS, packFieldComponents } from './packFieldUniforms';

export function packFieldSlices(
  primary: readonly GalaxyFieldComponent[],
  extras: readonly (readonly GalaxyFieldComponent[])[],
  dustCount: number,
): { packed: Float32Array; counts: FieldSliceCounts } {
  const emission: GalaxyFieldComponent[] = [...primary];
  for (const extra of extras) emission.push(...extra);
  const counts: FieldSliceCounts = {
    emission: emission.length,
    primary: primary.length,
    dust: dustCount,
  };
  const packedEmission = packFieldComponents(emission);
  if (dustCount <= 0) return { packed: packedEmission, counts };
  const packed = new Float32Array(packedEmission.length + dustCount * FIELD_COMPONENT_FLOATS);
  packed.set(packedEmission, 0);
  return { packed, counts };
}
