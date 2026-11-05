import type { Layer } from '../../@types/engine/layer/Layer';
import type { LayerUiSlots } from '../../@types/engine/layer/LayerUiSlots';
import { layerUiEntries } from './layerUiEntries';

/** Every composed Layer's contribution to one `LayerUiSlots` slot, in layer
 * then entry order — the order `SettingsPanel`/`DebugPanel`/`LabelsAndGuidesSectionContainer` render. */
export function layerUiContents<K extends keyof LayerUiSlots>(
  layers: readonly Layer<string, unknown>[],
  slot: K,
): readonly LayerUiSlots[K][] {
  return layerUiEntries(layers, slot).map((entry) => entry.content as LayerUiSlots[K]);
}
