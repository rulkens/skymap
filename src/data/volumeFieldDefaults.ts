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
   * Per-cube center of the contrast windowing transform, in LUT
   * coordinate space [0, 1].  Per-cube static (not user-tunable)
   * because it's a property of the cube's data semantics + palette
   * choice rather than a tuning knob:
   *
   *   - Divergent palettes (coolwarm) with a meaningful zero at the
   *     midpoint of the data range → `contrastCenter = 0.5`.  The
   *     deadband suppresses near-mean noise symmetrically; the
   *     stretch pushes both ends toward palette extremes.  CF-4
   *     density contrast is the canonical example.
   *
   *   - Sequential palettes (inferno, magma, viridis) with a
   *     meaningful zero at the start of the LUT (voids are
   *     transparent) → `contrastCenter = 0.0`.  The deadband
   *     suppresses void voxels (LUT t≈0); the stretch pushes
   *     mid-density values toward the bright end (LUT t≈1).  MCPM
   *     log-normalised trace density is the canonical example.
   *
   * The shader generalises the windowing transform around this
   * center; see `applyContrastWindow` in `fragment.wesl`.
   */
  contrastCenter: number;
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
  /**
   * Per-cube HDR exposure multiplier on the rgb contribution per
   * ray-march step.  1.0 preserves the pre-HDR behaviour exactly;
   * values > 1 push the accumulated color past the LUT's brightest
   * entry, producing the "peaks blow out to white" effect after the
   * downstream tonemap rolls the rgba16float accumulator back to
   * display gamut.
   *
   * Per-cube static (not a user-tunable slider) because it's a
   * per-dataset aesthetic decision rather than a tuning knob — MCPM
   * with its log-normalised heavy tail wants 4-6 to surface the
   * fiery slime-mould look; CF-4 keeps 1.0 because its divergent
   * coolwarm is already calibrated against the cosmic mean.
   */
  exposure: number;
  /**
   * Default user-tunable low-end cutoff (Trim) in normalised LUT space.
   * Per-cube starting point; user can override via the Trim slider.
   *
   *   - 0.0 = no trim (every voxel passes).  CF-4 default — its
   *     coolwarm palette is already calibrated against the cosmic mean
   *     and trimming would crop scientifically meaningful structure.
   *   - 0.2 = light trim hiding the low-density fog band.  MCPM
   *     default — see the analysis in the spec for the percentile
   *     breakdown that motivates this value.
   */
  trim: number;
  /**
   * Optional per-cube starting Intensity (overall opacity multiplier in
   * [0, 1]).  When omitted, the slot seeds with the global
   * `DEFAULT_VOLUME_FIELD_INTENSITY`.  Per-cube override exists because
   * a heavy-tailed log-normalised cube (MCPM) wants intensity=1.0 by
   * default to read at full saturation, while CF-4's calibrated
   * coolwarm sits comfortably at the global 0.5.
   */
  intensity?: number;
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
    // 0.5 = divergent / midpoint-centred windowing.  CF-4 stores
    // overdensity δ (signed) with the cosmic mean at 0; the symmetric
    // builder maps that to LUT t=0.5, where the coolwarm palette is
    // fully transparent.  See VolumeFieldDefaults.contrastCenter for
    // the divergent-vs-sequential discussion.
    contrastCenter: 0.5,
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
    // 1.0 preserves the pre-HDR behaviour exactly — CF-4's divergent
    // coolwarm is already calibrated against the cosmic-mean midpoint,
    // and an HDR boost would wash out the careful balance between
    // overdensity (warm) and underdensity (cool) sides of the palette.
    exposure: 1.0,
    // CF-4 keeps the cosmic mean visible
    trim: 0.0,
    label: 'CF-4 DM density',
  },
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
    // Tuned visually against the SDSS_z_44-476mpc cube alongside the
    // densityScale=18 + exposure=18 + trim=0.3 + intensity=1.0
    // combination below — bump only after an A/B against that cube.
    contrast: 1.7,
    // 0.0 = sequential / void-floor-centred windowing.  MCPM trace
    // is non-negative and log-normalised, so void voxels sit at LUT
    // t=0 (transparent inferno start).  Centering the deadband at 0
    // suppresses voids when contrast > 1 and stretches mid-density
    // values toward the bright end of the LUT — exactly what the
    // user wants for "filaments rising out of fog".  Without this
    // (i.e. with the cf4 default of 0.5), the contrast slider became
    // a knife-edge between "all red" and "completely invisible".
    contrastCenter: 0.0,
    // Tuned visually against the real SDSS_z_44-476mpc cube — the
    // log-normalised heavy-tailed distribution needs more density than
    // the original 4.0 placeholder to reach saturation through the
    // soft envelope at intensity=1.0.  18 lands in the same ballpark
    // as CF-4's 20 (similar visibility multiplier + envelope cropping
    // posture) — both cubes converged on ~20 from very different
    // starting points.
    densityScale: 18.0,
    // Same posture as CF-4: soft skirt from the inscribed sphere
    // inward to hide the axis-aligned silhouette. The MCPM cube extends
    // 556×938×569 Mpc, so the inscribed sphere reaches well past the
    // SDSS volume of interest; envelope corner-cropping costs nothing
    // visually meaningful.
    envelope: { inner: 0.85, outer: 1.05 },
    // 18 = aggressive HDR boost on peaks only.  The shader's
    // bright-end-weighted formula (highlightGain = 1 + smoothstep(0.5,
    // 1, dev) * (exposure - 1)) means mid-tones near the contrast
    // center stay at gain ≈ 1.0; only peaks (signedT > 0.7 for
    // sequential, |signedT - 0.5| > 0.35 for divergent) get the full
    // boost.  For MCPM peaks at signedT ≈ 1.0 with exposure=18, the
    // gain reaches 18x — pushes inferno's pale-yellow LUT entry past
    // LDR into hard white blow-out at the densest filament cores via
    // the downstream tonemap.  Tuned visually; bumped from the
    // original 8.0 placeholder once the bright-end-weighted formula
    // landed and the warm gradient stayed intact at higher exposures.
    exposure: 18.0,
    // 0.3 hides the low-density fog band slightly more aggressively
    // than the original 0.2 — the dataset is 73% void, so trim only
    // affects the next ~22% fog slice anyway, and 0.3 was the visual
    // sweet spot for filament-on-black contrast against intensity=1.0.
    trim: 0.3,
    // 1.0 — MCPM is the headline cosmic-web overlay and wants full
    // saturation by default; the global 0.5 was tuned for CF-4's more
    // calibrated coolwarm.  Per-cube override lets each cube pick its
    // starting point independently.
    intensity: 1.0,
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
