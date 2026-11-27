import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';

/** One field's region: sidecar, index, store, stream and plan state; the only writer of that state. */
export type DetailRegion = {
  /** `eye` in world Mpc; `gatePxPerRad` is the gate distance in native voxels (spec §6.1). While
   *  the sidecar or index loads the draw is null and the region busy; after a failed load, idle. */
  frame(
    eye: Readonly<Vec3>,
    gatePxPerRad: number,
    frameIndex: number,
    nowMs: number,
  ): { readonly draw: DetailRegionDraw | null; readonly busy: boolean };
  /** attachRegion(id, null), then the stream's destroy (which destroys the store and texture). */
  destroy(): void;
};
