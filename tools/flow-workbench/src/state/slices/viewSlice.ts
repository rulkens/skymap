/**
 * viewSlice — default layer toggles + the immutable layer-flip reducer.
 *
 * Flow field on, density volume off by default: the flow is the headline
 * visualization; the volume is an optional overlay. `toggleLayer` returns a new
 * slice with one boolean flipped via a computed-key spread, leaving `prev`
 * untouched so the store's reference-equality gate sees a fresh object.
 */
import type { ViewSlice } from '../../../@types/state/slices/ViewSlice';

export const defaultViewSlice: ViewSlice = { flowField: true, densityVolume: false };

export function toggleLayer(prev: ViewSlice, layer: 'flowField' | 'densityVolume'): ViewSlice {
  return { ...prev, [layer]: !prev[layer] };
}
