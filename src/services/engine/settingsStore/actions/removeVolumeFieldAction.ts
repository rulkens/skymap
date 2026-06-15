/**
 * removeVolumeFieldAction — the imperative bridge for dropping a volume field's
 * settings row.
 *
 * Runs the pure `removeVolumeField` reducer through `store.setState`. The GPU
 * teardown (`volumeFieldRenderer.unload`) stays in the handle setter
 * alongside this action — that's a render side-effect, not a settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import type { VolumeFieldId } from '../../../../@types/data/volume/VolumeFieldId';
import { removeVolumeField } from '../reducers/removeVolumeField';

export function removeVolumeFieldAction(store: SettingsStore, id: VolumeFieldId): void {
  store.setState((s) => removeVolumeField(s, id));
}
