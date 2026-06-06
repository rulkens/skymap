/**
 * VolumeSlice — tone/extent knobs for the density-volume raymarch.
 *
 * `intensity` scales the accumulated density into brightness, `dMax` is the
 * far raymarch distance, and `alpha` shapes the opacity falloff. Separate from
 * the flow params because the volume is an independent layer with its own UI
 * section.
 */
export type VolumeSlice = { readonly intensity: number; readonly dMax: number; readonly alpha: number };
