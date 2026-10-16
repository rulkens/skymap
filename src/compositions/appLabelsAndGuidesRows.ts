/**
 * The composed Layers' Labels & Guides rows, built once: the settings panel and the dome remote
 * both pass this array to `selectToggleRows`, whose one-slot memo keys on it by identity.
 */

import { APP_COMPOSITION } from './app';
import { layerUiContents } from '../utils/layer/layerUiContents';

export const APP_LABELS_AND_GUIDES_ROWS = layerUiContents(
  APP_COMPOSITION.layers,
  'labelsAndGuides',
);
