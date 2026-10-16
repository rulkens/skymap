/** `gateLabelProducer`'s rule over a world label row: skipped while no item of its `label`
 * entry is live, else called with the entry's handed value as its third argument. */

import type { LayerWorldLabel } from '../../../@types/engine/layer/LayerWorldLabel';
import type { Label3DProducer } from '../../../@types/engine/subsystems/Label3DProducer';
import { labelLiveOf } from '../presentation/labelLiveOf';
import { resolveFadeValue } from '../presentation/resolveFadeValue';

const SKIPPED = { labels: [], awake: false } as const;

export function gateWorldLabelProducer(row: LayerWorldLabel): Label3DProducer {
  const { id, label } = row;
  if (label === undefined) return row;
  return {
    id,
    produceLabels3D: (state, ctx) =>
      labelLiveOf(state, label, ctx.snapshot.nowMs)
        ? row.produceLabels3D(state, ctx, resolveFadeValue(state, ctx.snapshot, `label:${label}`))
        : SKIPPED,
  };
}
