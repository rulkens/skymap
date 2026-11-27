import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import type { BrickBox } from '../@types/BrickBox';

/** Every brick's coordinates inside `box`, x fastest; `hi` exclusive. */
export function bricksOf(box: BrickBox): Vec3[] {
  const coords: Vec3[] = [];
  for (let z = box.lo[2]; z < box.hi[2]; z++)
    for (let y = box.lo[1]; y < box.hi[1]; y++)
      for (let x = box.lo[0]; x < box.hi[0]; x++) coords.push([x, y, z]);
  return coords;
}
