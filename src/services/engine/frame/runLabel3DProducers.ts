/**
 * runLabel3DProducers — concatenate Label3D descriptors in producer order,
 * flush them to `label3DRenderer`, and fold `awake` across producers. Walks
 * `state.label3DProducers` (core + every Layer's, composed by `createLayers`).
 * Concatenates only: no sort, filter or dedupe. A producer naming its `label`
 * entry recedes by that entry alone: a `Label3D` names no subject to exempt.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Label3D } from '../../../@types/rendering/Label3D';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../presentation/emphasisOf';

export function runLabel3DProducers(state: EngineState, ctx: FrameView): boolean {
  const labels: Label3D[] = [];
  let awake = false;
  for (const producer of state.label3DProducers) {
    const output = producer.produceLabels3D(state, ctx);
    // At blend 0 every emphasis is exactly 1, so the resting frame skips the lookup.
    const emphasis =
      producer.label === undefined || ctx.snapshot.focusBlend === 0
        ? 1
        : emphasisOf(
            visibilityEntryOf(state.visibilityEntries, `label:${producer.label}`),
            ctx.snapshot,
          );
    for (const l of output.labels) {
      labels.push(emphasis === 1 ? l : { ...l, fadeAlpha: (l.fadeAlpha ?? 1) * emphasis });
    }
    awake = awake || output.awake;
  }
  state.gpu.label3DRenderer?.setLabels(labels);
  return awake;
}
