import type { Layer } from '../../@types/engine/layer/Layer';
import type { LayerUiEntry } from '../../@types/engine/layer/LayerUiEntry';
import type { LayerUiSlots } from '../../@types/engine/layer/LayerUiSlots';

/** Every composed Layer's entries for one `LayerUiSlots` slot, in layer then entry order: the
 * whole entry, for a caller that needs more than its `content` (a `main` section's `title`). */
export function layerUiEntries<K extends keyof LayerUiSlots>(
  layers: readonly Layer<string, unknown>[],
  slot: K,
): readonly Extract<LayerUiEntry, { slot: K }>[] {
  return layers.flatMap(
    (layer) =>
      layer.ui?.filter(
        (entry): entry is Extract<LayerUiEntry, { slot: K }> => entry.slot === slot,
      ) ?? [],
  );
}
