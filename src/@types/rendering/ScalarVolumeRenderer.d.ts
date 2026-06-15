/**
 * ScalarVolumeRenderer — public handle for the multi-field 3D scalar-
 * volume renderer.  Owns the WebGPU pipeline, the per-field bind groups,
 * and the per-field registry; consumers upload / unload cubes (keyed by
 * field handle, mirroring `pointRenderer.upload`/`unload` per source), and
 * the renderer READS per-field settings each frame via `draw(settingsOf)`.
 * The user-tunable knobs (enabled, intensity, palette, contrast,
 * densityScale, trim, exposure) are no longer set through this handle —
 * they live in `state.settings.volumes.items` and are projected in per
 * frame.  See `scalarVolumeRenderer.ts` for the full pipeline +
 * ray-march details.
 */

import type { mat4 } from 'gl-matrix';
import type { ScalarCube } from '../data/ScalarCube';
import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { VolumeFieldId } from '../data/VolumeFieldId';

export type ScalarVolumeRenderer = {
  /**
   * Human-readable identifier (`'scalarVolumeRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  upload(handle: VolumeFieldId, cube: ScalarCube): void;
  unload(handle: VolumeFieldId): void;
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
   */
  hasActiveFields(
    settingsOf: (handle: VolumeFieldId) => VolumeFieldSettings | undefined,
    fadeOpacityOf?: (handle: VolumeFieldId) => number,
  ): boolean;
  listHandles(): VolumeFieldId[];
  /**
   * Dispatch one raymarch per active field, additively blended.  The
   * per-field tunables are read each frame from `settingsOf`; a field
   * with no settings row is skipped.  `fadeOpacityOf` supplies the
   * fade-out opacity per handle.  The palette is re-uploaded in place
   * when `settingsOf(handle).paletteId` diverges from what's resident.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    cameraPosWorld: Readonly<Vec3>,
    settingsOf: (handle: VolumeFieldId) => VolumeFieldSettings | undefined,
    fadeOpacityOf: (handle: VolumeFieldId) => number,
  ): void;
  destroy(): void;
};
