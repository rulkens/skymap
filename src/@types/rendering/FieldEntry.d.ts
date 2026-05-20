/**
 * FieldEntry — internal per-registered-field record kept by the
 * `ScalarVolumeRenderer`'s `fields` map.
 *
 * Public surface today is limited to test code via the
 * `__getFieldEntryForTest` accessor; user-facing setters all funnel
 * through the renderer's own typed methods.  Lives in @types/rendering
 * because the renderer's `.d.ts` (and the test-only accessor) needs
 * the shape.
 */

import type { mat4 } from 'gl-matrix';

import type { ScalarFieldHandle } from './ScalarFieldHandle';
import type { ScalarFieldPaletteId } from '../data/ScalarFieldPaletteId';

export type FieldEntry = {
  handle: ScalarFieldHandle;
  enabled: boolean;
  intensity: number;
  /**
   * Per-field contrast — drives the windowing transform in
   * `fragment.wesl`'s `applyContrastWindow`.  1.0 is identity (no
   * deadband); > 1.0 widens the deadband around the midpoint
   * (suppressing near-mean noise) AND stretches the surviving range
   * across the full palette.  Orthogonal to `intensity`: intensity
   * controls overall opacity, contrast controls how aggressively
   * mid-range noise is suppressed.  See the function's docblock in
   * the shader for the math.
   */
  contrast: number;
  /**
   * Per-cube center of the contrast windowing transform, in LUT
   * coordinate space [0, 1].  Divergent palettes (CF-4, coolwarm)
   * want 0.5 so the deadband suppresses the cosmic-mean midpoint
   * symmetrically; sequential palettes (MCPM, inferno) want 0.0 so
   * the deadband suppresses the void floor (LUT t=0) and the stretch
   * pushes mid-density values toward the bright end.  Per-cube
   * static — set once at registration time from the per-handle
   * registry, not user-tunable.  See `applyContrastWindow` in
   * `fragment.wesl` for the math.
   */
  contrastCenter: number;
  paletteId: ScalarFieldPaletteId;
  /** Per-cube opacity multiplier; seeded in `addField` and overwritten
   *  via `setDensityScale` from the field's SOURCE_REGISTRY entry. */
  densityScale: number;
  /**
   * Spatial envelope (smoothstep edges in normalised local-space
   * distance from cube center, where the inscribed sphere = 1.0).
   * Voxels at distance < `envelopeInner` get full alpha; voxels past
   * `envelopeOuter` are fully suppressed; values in between cross-fade.
   * Setting both to a value ≥ √3 (the cube-corner distance) disables
   * the envelope.  Seeded to no-envelope in `addField` and overwritten
   * via `setEnvelope` from `wireSlots`.
   */
  envelopeInner: number;
  envelopeOuter: number;
  /**
   * Per-cube HDR exposure multiplier on the rgb contribution.  Values
   * > 1 push accumulated color past the LUT's brightest entry; the
   * downstream tonemap pass rolls the rgba16float accumulator back to
   * display gamut, producing the "peaks blow out to white" effect.
   * Decoupled from alpha so brightening doesn't also occlude.
   * Per-cube static (set once at registration via setExposure from
   * the slot commit); not a user-tunable today.
   */
  exposure: number;
  /**
   * User-tunable low-end cutoff in normalised LUT-coord space [0, 1].
   * Hard-suppresses voxels with deviation-from-center < trim — the
   * "Polyphorm trim_density" knob in normalised space.  Default 0 =
   * no trim.  Combined with contrast's implicit deadband by taking
   * the max in the shader.
   */
  trim: number;
  modelMatrix: mat4;
  invModelMatrix: mat4;
  volumeTexture: GPUTexture;
  paletteTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  /**
   * Per-field FadeUniforms GPU buffer (16 bytes — opacity f32 + 12
   * bytes pad). Written each frame in `draw` from the registry-read
   * opacity for this field's handle.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical fadeBgl.
   */
  fadeBindGroup: GPUBindGroup;
};
