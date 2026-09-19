/**
 * The Local Bubble Layer: an additive Fresnel shell over the baked cavity
 * mesh — one renderer, one asset slot, one pass, one fade row, one settings
 * section. `ui` follows in Task 8.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { localBubbleLayerSettings } from './settings/localBubbleLayerSettings';
import { create } from './create';
import { destroy } from './destroy';
import { localBubbleAssetRows } from './load/localBubbleAssetRows';
import { localBubblePass } from './passes/localBubblePass';
import { localBubbleFadeRows } from './present/localBubbleFadeRows';

export const localBubbleLayer = defineLayer({
  name: 'localBubble',
  // A fragment listed here may not also sit in `UNFORMED_SETTINGS_FRAGMENTS`:
  // the reducer-key uniqueness assert throws at import (Ruling 15).
  settings: localBubbleLayerSettings,
  create,
  destroy,
  passes: (runtime) => [localBubblePass(runtime)],
  assets: localBubbleAssetRows,
  fades: localBubbleFadeRows,
});
