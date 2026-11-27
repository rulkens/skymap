/**
 * detailRegionDraw — the planner's state as the volume march reads it (spec §6.3): brick boxes to
 * the stored box's local [0,1]³. Every box is inset half a native voxel so the linear filter never
 * reads past it into a toroidal neighbour slot; an empty box stays zero-sized, since an inset would
 * invert it and a ray–box slab test reads an inverted box as a real one.
 */
import type { DetailRegionDraw } from '../../../../@types/rendering/DetailRegionDraw';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { VOLUME_BRICK_EDGE } from '../../../../data/volume/volumeBrickEdge';
import type { BrickBox } from '../@types/BrickBox';
import type { DetailRegionGeometry } from '../@types/DetailRegionGeometry';
import type { DetailRegionState } from '../@types/DetailRegionState';
import { isEmptyBrickBox } from '../utils/isEmptyBrickBox';

/** null out of reach or before anything settled; during a first fill only the fade has boxes. */
export function detailRegionDraw(
  state: DetailRegionState,
  geometry: DetailRegionGeometry,
): DetailRegionDraw | null {
  const { settled, fade } = state;
  if (!state.inReach || (!settled && !fade)) return null;
  const { dims, bricksPerAxis } = geometry;
  const local = (box: BrickBox | null, side: 'lo' | 'hi'): Vec3 => {
    if (!box || isEmptyBrickBox(box)) return [0, 0, 0];
    const inset = side === 'lo' ? 0.5 : -0.5;
    return box[side].map((b, a) => (b * VOLUME_BRICK_EDGE + inset) / dims[a]!) as Vec3;
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
