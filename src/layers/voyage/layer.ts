/**
 * The voyage Layer: a 1 g ship's frame as the scene's observer. Its `voyage` cluster is the
 * Intent (trip, launch instant, toggles, speed); `boost` turns it into the frame's `FrameBoost`,
 * which core folds into every slab; the exhibits ride a trip, and the debug section drives the
 * same Intent by hand.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { voyageFrameBoost } from '../../utils/voyage/voyageFrameBoost';
import { voyageLayerSettings } from './state/slices';
import { create } from './create';
import { destroy } from './destroy';
import { voyageExhibits } from './exhibits/voyageExhibits';
import VoyageTuningSectionContainer from './ui/VoyageTuningSectionContainer';

export const voyageLayer = defineLayer({
  name: 'voyage',
  settings: voyageLayerSettings,
  boost: (settings, simDays) => voyageFrameBoost(settings.voyage, simDays),
  exhibits: voyageExhibits,
  create,
  destroy,
  passes: () => [],
  ui: [{ slot: 'debug', content: VoyageTuningSectionContainer }],
});
