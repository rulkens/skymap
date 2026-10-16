/**
 * Core's gate for a screen label row that names its `label` entry: skipped while no item of
 * the entry is live, else called with the entry's handed value as its third argument. The
 * held target already folds switch, present and `of`, so the skip reads nothing else.
 */

import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import { labelLiveOf } from '../presentation/labelLiveOf';
import { resolveFadeValue } from '../presentation/resolveFadeValue';

const SKIPPED = { labels: [], awake: false } as const;

export function gateLabelProducer(row: Omit<LayerScreenLabel, 'slab'>): Label2DProducer {
  const { id, label } = row;
  if (label === undefined) return row;
  return {
    id,
    produceLabels: (state, ctx) =>
      labelLiveOf(state, label, ctx.snapshot.nowMs)
        ? row.produceLabels(state, ctx, resolveFadeValue(state, ctx.snapshot, `label:${label}`))
        : SKIPPED,
  };
}
