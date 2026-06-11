/**
 * addVolumeFieldAction — the imperative bridge for ensuring a volume field's
 * settings row exists.
 *
 * Runs the pure `addVolumeField` reducer through `store.setState`. Re-adding an
 * existing field is an identity no-op (the reducer returns the input state), so
 * tuned values survive an off-then-on of a cube. The GPU upload + conditional
 * fade stay in the handle setter alongside this action.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { VolumeFieldId } from '../../../../@types/data/VolumeFieldId';
import { addVolumeField } from '../reducers/addVolumeField';

export function addVolumeFieldAction(store: SettingsStore, id: VolumeFieldId): void {
  store.setState((s) => addVolumeField(s, id));
}
