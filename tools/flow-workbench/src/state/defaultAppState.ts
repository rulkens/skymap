/**
 * defaultAppState — the initial root state the store is seeded with.
 *
 * Assembles the per-slice defaults into one AppState. Keeping the composition
 * here (rather than inline at the createStore call site) means every slice's
 * default lives next to its reducer and there is exactly one place that knows
 * the full initial shape.
 */
import type { AppState } from '../../@types/state/AppState';
import { defaultViewSlice } from './slices/viewSlice';
import { defaultCameraSlice } from './slices/cameraSlice';
import { defaultFlowSlice } from './slices/flowSlice';
import { defaultVolumeSlice } from './slices/volumeSlice';
import { defaultLabelsSlice } from './slices/labelsSlice';

export const defaultAppState: AppState = {
  view: defaultViewSlice,
  camera: defaultCameraSlice,
  flow: defaultFlowSlice,
  volume: defaultVolumeSlice,
  labels: defaultLabelsSlice,
};
