/**
 * The composed Layers' rows on the remote's Layers sheet, one per `main` settings section,
 * built once and passed to `selectLayerSwitchRows`.
 */

import { APP_COMPOSITION } from './app';
import { layerSwitchRows } from '../utils/layer/layerSwitchRows';

export const APP_LAYER_SWITCH_ROWS = layerSwitchRows(APP_COMPOSITION.layers);
