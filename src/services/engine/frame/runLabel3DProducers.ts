/**
 * runLabel3DProducers — concatenate Label3D descriptors in producer order,
 * flush them to `label3DRenderer`, and fold `awake` across producers. Walks
 * `state.label3DProducers` (core + every Layer's, composed by `createLayers`).
 * Mirrors `runMarkerProducers`'s walk; no sort/filter/dedupe.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Label3D } from '../../../@types/rendering/Label3D';

export function runLabel3DProducers(state: EngineState, ctx: FrameView): boolean {
  const labels: Label3D[] = [];
  let awake = false;
  for (const producer of state.label3DProducers) {
    const output = producer.produceLabels3D(state, ctx);
    for (const l of output.labels) labels.push(l);
    awake = awake || output.awake;
  }
  state.gpu.label3DRenderer?.setLabels(labels);
  return awake;
}
