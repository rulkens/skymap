/**
 * runMarkerProducers — concatenate marker descriptors in producer order.
 * LANDMINE: walker must not sort, filter, or dedupe — pick-index alignment
 * depends on `structureStore.all()` order per category (resolves via
 * `@builtin(instance_index)` through `byCategory(cat)[structureIndex]`).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { StructureMarkerDescriptor } from '../../../@types/rendering/StructureMarkerDescriptor';
import { MARKER_PRODUCERS } from '../presentation/markerProducers';

export function runMarkerProducers(
  state: PassState,
  ctx: FrameView,
): readonly StructureMarkerDescriptor[] {
  const out: StructureMarkerDescriptor[] = [];
  for (const producer of MARKER_PRODUCERS) {
    const descriptors = producer.produceMarkers(state, ctx);
    for (const d of descriptors) out.push(d);
  }
  return out;
}
