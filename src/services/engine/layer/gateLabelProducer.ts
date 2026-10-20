/**
 * Core's gate for a screen label row that names its `label` entry: skipped unless some item
 * of the entry is both live (raw fade) and in band, else called with the entry's handed
 * value as its third argument. The held target already folds switch, present and `of`.
 */

import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import { labelLiveOf } from '../presentation/labelLiveOf';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';

const SKIPPED = { labels: [], awake: false } as const;

export function gateLabelProducer(row: Omit<LayerScreenLabel, 'slab'>): Label2DProducer {
  const { id, label } = row;
  if (label === undefined) return row;
  return {
    id,
    label,
    produceLabels: (state, ctx) =>
      labelLiveOf(state, label, ctx)
        ? row.produceLabels(state, ctx, resolveViewFadeValue(state, ctx, `label:${label}`))
        : SKIPPED,
  };
}
