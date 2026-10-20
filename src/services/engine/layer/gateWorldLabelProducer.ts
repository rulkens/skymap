/** `gateLabelProducer`'s rule over a world label row: skipped while no item of its `label`
 * entry is live or every item's band is 0, else called with the entry's handed value. */

import type { LayerWorldLabel } from '../../../@types/engine/layer/LayerWorldLabel';
import type { Label3DProducer } from '../../../@types/engine/subsystems/Label3DProducer';
import { labelLiveOf } from '../presentation/labelLiveOf';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';

const SKIPPED = { labels: [], awake: false } as const;

export function gateWorldLabelProducer(row: LayerWorldLabel): Label3DProducer {
  const { id, label } = row;
  if (label === undefined) return row;
  return {
    id,
    label,
    produceLabels3D: (state, ctx) =>
      labelLiveOf(state, label, ctx)
        ? row.produceLabels3D(state, ctx, resolveViewFadeValue(state, ctx, `label:${label}`))
        : SKIPPED,
  };
}
