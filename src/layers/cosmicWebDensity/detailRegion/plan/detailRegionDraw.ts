/**
 * detailRegionDraw — the planner's state as the volume march reads it (spec §6.3): brick boxes to
 * the stored box's local [0,1]³. Every box is inset half a native voxel so the linear filter never
 * reads past it into a toroidal neighbour slot; faces clamp to dims first, because the last
 * z brick layer is zero-padded past the data. A missing box (null) is zero-sized, since a ray–box
 * slab test reads an inverted box as a real one.
 */
import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import { VOLUME_BRICK_EDGE } from '../../../../data/volume/volumeBrickEdge';
import type { BrickBox } from '../@types/BrickBox';
import type { DetailRegionGeometry } from '../@types/DetailRegionGeometry';
import type { DetailRegionState } from '../@types/DetailRegionState';

/** null out of reach or with neither a settled box nor a fade: a first fill fades in (spec §8). */
export function detailRegionDraw(
  state: DetailRegionState,
  geometry: DetailRegionGeometry,
): DetailRegionDraw | null {
  const { settled, fade } = state;
  if (!state.inReach || (!settled && !fade)) return null;
  const { dims, bricksPerAxis } = geometry;
  const local = (box: BrickBox | null, side: 'lo' | 'hi'): Vec3 => {
    if (!box) return [0, 0, 0];
    const inset = side === 'lo' ? 0.5 : -0.5;
    return box[side].map(
      (b, a) => (Math.min(b * VOLUME_BRICK_EDGE, dims[a]!) + inset) / dims[a]!,
    ) as Vec3;
  };
  return {
    settledLo: local(settled, 'lo'),
    settledHi: local(settled, 'hi'),
    texScale: dims.map((d) => d / (bricksPerAxis * VOLUME_BRICK_EDGE)) as Vec3,
    voxelMpc: geometry.voxelMpc,
    fade: fade && {
      intoLo: local(fade.into, 'lo'),
      intoHi: local(fade.into, 'hi'),
      outLo: local(fade.out, 'lo'),
      outHi: local(fade.out, 'hi'),
      w: fade.w,
    },
  };
}
