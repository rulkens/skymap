/**
 * ScalarVolumeRenderer — public handle for the multi-field 3D scalar-
 * volume renderer.  Owns the WebGPU pipeline, the per-field bind groups,
 * and the per-field registry; consumers add / remove cubes, toggle
 * visibility, and tune per-field settings (palette, contrast, intensity,
 * envelope, exposure, trim, …).  See `scalarVolumeRenderer.ts` for the
 * full pipeline + ray-march details.
 */

import type { mat4 } from 'gl-matrix';
import type { ScalarCube } from '../data/ScalarCube';
import type { ScalarFieldPaletteId } from '../data/ScalarFieldPaletteId';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { ScalarFieldHandle } from './ScalarFieldHandle';
import type { FieldEntry } from './FieldEntry';

// Note: `FieldEntry` is imported from the renderer source rather than
// extracted into its own d.ts because it's a private per-field internal
// (mutated in place by setters) — every consumer except the test-only
// `__getFieldEntryForTest` should NOT see it.  Re-exporting it from the
// source file keeps that boundary readable: there is one place where
// FieldEntry lives, and the d.ts borrows it for the test-only typing
// without elevating it to public-API status.

export type ScalarVolumeRenderer = {
  /**
   * Human-readable identifier (`'scalarVolumeRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  addField(handle: ScalarFieldHandle, cube: ScalarCube): void;
  removeField(handle: ScalarFieldHandle): void;
  setEnabled(handle: ScalarFieldHandle, enabled: boolean): void;
  setIntensity(handle: ScalarFieldHandle, intensity: number): void;
  /**
   * Per-field contrast for the windowing transform in `fragment.wesl`.
   * Range conventionally [0.25, 4.0]; 1.0 is identity (no deadband).
   * Higher values widen the deadband around the midpoint (suppressing
   * near-mean noise) and stretch the surviving range across the full
   * palette.  Clamped to a small positive minimum (1e-3) so the
   * shader's `1 / contrast` stays well-defined.  No-op if the handle
   * is unknown.
   */
  setContrast(handle: ScalarFieldHandle, contrast: number): void;
  /**
   * Per-cube opacity multiplier used by the alpha-integral inside the
   * scalar-volume fragment shader.  Values must be non-negative; the
   * setter clamps negative or NaN inputs to 0 (a silent overlay)
   * because a negative densityScale would invert the colour mapping
   * and yield nonsense visuals rather than a useful debug signal.
   *
   * Lives alongside `setContrast` because the two are orthogonal:
   * contrast windows the LUT-coordinate around the midpoint
   * (suppress noise + stretch structure); densityScale scales the
   * optical-depth contribution per voxel-step.  No-op when
   * the handle is unknown — mirrors the rest of the per-field setter
   * surface so a late-firing settings callback for a removed field
   * cannot throw.
   */
  setDensityScale(handle: ScalarFieldHandle, value: number): void;
  /**
   * Per-field spatial envelope.  `inner` and `outer` are normalised
   * distances from the cube center in local space (the inscribed
   * sphere has radius 1.0, the cube's corners are at √3 ≈ 1.73).
   * The shader smoothsteps from full opacity at `inner` to zero
   * opacity at `outer`, then multiplies the result onto the per-step
   * alpha — this hides the axis-aligned cube silhouette for cubes
   * whose corner regions are visually noisy or scientifically empty.
   * Setting both edges to a value ≥ √3 disables the envelope.  No-op
   * when the handle is unknown.
   */
  setEnvelope(handle: ScalarFieldHandle, inner: number, outer: number): void;
  /**
   * Per-cube center of the contrast windowing transform.  See the
   * `contrastCenter` field on `FieldEntry` for the rationale; values
   * outside [0, 1] are clamped because the shader's `halfRange =
   * max(center, 1-center)` only makes sense in that range.  Called
   * once at slot-commit time with the per-handle registry value.
   */
  setContrastCenter(handle: ScalarFieldHandle, center: number): void;
  /**
   * Per-cube HDR exposure multiplier on the rgb contribution.  See
   * the `exposure` field on `FieldEntry` for the rationale.  Negative
   * or NaN values clamp to 0 (silent overlay); the upper bound is
   * permissive (32) because the downstream tonemap caps display
   * brightness anyway.  No-op when the handle is unknown.
   */
  setExposure(handle: ScalarFieldHandle, value: number): void;
  /**
   * User-tunable low-end cutoff in normalised LUT-coord space.
   * Range conventionally [0, 0.95]; values past 0.95 get clamped
   * because they leave no useful signal.  No-op when handle unknown.
   */
  setTrim(handle: ScalarFieldHandle, value: number): void;
  /**
   * Replace the palette LUT for a single field.  Rewrites the field's
   * existing 1D LUT texture in place via `writeTexture`; the bind group
   * (which references the texture's view) stays valid, so a palette
   * change costs one queue write and zero rebinds.  No-op if the
   * handle is unknown.
   */
  setFieldPalette(handle: ScalarFieldHandle, id: ScalarFieldPaletteId): void;
  /** Current palette id for a single field; `null` if the handle is unknown. */
  getFieldPalette(handle: ScalarFieldHandle): ScalarFieldPaletteId | null;
  /**
   * True iff any field is currently producing visible output. The
   * optional `fadeOpacityOf` callback widens the predicate to also
   * include fields whose `enabled` is false but whose fade-out tail
   * (opacity > 0) is still in flight — that's the state the
   * volume-upsample gate and the encodeHdr* pass-opener want, so
   * they keep blitting / drawing through the ~100 ms ramp.
   *
   * Called without a callback for legacy / test paths, which retain
   * the strict "enabled && intensity > 0" semantic.
   */
  hasActiveFields(fadeOpacityOf?: (handle: ScalarFieldHandle) => number): boolean;
  listHandles(): ScalarFieldHandle[];
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    cameraPosWorld: Readonly<Vec3>,
    fadeOpacityOf: (handle: ScalarFieldHandle) => number,
  ): void;
  destroy(): void;
  /**
   * Test-only escape hatch: returns the live `FieldEntry` for the given
   * handle (or `undefined`).  Exposed so unit tests can assert that
   * setters mutated the per-field CPU state without having to read back
   * through the GPU queue (which is mocked in Node).  Production code
   * MUST NOT call this — every legitimate caller goes through the
   * setter / draw surface.  Prefixed `__` to mark the contract.
   */
  __getFieldEntryForTest(handle: ScalarFieldHandle): Readonly<FieldEntry> | undefined;
};
