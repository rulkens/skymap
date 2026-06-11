/**
 * writeVolumeFieldAction — the imperative bridge for an in-place patch to one
 * volume field's settings row.
 *
 * Runs the pure `writeVolumeField` reducer through `store.setState`. The reducer
 * returns the input state unchanged for an unknown id (the helper's `null`
 * no-op), so an unregistered field id lands an identity write and wakes nobody —
 * matching the old bespoke setters' `if (!next) return` guard.
 *
 * The per-field render side-effects (`fadeTo`, `requestRender`, the debug-volume
 * lazy-load) stay in the handle setters alongside this action — they're render
 * concerns, not settings writes. The clamp of raw intent also stays at the
 * handle (the caller passes an already-clamped value).
 */

import type { SettingsStore } from '../createSettingsStore';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';
import { writeVolumeField } from '../reducers/writeVolumeField';

export function writeVolumeFieldAction(
  store: SettingsStore,
  id: VolumeFieldId,
  patch: Partial<VolumeFieldSettings>,
): void {
  store.setState((s) => writeVolumeField(s, id, patch));
}
