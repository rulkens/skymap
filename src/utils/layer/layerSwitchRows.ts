import type { Layer } from '../../@types/engine/layer/Layer';
import type { LayerToggleRow } from '../../@types/engine/layer/LayerToggleRow';
import type { LayerUiEntry } from '../../@types/engine/layer/LayerUiEntry';
import type { ShowKey } from '../../@types/animation/ShowKey';

/** One switch per Layer with a `main` settings section, in layer order, titled by that section:
 * the Layer's one show entry that is not already a Labels & Guides row. Two such entries would
 * leave the row to a guess, so it throws instead, as does none. */
export function layerSwitchRows(
  layers: readonly Pick<Layer<string, unknown>, 'name' | 'ui' | 'visibility'>[],
): readonly LayerToggleRow[] {
  return layers.flatMap((layer) => {
    const main = layer.ui?.find(
      (entry): entry is Extract<LayerUiEntry, { slot: 'main' }> => entry.slot === 'main',
    );
    if (main === undefined) return [];
    const guides: readonly string[] = layer.ui!.flatMap((entry) =>
      entry.slot === 'labelsAndGuides' ? [entry.content.toggle] : [],
    );
    const keys = (layer.visibility ?? []).flatMap((entry) =>
      'key' in entry && !guides.includes(entry.key) ? [entry.key] : [],
    );
    if (keys.length !== 1) {
      throw new Error(
        `${layer.name}: a Layers row needs one show entry to switch, found ${keys.length}`,
      );
    }
    // The composition's keys are the `ShowKey` union, which `appVisibility.ts` derives from the same entries.
    return [{ toggle: keys[0] as ShowKey, label: main.title }];
  });
}
