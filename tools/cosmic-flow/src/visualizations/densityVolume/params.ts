/**
 * Density-volume slider specs — the data-driven UI description for the
 * raymarched overdensity overlay.
 *
 * The spike exposed three volume knobs (intensity, dMax, alpha), but only
 * intensity is worth a live slider: dMax (the density-normalisation ceiling)
 * and alpha (the opacity scale) are tuning constants that, once dialled in to
 * match the field's dynamic range, never need touching at runtime. So they are
 * carried as fixed defaults on VolumeSlice and the panel surfaces a single
 * 'intensity' slider here.
 *
 * The spec id MUST equal a VolumeSlice key: the value the UI produces is
 * written into FrameContext.params under the spec id, and the visualization
 * reads its knobs by that same key. The frame-params record therefore still
 * carries 'intensity', 'dMax', and 'alpha' (the latter two from the slice
 * defaults, not from any slider) — all three ids line up with VolumeSlice.
 */
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';

/** The only live volume control: density intensity (the raymarch gain). */
export const VOLUME_PARAM_SPECS: readonly SliderSpec[] = [
  {
    id: 'intensity',
    label: 'density intensity',
    min: 1,
    max: 40,
    step: 1,
    format: (v) => String(Math.round(v)),
  },
];
