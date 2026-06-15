/**
 * removeVolumeField — pure reducer that drops one volume field's settings row.
 *
 * Wraps the existing copy-on-write helper `removeVolumeFieldSetting` rather than
 * re-implementing the spread-then-delete. The helper always returns a fresh
 * items Record (removing an absent id is a harmless no-op that still produces a
 * new object), so this reducer always lands a new `volumes.items` reference —
 * which is the change React's per-field rows selector observes.
 *
 * The GPU teardown (`volumeFieldRenderer.unload`) stays in the handle
 * setter — that's a renderer side-effect, not a settings write; only the
 * row-removal moves here.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `volumes` object carrying the new `items` Record; the sibling `enabled` leaf
 * is preserved by spreading `state.volumes`.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import { removeVolumeFieldSetting } from '../../helpers/removeVolumeFieldSetting';

export function removeVolumeField(
  state: EngineSettingsState,
  id: VolumeFieldId,
): EngineSettingsState {
  return {
    ...state,
    volumes: { ...state.volumes, items: removeVolumeFieldSetting(state.volumes.items, id) },
  };
}
