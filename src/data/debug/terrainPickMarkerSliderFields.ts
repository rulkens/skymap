/**
 * The terrain-pick marker's radius knob. The marker is a GAUGE: a sphere of
 * KNOWN physical size, read against how much of it the terrain buries. The
 * error it measures spans sub-metre (z19) to tens of metres (z14), so the
 * slider is logarithmic — its position is log10(metres), which is why the
 * field's key, range and `format` all speak decades rather than metres.
 */

import type { SliderField } from '../../@types/data/SliderField';

/** Metres. Two-ish metres reads as a human-scale ball at walking altitude and
 *  is still a visible dot from a few km up. */
export const TERRAIN_PICK_MARKER_DEFAULT_RADIUS_M = 2;

/** 5 cm — below the sub-metre floor of the measured CPU/GPU height gap. */
const MIN_RADIUS_M = 0.05;
/** 1 km — above the ~10 m gap at z14, with room for a coarser body. */
const MAX_RADIUS_M = 1000;
/** ~2.3 % per notch: fine enough to bracket a reading, coarse enough to drag
 *  the whole four decades in one sweep. */
const STEP_DECADES = 0.01;

/** Metres at a human-readable precision: sub-metre radii need the decimals the
 *  gap itself is measured in, kilometre-scale ones do not. */
function formatRadiusM(radiusM: number): string {
  if (radiusM < 1) return `${radiusM.toFixed(3)} m`;
  if (radiusM < 100) return `${radiusM.toFixed(2)} m`;
  return `${radiusM.toFixed(0)} m`;
}

export const TERRAIN_PICK_MARKER_SLIDER_FIELDS: readonly SliderField<'radiusLog10M'>[] = [
  {
    key: 'radiusLog10M',
    label: 'radius',
    min: Math.log10(MIN_RADIUS_M),
    max: Math.log10(MAX_RADIUS_M),
    step: STEP_DECADES,
    format: (log10M) => formatRadiusM(10 ** log10M),
    title:
      'Marker sphere radius in WORLD metres (log scale, 0.05 m – 1 km). The buried fraction of a sphere this size is the height error.',
  },
];
