/**
 * writeVolumeFieldSetting — the single copy-on-write write-path for one
 * field's settings entry in `state.settings.volumes.items`.
 *
 * Returns a NEW fields map with the patched row so callers can replace
 * `state.settings.volumes.items` with the return value without touching
 * the original object (never mutates input).  Returns `null` when `id`
 * has no row — an unknown or unregistered field id is a silent no-op at
 * the call site, which is the right posture because future tasks may
 * remove a field from the registry while user-initiated setter calls are
 * still in flight.
 *
 * Centralising this removes the seven-fold duplicated `const cur = ...;
 * if (cur) setParams(...)` pattern across the per-field engine setters
 * and gives the immutable update one testable, importable home.
 */

import type { VolumeFieldId } from '../../../@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

export function writeVolumeFieldSetting(
  fields: Partial<Record<VolumeFieldId, VolumeFieldSettings>>,
  id: VolumeFieldId,
  patch: Partial<VolumeFieldSettings>,
): Partial<Record<VolumeFieldId, VolumeFieldSettings>> | null {
  const cur = fields[id];
  if (!cur) return null;
  return { ...fields, [id]: { ...cur, ...patch } };
}
