/**
 * runLabel3DProducers — concatenate Label3D descriptors in producer order,
 * flush them to `label3DRenderer`, and fold `awake` across producers. Mirrors
 * `runMarkerProducers`'s walk; no sort/filter/dedupe.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Label3D } from '../../../@types/rendering/Label3D';
import { LABEL_3D_PRODUCERS } from '../presentation/label3DProducers';

export function runLabel3DProducers(state: EngineState, ctx: ReadyFrameContext): boolean {
  const labels: Label3D[] = [];
  let awake = false;
  for (const producer of LABEL_3D_PRODUCERS) {
    const output = producer.produceLabels3D(state, ctx);
    labels.push(...output.labels);
    awake = awake || output.awake;
  }
  state.gpu.label3DRenderer?.setLabels(labels);
  return awake;
}
