/**
 * VolumeFieldRenderer — public handle for the multi-field 3D scalar-
 * volume renderer.  Owns the WebGPU pipeline, the per-field bind groups,
 * and the per-field registry; consumers upload / unload cubes (keyed by
 * field id, mirroring `pointRenderer.upload`/`unload`, which key by
 * galaxy-catalog id), and
 * the renderer READS per-field settings each frame via `draw(settingsOf)`.
 * The user-tunable knobs (enabled, intensity, palette, contrast,
 * densityScale, trim, exposure) are no longer set through this handle —
 * they live in `state.settings.volumes.items` and are projected in per
 * frame.  See `volumeFieldRenderer.ts` for the full pipeline +
 * ray-march details.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { ScalarCube } from '../data/volume/ScalarCube';
import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';

export type VolumeFieldRenderer = {
  /**
   * Human-readable identifier (`'volumeFieldRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  upload(id: VolumeFieldId, cube: ScalarCube): void;
  unload(id: VolumeFieldId): void;
  /**
   * True iff any field is currently producing visible output. The live
   * per-field settings come from `settingsOf` (the renderer no longer
   * mirrors enabled / intensity, so it cannot answer without it); a
   * field with no settings row, intensity ≤ 0, is treated as off.
   *
   * The optional `fadeOpacityOf` callback widens the predicate to also
   * include fields whose `enabled` is false but whose fade-out tail
   * (opacity > 0) is still in flight — that's the state the
   * volume-upsample gate and the encodeHdr* pass-opener want, so
   * they keep blitting / drawing through the ~100 ms ramp.
   *
   * `settingsOf` / `fadeOpacityOf` are keyed by volume-field id.
   */
  hasActiveFields(
    settingsOf: (id: VolumeFieldId) => VolumeFieldSettings | undefined,
    fadeOpacityOf?: (id: VolumeFieldId) => number,
  ): boolean;
  listIds(): VolumeFieldId[];
  /**
   * Dispatch one raymarch per active field, additively blended.  The
   * per-field tunables are read each frame from `settingsOf`; a field
   * with no settings row is skipped.  `fadeOpacityOf` supplies the
   * fade-out opacity per id.  The palette is re-uploaded in place
   * when `settingsOf(id).paletteId` diverges from what's resident.
   *
   * `pixelConeTan` is a frame-global scalar — the tangent of one pixel's
   * half-angle at the (downscaled) volume target — computed once by the
   * caller and forwarded to every field, same rationale as `viewportPx`.
   * Unread by the shader until Task 6's cone-LOD sampling.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    cameraPosWorld: Readonly<Vec3>,
    pixelConeTan: number,
    settingsOf: (id: VolumeFieldId) => VolumeFieldSettings | undefined,
    fadeOpacityOf: (id: VolumeFieldId) => number,
  ): void;
  destroy(): void;
};
