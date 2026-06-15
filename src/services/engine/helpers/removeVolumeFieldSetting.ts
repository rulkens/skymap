/**
 * removeVolumeFieldSetting — the copy-on-write counterpart to
 * `writeVolumeFieldSetting`.
 *
 * Returns a NEW fields map with the named id's row removed, never mutating
 * the input.  Deleting directly from the original would be a shared-reference
 * bug if the caller kept any alias to the old map; the spread-then-delete
 * pattern here is the safe path.  Removing an absent id is a harmless no-op
 * (the spread still produces a fresh object, satisfying any identity check
 * the caller uses to detect a state change).
 */

import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

export function removeVolumeFieldSetting(
  fields: Partial<Record<VolumeFieldId, VolumeFieldSettings>>,
  id: VolumeFieldId,
): Partial<Record<VolumeFieldId, VolumeFieldSettings>> {
  const next = { ...fields };
  delete next[id];
  return next;
}
