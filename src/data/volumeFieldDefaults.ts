/**
 * Per-handle presentation defaults for scalar-volume fields.
 *
 * SCFD v2 is data-only (dims, frame, voxels, dynamic range).  How a
 * field should LOOK on first registration — its palette and
 * `densityScale` — is presentation, not data, and lives here rather
 * than in the binary header.
 *
 * Three alternatives were considered before settling on this registry:
 *
 *   1. **Bake it into the binary** (the v1 design).  Cheap to read at
 *      load time and makes a `.scfd` "self-describing", but bumping
 *      a palette default becomes a binary rebuild + R2 re-sync, and
 *      external producers have to know skymap's palette enum to write
 *      a valid file.  Couples presentation (a UI concern) to data
 *      provenance (a build concern); rejected.
 *
 *   2. **Sidecar JSON** (`cf4_density.scfd.meta.json` etc.).  Decouples
 *      from the binary but introduces a second file per cube, another
 *      fetch, and another versioning surface.  For a domain vocabulary
 *      of ~4 known handles, the overhead doesn't earn its keep.
 *
 *   3. **This TS registry.**  Known field handles are part of skymap's
 *      compile-time vocabulary; tweaking a default is a one-line edit
 *      reviewable in a normal PR.  Unknown handles fall through to
 *      `FALLBACK_VOLUME_DEFAULTS`, so external producers shipping a
 *      v2 SCFD with a fresh handle still render — they just get the
 *      neutral defaults until a tuned entry lands here.
 *
 * The constants below were lifted verbatim from the original baked-in
 * values in `tools/buildCf4Density.ts` (CF4_DENSITY_SCALE = 5.0,
 * DEFAULT_CF4_PALETTE = 'coolwarm') and from the per-generator literals
 * in `src/data/syntheticScalarField.ts` (Gaussian 10.0 + 'blue-purple',
 * Cartesian 4.0 + 'viridis', spherical 6.0 + 'magma').  Once Task 4
 * wires this registry into `wireSlots`, visual output must be byte-
 * identical to today's main — that's the spot-check.
 */
import type { ScalarFieldPaletteId } from '../@types/ScalarCube';

export type VolumeFieldDefaults = {
  paletteId: ScalarFieldPaletteId;
  /**
   * Per-cube opacity multiplier; see the alpha-formula docblock in
   * `scalarVolumeRenderer.ts`.  Tuned per field so intensity=1 produces
   * a saturated-but-not-flat overlay against typical data ranges.
   */
  densityScale: number;
  /** Optional human-readable label override (renderer falls back to handle). */
  label?: string;
};

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
  densityScale: 1.0,
};

/**
 * Registered known fields.  Keep entries in handle-alphabetical order
 * (other than the production `cf4-density` which leads) so diffs stay
 * legible when a new debug field is added.
 */
export const VOLUME_FIELD_DEFAULTS: Record<string, VolumeFieldDefaults> = {
  'cf4-density': {
    paletteId: 'coolwarm',
    // Lifted from tools/buildCf4Density.ts:CF4_DENSITY_SCALE.  Tuned
    // against the CF-4 voxel value range so cosmic mean reads
    // transparent, over-densities red, voids blue.
    densityScale: 5.0,
    label: 'CF-4 DM density',
  },
  'debug-gaussian': {
    paletteId: 'blue-purple',
    // Lifted from syntheticScalarField.ts:makeSyntheticGaussianCube.
    // A single Gaussian peak integrates to roughly √(2π)·σ along its
    // central axis, so 10× lifts the peak into the saturated regime
    // while leaving the intensity slider plenty of low-end headroom.
    densityScale: 10.0,
    label: 'Gaussian (debug)',
  },
  'debug-cartesian': {
    paletteId: 'viridis',
    // Lifted from syntheticScalarField.ts:makeCartesianGridCube.  A
    // ray crosses ~8 grid planes per axis at default settings, so
    // integrated density is much higher than the single-peak
    // Gaussian — 4× is enough to saturate near intensity=1.0.
    densityScale: 4.0,
    label: 'Cartesian grid (debug)',
  },
  'debug-spherical': {
    paletteId: 'magma',
    // Lifted from syntheticScalarField.ts:makeSphericalGridCube.  A
    // ray typically crosses one or two shells plus a spoke — sits
    // between the Gaussian (sparse) and Cartesian grid (dense) in
    // integrated density, hence 6×.
    densityScale: 6.0,
    label: 'Spherical grid (debug)',
  },
};

/**
 * Look up presentation defaults for a field handle.  Falls back to
 * `FALLBACK_VOLUME_DEFAULTS` for any handle not in the registry,
 * which keeps the renderer rendering something sane if a producer
 * ships a v2 SCFD with a handle we haven't tuned yet.
 */
export function getVolumeFieldDefaults(handle: string): VolumeFieldDefaults {
  return VOLUME_FIELD_DEFAULTS[handle] ?? FALLBACK_VOLUME_DEFAULTS;
}
