import type { HorizonTexel } from '../@types/HorizonTexel';

/** horizonTexelOf — sector k's place in its post's 2×2 block: texels in row-major order,
 *  four sectors each in RGBA order. The shader reads through this same rule (Task 6). */
export function horizonTexelOf(sector: number): HorizonTexel {
  return {
    dx: ((sector >> 2) & 1) as 0 | 1,
    dy: ((sector >> 3) & 1) as 0 | 1,
    channel: (sector & 3) as 0 | 1 | 2 | 3,
  };
}
