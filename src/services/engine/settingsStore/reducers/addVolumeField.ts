/**
 * addVolumeField — pure reducer that ensures a settings row exists for a
 * volume field, seeding it from registry defaults if absent.
 *
 * Re-registering a field PRESERVES its tuned values: when a row already exists
 * (the common case — shippable volumes are seeded at construction), this is an
 * identity no-op and returns the input state unchanged, so off-then-on a cube
 * doesn't reset its sliders. Only a brand-new dynamically-added handle seeds a
 * fresh row from `buildVolumeFieldSettings`.
 *
 * The GPU upload (`scalarVolumeRenderer.addField`) and the conditional fade stay
 * in the handle setter — those are renderer side-effects, not settings writes;
 * only the row-seeding moves here so React's per-field rows selector wakes on a
 * genuinely-new field.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `volumes` object carrying a new `items` Record; the sibling `enabled` leaf is
 * preserved by spreading `state.volumes`.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import { buildVolumeFieldSettings } from '../../../../data/volumeFieldDefaults';

export function addVolumeField(state: EngineSettingsState, id: VolumeFieldId): EngineSettingsState {
  if (state.volumes.items[id]) return state;
  return {
    ...state,
    volumes: {
      ...state.volumes,
      items: { ...state.volumes.items, [id]: buildVolumeFieldSettings(id) },
    },
  };
}
