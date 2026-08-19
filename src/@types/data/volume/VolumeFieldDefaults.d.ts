/**
 * VolumeFieldDefaults — per-id presentation defaults for scalar-volume
 * fields registered with the renderer.
 *
 * SCFD v2 is data-only (dims, frame, voxels, dynamic range).  How a
 * field should LOOK on first registration — its palette and
 * `densityScale` — is presentation, not data, and lives in
 * `src/data/volumeFieldDefaults.ts` rather than in the binary header.
 *
 * See that file's module header for the alternatives considered and
 * the rationale behind keeping a TS registry of compile-time
 * vocabulary.
 */

import type { ScalarFieldPaletteId } from './ScalarFieldPaletteId';
import type { FadeBand } from '../../math/FadeBand';

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
   * `volumeFieldRenderer.ts`.  Tuned per field so intensity=1 produces
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
  /** Optional human-readable label override (renderer falls back to id). */
  label?: string;
  /**
   * Optional per-field scale-fade bands, seeded into `VolumeFieldSettings.bands`
   * (`buildVolumeFieldSettings`). Omitted → `[SCALE_FADE_BANDS.surveyDeepZoom]`,
   * today's one-size-fits-all deep-zoom fade. A field wanting a different
   * choreography (e.g. full close-in, gone far out) declares its own bands here
   * instead of hand-editing `deriveVolumeLiveness`.
   */
  fadeBands?: readonly FadeBand[];
};
