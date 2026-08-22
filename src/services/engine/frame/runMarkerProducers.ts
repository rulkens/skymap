/**
 * runMarkerProducers — concatenate marker descriptors in producer order.
 * LANDMINE: walker must not sort, filter, or dedupe — pick-index alignment
 * depends on `structureStore.all()` order per category (resolves via
 * `@builtin(instance_index)` through `byCategory(cat)[structureIndex]`).
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
    for (const d of descriptors) out.push(d);
  }
  return out;
}
