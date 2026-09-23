/**
 * VolumeFieldRenderer — public handle for the multi-field 3D scalar-
 * volume renderer.  Owns the WebGPU pipeline, the per-field bind groups,
 * and the per-field registry; consumers upload / unload cubes (keyed by
 * an id generic over the caller), and the renderer READS per-field
 * settings each frame via `draw(settingsOf)`. The user-tunable knobs
 * (enabled, intensity, palette, contrast, densityScale, trim, exposure)
 * are not set through this handle — the caller's settings store owns
 * them.  See `volumeFieldRenderer.ts` for the full pipeline + ray-march
 * details.
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
   * True iff any field's resolved opacity (`fadeOpacityOf`, which covers
   * the fade-out tail) is non-zero for a field with `settingsOf` intensity > 0.
   */
  hasActiveFields(
    settingsOf: (id: Id) => VolumeFieldSettings,
    fadeOpacityOf: (id: Id) => number,
  ): boolean;
  listIds(): Id[];
  /**
   * Dispatch one raymarch per active field, additively blended.  The
   * per-field tunables are read each frame from `settingsOf`.
   * `fadeOpacityOf` supplies the fade-out opacity per id.  The palette
   * is re-uploaded in place when `settingsOf(id).paletteId` diverges
   * from what's resident.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    pxPerRad: number,
    cameraPosWorld: Readonly<Vec3>,
    settingsOf: (id: Id) => VolumeFieldSettings,
    fadeOpacityOf: (id: Id) => number,
  ): void;
  destroy(): void;
};
