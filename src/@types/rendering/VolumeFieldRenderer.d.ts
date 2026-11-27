/** VolumeFieldRenderer — the multi-field scalar-volume raymarcher's handle. Cubes upload per id; the
 *  tunables are never set here, `draw` reads them each frame through `settingsOf`. */

import type { Mat4 } from 'wgpu-matrix';
import type { GpuVolume } from './GpuVolume';
import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { VolumeFieldDefaults } from '../data/volume/VolumeFieldDefaults';
import type { Vec2 } from '../../../packages/shared/src/@types/math/Vec2';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { VolumeFieldDrawInputs } from './VolumeFieldDrawInputs';
import type { DetailRegionDraw } from './DetailRegionDraw';

export type VolumeFieldRenderer<Id extends string = string> = {
  readonly label: string;
  /** Takes ownership of `volume.texture` (destroyed on re-upload, `unload` and `destroy`). */
  upload(
    id: Id,
    volume: GpuVolume,
    statics: Pick<VolumeFieldDefaults, 'paletteId' | 'contrastCenter' | 'envelope'>,
  ): void;
  /** Binds `texture` as `id`'s detail region, kept across `upload`; null drops it. Borrowed: the
   *  region host, the one caller, passes null before it destroys the texture. */
  attachRegion(id: Id, texture: GPUTexture | null): void;
  unload(id: Id): void;
  /** True iff a field with intensity > 0 has a non-zero `fadeOpacityOf` (fade-out tail included). */
  hasActiveFields(
    settingsOf: (id: Id) => VolumeFieldSettings,
    fadeOpacityOf: (id: Id) => number,
  ): boolean;
  /** One additive raymarch per active field. A changed `settingsOf(id).paletteId` re-uploads the LUT
   *  in place; `inputs` holds for every field of the call. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    pxPerRad: number,
    cameraPosWorld: Readonly<Vec3>,
    settingsOf: (id: Id) => VolumeFieldSettings,
    fadeOpacityOf: (id: Id) => number,
    regionOf: (id: Id) => DetailRegionDraw | null,
    inputs: VolumeFieldDrawInputs,
  ): void;
  destroy(): void;
};
