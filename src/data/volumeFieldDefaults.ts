/**
 * Per-handle presentation defaults for the dev-only synthetic
 * scalar-volume fixtures (Gaussian / Cartesian / spherical grids).
 *
 * Production volumes (`'cf4-density'`, `'mcpm'`) live on their
 * `SOURCE_REGISTRY` entry — see `sources.ts`. The handles below are
 * minted only in `import.meta.env.DEV` builds and stay out of the
 * production bundle.
 *
 * SCFD v2 is data-only (dims, frame, voxels, dynamic range); how a
 * field should LOOK on first registration — palette + `densityScale` —
 * is presentation. Keeping that in TS rather than the binary header
 * means external producers shipping a fresh handle still render via
 * `FALLBACK_VOLUME_DEFAULTS` until a tuned entry lands here.
 */
import { Source, SOURCE_REGISTRY } from './sources';
import type { VolumeFieldDefaults } from '../@types/data/VolumeFieldDefaults';

/**
 * Sentinel envelope that effectively disables spatial falloff.  The
 * inscribed-sphere radius is 1 (in normalised local space) and the
 * corner radius is √3 ≈ 1.73, so any `inner ≥ √3` keeps the smoothstep
 * pinned at 1.0 throughout the cube.  Equal `inner === outer` makes
 * `smoothstep` degenerate to a step function (which never fires
 * because the input never exceeds the threshold), so the per-step
 * envelope multiplier is exactly 1.0 — visually indistinguishable
 * from no envelope at all, but with zero shader-side branching.
 */
export const NO_SPATIAL_ENVELOPE = { inner: 2.0, outer: 2.0 } as const;

/**
 * Neutral fallback for handles not registered above.  Sequential
 * `viridis` + `densityScale=1.0` gives "visible without surprising
 * assumptions" — good enough to debug a new field before its real
 * defaults are tuned in this file.
 *
 * `viridis` is intentionally not one of the registered handles'
 * defaults, so a visual smell-test ("why is my new field green?") is
 * easy: green means you forgot to register the handle.
 */
export const FALLBACK_VOLUME_DEFAULTS: VolumeFieldDefaults = {
  paletteId: 'viridis',
  // Identity contrast (no deadband) for fields that haven't been
  // tuned yet.  Safer than a higher value because it never hides
  // data the registry author didn't explicitly opt out of.
  contrast: 1.0,
  // 0.5 reproduces the pre-generalisation contrast behaviour exactly
  // (it's the value the shader hardcoded before contrastCenter
  // existed).  At contrast=1.0 the value is irrelevant anyway, so
  // this only matters if a producer hand-bumps contrast on a brand
  // new untuned field.
  contrastCenter: 0.5,
  densityScale: 1.0,
  envelope: NO_SPATIAL_ENVELOPE,
  // 1.0 = pre-HDR behaviour for untuned fields.  Same rationale as
  // contrast=1.0 above: never silently boost a field the registry
  // author hasn't opted into.
  exposure: 1.0,
  // no trim for untuned fields
  trim: 0.0,
};

/**
 * Registered dev-only synthetic fixtures. Keep entries in
 * handle-alphabetical order so diffs stay legible when a new debug
 * field is added. Production volumes live on `SOURCE_REGISTRY` —
 * `getVolumeFieldDefaults` consults the registry before this table.
 */
export const VOLUME_FIELD_DEFAULTS: Record<string, VolumeFieldDefaults> = {
  'debug-gaussian': {
    paletteId: 'blue-purple',
    // Identity contrast — synthetic fixtures don't have a noise
    // floor worth windowing out.
    contrast: 1.0,
    // 0.5 preserves the pre-generalisation behaviour for synthetic
    // fixtures: every value of `contrast` works the same way as
    // before this field was added.  At contrast=1.0 the value is
    // irrelevant anyway (no deadband, no stretch).
    contrastCenter: 0.5,
    // Lifted from syntheticScalarField.ts:makeSyntheticGaussianCube.
    // A single Gaussian peak integrates to roughly √(2π)·σ along its
    // central axis, so 10× lifts the peak into the saturated regime
    // while leaving the intensity slider plenty of low-end headroom.
    densityScale: 10.0,
    // No envelope: the synthetic fixtures exist for axis / scale /
    // origin verification.  Corner visibility is a feature, not a bug.
    envelope: NO_SPATIAL_ENVELOPE,
    exposure: 1.0,
    trim: 0.0,
    label: 'Gaussian (debug)',
  },
  'debug-cartesian': {
    paletteId: 'viridis',
    contrast: 1.0,
    contrastCenter: 0.5,
    // Lifted from syntheticScalarField.ts:makeCartesianGridCube.  A
    // ray crosses ~8 grid planes per axis at default settings, so
    // integrated density is much higher than the single-peak
    // Gaussian — 4× is enough to saturate near intensity=1.0.
    densityScale: 4.0,
    // Grid corners are part of the test; keep them visible.
    envelope: NO_SPATIAL_ENVELOPE,
    exposure: 1.0,
    trim: 0.0,
    label: 'Cartesian grid (debug)',
  },
  'debug-spherical': {
    paletteId: 'magma',
    contrast: 1.0,
    contrastCenter: 0.5,
    // Lifted from syntheticScalarField.ts:makeSphericalGridCube.  A
    // ray typically crosses one or two shells plus a spoke — sits
    // between the Gaussian (sparse) and Cartesian grid (dense) in
    // integrated density, hence 6×.
    densityScale: 6.0,
    // Spherical shells extend to the cube corners; envelope would
    // crop the outermost shell asymmetrically — undesirable for a
    // verification fixture.
    envelope: NO_SPATIAL_ENVELOPE,
    exposure: 1.0,
    trim: 0.0,
    label: 'Spherical grid (debug)',
  },
};

/**
 * Look up presentation defaults for a field handle. Walks production
 * volume entries in `SOURCE_REGISTRY` first, then the dev-only
 * synthetic fixtures, then falls back to `FALLBACK_VOLUME_DEFAULTS`
 * so the renderer keeps rendering something sane if a producer ships
 * a v2 SCFD with a handle we haven't tuned yet.
 */
export function getVolumeFieldDefaults(handle: string): VolumeFieldDefaults {
  for (const code of [Source.Cf4Density, Source.Mcpm]) {
    const entry = SOURCE_REGISTRY[code];
    if (entry.handle === handle) return entry;
  }
  return VOLUME_FIELD_DEFAULTS[handle] ?? FALLBACK_VOLUME_DEFAULTS;
}
