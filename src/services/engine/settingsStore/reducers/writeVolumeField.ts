/**
 * writeVolumeField — pure reducer for an in-place patch to one scalar-volume
 * field's settings row (enabled / intensity / contrast / densityScale / trim /
 * exposure / palette).
 *
 * Wraps the existing copy-on-write helper `writeVolumeFieldSetting` — the single
 * write-path for `state.settings.volumes.items` — rather than re-implementing
 * the per-field spread. The helper returns a NEW items Record with the patched
 * row, or `null` when the id has no row (an unknown / unregistered field). A
 * `null` is a silent no-op here: the reducer returns the input state UNCHANGED
 * (same reference), so the action's `setState` lands an identity write and no
 * subscriber wakes. That matches the old bespoke setters' `if (!next) return`
 * guard.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `volumes` object carrying the new `items` Record; the sibling `enabled` leaf
 * is preserved by spreading `state.volumes`. The clamp of raw intent (e.g.
 * `clampVolumeIntensity`) stays in the handle setter — this reducer stores the
 * value it's handed, symmetric with the other settings reducers.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../@types/settings/VolumeFieldSettings';
import { writeVolumeFieldSetting } from '../../helpers/writeVolumeFieldSetting';

export function writeVolumeField(
  state: EngineSettingsState,
  id: VolumeFieldId,
  patch: Partial<VolumeFieldSettings>,
): EngineSettingsState {
  const nextItems = writeVolumeFieldSetting(state.volumes.items, id, patch);
  if (!nextItems) return state;
  return { ...state, volumes: { ...state.volumes, items: nextItems } };
}
