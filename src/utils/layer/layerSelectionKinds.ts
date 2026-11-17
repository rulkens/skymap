import type { Layer } from '../../@types/engine/layer/Layer';
import type { SelectionKindFacts } from '../../@types/engine/layer/SelectionKindFacts';

/** Every composed Layer's static selection kinds, in layer then declaration order. */
export function layerSelectionKinds(
  layers: readonly Layer<string, unknown>[],
): readonly SelectionKindFacts[] {
  return layers.flatMap((layer) => layer.selection?.kinds ?? []);
}
