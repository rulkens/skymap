/**
 * The Local Bubble Layer: an additive Fresnel shell over the baked cavity
 * mesh — one renderer, one asset slot, one pass, one show entry, a toggle row in
 * "Labels & guides" and a DebugPanel tuning section.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { localBubbleLayerSettings } from './state/slices';
import { localBubbleVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { localBubbleAssetRows } from './load/localBubbleAssetRows';
import { localBubblePass } from './passes/localBubblePass';
import LocalBubbleTuningSectionContainer from './ui/LocalBubbleTuningSectionContainer';

export const localBubbleLayer = defineLayer({
  name: 'localBubble',
  settings: localBubbleLayerSettings,
  visibility: localBubbleVisibility,
  create,
  destroy,
  passes: (runtime) => [localBubblePass(runtime)],
  assets: localBubbleAssetRows,
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'localBubble', label: 'Local Bubble' } },
    { slot: 'debug', content: LocalBubbleTuningSectionContainer },
  ],
});
