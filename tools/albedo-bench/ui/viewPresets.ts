/**
 * viewPresets — the navigator's box math, zoom bounds, and preset
 * locations. `ViewState` is lon/lat/span rather than a `LonLatBounds`
 * directly: it is what the inputs (and the wheel/drag gesture) edit, and
 * `boxFromView` is the one place that turns it into a box.
 */
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

export type ViewState = { readonly lon: number; readonly lat: number; readonly spanDeg: number };

export type ViewPreset = ViewState & { readonly label: string };

// 360 recentred at lon 0 clamps to exactly the full globe (see boxFromView);
// off-centre it under-covers longitude by the wrap this plain box can't
// express — acceptable per the box-clamp rule below.
export const MIN_SPAN_DEG = 0.2;
export const MAX_SPAN_DEG = 360;

export const VIEW_PRESETS: readonly ViewPreset[] = [
  { label: 'Gale', lon: 137.4, lat: -4.6, spanDeg: 2 },
  { label: 'South polar cap edge', lon: 0, lat: -78, spanDeg: 4 },
  { label: 'Whole planet', lon: 0, lat: 0, spanDeg: MAX_SPAN_DEG },
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

// The pan gesture lets lon run past ±180 so dragging across the antimeridian
// stays continuous; this folds it back for display and for boxFromView.
export function wrapLon(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

export function clampLat(latDeg: number): number {
  return Math.min(90, Math.max(-90, latDeg));
}
