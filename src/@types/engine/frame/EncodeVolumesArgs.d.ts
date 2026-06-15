/**
 * EncodeVolumesArgs — inputs for `encodeVolumes()`.
 *
 * Why a named arg-bag (vs positional args) — same rationale as the rest of
 * the frame-encoder helpers in this directory: the caller threads ~6
 * values through one indirection site, and a struct keeps the call shape
 * legible and easy to extend without ordering surprises.  See
 * `RenderFrameInput.d.ts` for the matching argument-bag pattern.
 */

import type { ReadyFrameContext } from './ReadyFrameContext';
import type { VolumeFieldRenderer } from '../../rendering/VolumeFieldRenderer';
import type { VolumeFieldId } from '../../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../settings/VolumeFieldSettings';

export type EncodeVolumesArgs = {
  encoder: GPUCommandEncoder;
  ctx: ReadyFrameContext;
  /**
   * Volume-field renderer.  Null in the brief bootstrap window before
   * `initGpu` has wired it up; the helper is a no-op in that case.
   */
  volumeFieldRenderer: VolumeFieldRenderer | null;
  /**
   * Per-field fade opacity callback, threaded from `state.subsystems.fades`
   * at the call site.  Returns the current animated opacity [0, 1] for the
   * given scalar-field id so each field fades independently.
   */
  fadeOpacityOf: (id: VolumeFieldId) => number;
  /**
   * Per-field settings projection, threaded from `state.settings.volumes.items`
   * at the call site. Returns the live VolumeFieldSettings for a scalar-field
   * id (or undefined if it has no settings row) so the renderer reads each
   * field's knobs per frame instead of mirroring them.
   */
  settingsOf: (id: VolumeFieldId) => VolumeFieldSettings | undefined;
  /**
   * Optional `RenderPassTimestampWrites` for per-pass GPU timing.  When
   * `undefined` the helper omits the field from the `beginRenderPass`
   * descriptor (single-pass production path).  When defined the helper
   * spreads it in — used by `encodeHdrSplit` to bill the half-res
   * raymarch against the `'scalar-volume'` slot.
   */
  timestampWrites: GPURenderPassTimestampWrites | undefined;
};
