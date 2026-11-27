import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';
import type { DetailRegionFrame } from './DetailRegionFrame';

/** At most one detail region per pyramid field; the renderer's one `attachRegion` caller. */
export type DetailRegionHost = {
  /** Create, keep or tear down each field's region against `wanted` (field id → K), then run each. */
  frame(
    wanted: ReadonlyMap<CosmicWebDensityFieldId, number>,
    eye: Readonly<Vec3>,
    /** The largest target pxPerRad of the frame's views: each region's `gateVox`. */
    gatePxPerRad: number,
    frameIndex: number,
    nowMs: number,
  ): DetailRegionFrame;
  destroy(): void;
};
