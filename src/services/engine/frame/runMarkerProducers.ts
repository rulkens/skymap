/**
 * runMarkerProducers — walk the marker producer array and concatenate outputs.
 *
 * Each producer emits descriptors in a fixed order (determined by the source
 * data — `structureStore.all()` for structure markers). This walker preserves
 * that order exactly — NO sort, NO filter, NO dedupe. Pick-index alignment
 * depends on it: `@builtin(instance_index)` resolves through
 * `byCategory(cat)[structureIndex]`, so descriptor order must stay locked to
 * `structureStore.all()` order per category. A second producer joining this
 * array must answer the alignment question before its outputs can merge.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { StructureMarkerDescriptor } from '../../../@types/rendering/StructureMarkerDescriptor';
import { MARKER_PRODUCERS } from '../presentation/markerProducers';

export function runMarkerProducers(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly StructureMarkerDescriptor[] {
  const out: StructureMarkerDescriptor[] = [];
  for (const producer of MARKER_PRODUCERS) {
    const descriptors = producer.produceMarkers(state, ctx);
    out.push(...descriptors);
  }
  return out;
}
