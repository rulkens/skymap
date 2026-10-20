/** `gateLabelProducer`'s rule over a world label row: skipped unless some item of its
 * `label` entry is both live (raw fade) and in band, else called with the entry's handed value. */

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
