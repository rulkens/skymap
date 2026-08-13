/**
 * FieldEntry — internal per-registered-field record kept by the
 * `VolumeFieldRenderer`'s `fields` map.
 *
 * Holds the things the renderer genuinely owns: GPU resources (textures,
 * buffers, bind groups), the cube's model / inverse-model matrices, the
 * per-cube STATIC presentation config (contrastCenter, envelope), and a
 * `residentPaletteId` GPU-residency fact.  The user-tunable knobs
 * (enabled, intensity, contrast, densityScale, paletteId, trim, exposure)
 * are NOT mirrored here — they live in `state.settings.volumes.items`
 * and are read per frame in `draw` via the `settingsOf` projection.
 * Mirroring them here would re-introduce the very entanglement the
 * settings unification removes (two sources of truth that can drift).
 *
 * Lives in @types/rendering because the renderer's `.d.ts` needs the
 * shape.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { ScalarFieldPaletteId } from '../data/volume/ScalarFieldPaletteId';

export type FieldEntry = {
  id: VolumeFieldId;
  /**
   * Per-cube center of the contrast windowing transform, in LUT
   * coordinate space [0, 1].  Divergent palettes (CF-4, coolwarm)
   * want 0.5 so the deadband suppresses the cosmic-mean midpoint
   * symmetrically; sequential palettes (MCPM, inferno) want 0.0 so
   * the deadband suppresses the void floor (LUT t=0) and the stretch
   * pushes mid-density values toward the bright end.  Per-cube
   * static — read once at registration time from the per-id
   * registry, not user-tunable.  See `applyContrastWindow` in
   * `fragment.wesl` for the math.
   */
  contrastCenter: number;
  /**
   * Spatial envelope (smoothstep edges in normalised local-space
   * distance from cube center, where the inscribed sphere = 1.0).
   * Voxels at distance < `envelopeInner` get full alpha; voxels past
   * `envelopeOuter` are fully suppressed; values in between cross-fade.
   * Setting both to a value ≥ √3 (the cube-corner distance) disables
   * the envelope.  Per-cube static — read once at registration from
   * the per-id registry.
   */
  envelopeInner: number;
  envelopeOuter: number;
  /**
   * GPU-RESIDENCY fact: the palette id currently uploaded into
   * `paletteTexture`.  NOT a user setting (that's
   * `state.settings.volumes.items[id].paletteId`); this just tracks
   * what's resident on the GPU.  `draw` compares it against the field's
   * live setting and re-uploads the LUT in place when they differ —
   * palette is the one knob with a GPU side effect, so it's the one knob
   * that needs a residency mirror to know when a re-upload is due.
   */
  residentPaletteId: ScalarFieldPaletteId;
  modelMatrix: Mat4;
  invModelMatrix: Mat4;
  volumeTexture: GPUTexture;
  /**
   * Max-value pyramid in DEVIATION space (`abs(value - contrastCenter) /
   * halfRange`, the same quantity `applyContrastWindow` thresholds
   * against), base = ceil(volume dims / 8). Built once per `upload()`
   * from the raw cube (not the display chain's box-filtered mips, which
   * could average a thin bright filament below the skip threshold) — see
   * `buildMaxPyramid` in `volumeFieldRenderer.ts`. Bound at @group(0)
   * @binding(5); no shader reads it until Task 5's skip march.
   */
  maxPyramidTexture: GPUTexture;
  paletteTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  /**
   * Per-field FadeUniforms GPU buffer (16 bytes — opacity f32 + 12
   * bytes pad). Written each frame in `draw` from the registry-read
   * opacity for this field's id.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical fadeBgl.
   */
  fadeBindGroup: GPUBindGroup;
};
