/**
 * VolumeFieldRenderer — public handle for the multi-field 3D scalar-
 * volume renderer.  Owns the WebGPU pipeline, the per-field bind groups,
 * and the per-field registry; consumers upload / unload cubes (keyed by
 * an id generic over the caller, mirroring `galaxyPointRenderer.upload`/
 * `unload`, which key by galaxy-catalog id), and the renderer READS
 * per-field settings each frame via `draw(settingsOf)`. Generic over
 * `Id` so a second caller (e.g. a dust volume) can register its own field
 * ids on its own renderer instance without widening this union. The
 * user-tunable knobs (enabled, intensity, palette, contrast,
 * densityScale, trim, exposure) are not set through this handle — the
 * caller's settings store owns them and projects them in per frame.  See
 * `volumeFieldRenderer.ts` for the full pipeline + ray-march details.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { ScalarCube } from '../data/volume/ScalarCube';
import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { VolumeFieldDefaults } from '../data/volume/VolumeFieldDefaults';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type VolumeFieldRenderer<Id extends string = string> = {
  /**
   * Human-readable identifier (`'volumeFieldRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /** `statics` are the per-cube, non-tunable presentation facts, read once here. */
  upload(
    id: Id,
    cube: ScalarCube,
    statics: Pick<VolumeFieldDefaults, 'paletteId' | 'contrastCenter' | 'envelope'>,
  ): void;
  unload(id: Id): void;
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
    settingsOf: (id: Id) => VolumeFieldSettings | undefined,
    fadeOpacityOf?: (id: Id) => number,
  ): boolean;
  listIds(): Id[];
  /**
   * Dispatch one raymarch per active field, additively blended.  The
   * per-field tunables are read each frame from `settingsOf`; a field
   * with no settings row is skipped.  `fadeOpacityOf` supplies the
   * fade-out opacity per id.  The palette is re-uploaded in place
   * when `settingsOf(id).paletteId` diverges from what's resident.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    pxPerRad: number,
    cameraPosWorld: Readonly<Vec3>,
    settingsOf: (id: Id) => VolumeFieldSettings | undefined,
    fadeOpacityOf: (id: Id) => number,
  ): void;
  destroy(): void;
};
