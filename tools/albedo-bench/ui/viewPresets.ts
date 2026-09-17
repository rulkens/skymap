/**
 * viewPresets — the navigator's box math and preset locations. `ViewState`
 * is lon/lat/span rather than a `LonLatBounds` directly: it is what the
 * inputs edit, and `boxFromView` is the one place that turns it into a box.
 */
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

export type ViewState = { readonly lon: number; readonly lat: number; readonly spanDeg: number };

export type ViewPreset = ViewState & { readonly label: string };

export const VIEW_PRESETS: readonly ViewPreset[] = [
  { label: 'Gale', lon: 137.4, lat: -4.6, spanDeg: 2 },
  { label: 'South polar cap edge', lon: 0, lat: -78, spanDeg: 4 },
  // No specific seam is known ahead of time — design §11's eye check finds
  // one; this is a starting point to retarget from, not a real seam.
  { label: 'Viking seam (retarget me)', lon: 0, lat: 0, spanDeg: 2 },
];

export function boxFromView(view: ViewState): LonLatBounds {
  const half = view.spanDeg / 2;
  return {
    west: Math.max(-180, view.lon - half),
    east: Math.min(180, view.lon + half),
    south: Math.max(-90, view.lat - half),
    north: Math.min(90, view.lat + half),
  };
}
