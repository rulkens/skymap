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
   * Initial contrast for the shader's windowing transform.  1.0 is
   * identity (no deadband, no stretching); > 1.0 widens a deadband
   * around the value midpoint and stretches the surviving range
   * across the full palette.  Per-cube because the right amount of
   * windowing depends on how noisy the cube's near-mean voxels are —
   * dense scientific reconstructions (CF-4) want a touch of
   * windowing on by default; synthetic test fixtures don't.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier; see the alpha-formula docblock in
   * `scalarVolumeRenderer.ts`.  Tuned per field so intensity=1 produces
   * a saturated-but-not-flat overlay against typical data ranges.
   */
  densityScale: number;
  /**
   * Spatial envelope (spherical falloff in local cube space) used to
   * fade the cube's corner regions to invisibility, hiding the axis-
   * aligned silhouette of the bounding box.  Whether a cube WANTS this
   * envelope is content-dependent:
   *
   *   - CF-4 density: yes — corners are sparse void anyway, the cosmic
   *     structures of interest (Laniakea, Local Void, Great Attractor)
   *     sit comfortably inside the inscribed sphere.  Hiding the cube
   *     silhouette makes the overlay blend with the surrounding sky.
   *   - Debug grids: no — the whole point is to verify axis alignment,
   *     so the corners must stay visible.
   *
   * The envelope is a smoothstep from `inner` (fully opaque) to `outer`
   * (fully transparent), where both numbers are distance from the cube
   * center in local space, normalised so the face-touching inscribed
   * sphere has radius 1.  The cube's corners sit at √3 ≈ 1.73, so any
   * `outer ≥ √3` effectively disables the envelope.  We use the
   * sentinel `{ inner: 2.0, outer: 2.0 }` for "no envelope" cubes
   * because two equal values short-circuit the smoothstep without
   * needing a branch.
   */
  envelope: {
    inner: number;
    outer: number;
  };
  /** Optional human-readable label override (renderer falls back to handle). */
  label?: string;
};

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
  densityScale: 1.0,
  envelope: NO_SPATIAL_ENVELOPE,
};

/**
 * Registered known fields.  Keep entries in handle-alphabetical order
 * (other than the production `cf4-density` which leads) so diffs stay
 * legible when a new debug field is added.
 */
export const VOLUME_FIELD_DEFAULTS: Record<string, VolumeFieldDefaults> = {
  'cf4-density': {
    paletteId: 'coolwarm',
    // Slight windowing on by default: the CF-4 reconstruction is
    // smoothed with a 5 Mpc/h Gaussian kernel, leaving a soft noise
    // floor of voxels just off the cosmic mean that read as visible
    // fog under identity contrast.  1.2 = a ~17% deadband, just
    // enough to crisp up the structures without yet cropping any
    // real signal.  Tuned visually against d_mean_CF4pp.npy.
    contrast: 1.2,
    // Bumped from the original 5.0 to compensate for the windowing
    // visibility multiplier AND the spherical envelope cropping
    // (both new in the volume-windowing-envelope PR).  20× yields a
    // saturated peak through Laniakea at intensity ≈ 0.5; lower
    // values produce a too-translucent cloud that fights the
    // background sky.  Tuned visually.
    densityScale: 20.0,
    // Soft skirt from the inscribed sphere (radius 1.0) inward to 0.9
    // hides the axis-aligned cube silhouette.  The discarded corner
    // regions (~48% of cube volume) are nearly empty sky for the CF-4
    // reconstruction — Laniakea, the Local Void, and the Great
    // Attractor all sit well inside the inscribed sphere.
    envelope: { inner: 0.9, outer: 1.0 },
    label: 'CF-4 DM density',
  },
  'debug-gaussian': {
    paletteId: 'blue-purple',
    // Identity contrast — synthetic fixtures don't have a noise
    // floor worth windowing out.
    contrast: 1.0,
    // Lifted from syntheticScalarField.ts:makeSyntheticGaussianCube.
    // A single Gaussian peak integrates to roughly √(2π)·σ along its
    // central axis, so 10× lifts the peak into the saturated regime
    // while leaving the intensity slider plenty of low-end headroom.
    densityScale: 10.0,
    // No envelope: the synthetic fixtures exist for axis / scale /
    // origin verification.  Corner visibility is a feature, not a bug.
    envelope: NO_SPATIAL_ENVELOPE,
    label: 'Gaussian (debug)',
  },
  'debug-cartesian': {
    paletteId: 'viridis',
    contrast: 1.0,
    // Lifted from syntheticScalarField.ts:makeCartesianGridCube.  A
    // ray crosses ~8 grid planes per axis at default settings, so
    // integrated density is much higher than the single-peak
    // Gaussian — 4× is enough to saturate near intensity=1.0.
    densityScale: 4.0,
    // Grid corners are part of the test; keep them visible.
    envelope: NO_SPATIAL_ENVELOPE,
    label: 'Cartesian grid (debug)',
  },
  'debug-spherical': {
    paletteId: 'magma',
    contrast: 1.0,
    // Lifted from syntheticScalarField.ts:makeSphericalGridCube.  A
    // ray typically crosses one or two shells plus a spoke — sits
    // between the Gaussian (sparse) and Cartesian grid (dense) in
    // integrated density, hence 6×.
    densityScale: 6.0,
    // Spherical shells extend to the cube corners; envelope would
    // crop the outermost shell asymmetrically — undesirable for a
    // verification fixture.
    envelope: NO_SPATIAL_ENVELOPE,
    label: 'Spherical grid (debug)',
  },
  'mcpm': {
    // Inferno (matplotlib perceptually-uniform, fire-on-black) is the
    // canonical aesthetic for slime-mould / cosmic-web density
    // visualisations (Polyphorm, MCPM tradition). Visually distinct
    // from CF-4's divergent coolwarm so both overlays can be enabled
    // together and read as separate layers. Added to the palette set
    // by Task 5; this entry is the first consumer.
    paletteId: 'inferno',
    // MCPM trace density spans several decades (slime-mould agent
    // density is heavy-tailed); modest windowing brings filament
    // structure forward without crushing the low-density voids.
    contrast: 1.5,
    // Initial value pending visual tuning against the real cube; lower
    // than CF-4's 20 because MCPM's normalised range stays in [0.5, 1.0]
    // (non-negative input) and saturates faster.
    densityScale: 4.0,
    // Same posture as CF-4: soft skirt from the inscribed sphere
    // inward to hide the axis-aligned silhouette. The MCPM cube extends
    // 556×938×569 Mpc, so the inscribed sphere reaches well past the
    // SDSS volume of interest; envelope corner-cropping costs nothing
    // visually meaningful.
    envelope: { inner: 0.85, outer: 1.05 },
    label: 'MCPM Cosmic Web',
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
