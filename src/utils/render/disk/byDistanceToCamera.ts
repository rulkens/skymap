import type { Vec3 } from '../../../@types/math/Vec3';

/** Minimal shape the comparator needs — any disk instance with a world position. */
type Positioned = { readonly x: number; readonly y: number; readonly z: number };

/**
 * byDistanceToCamera — a back-to-front `Array.sort` comparator for transparent
 * disk instances, bound to a fixed camera position.
 *
 * Alpha-blended disks must draw farthest-first so nearer disks composite over
 * the ones behind them. The comparator orders by *squared* distance to the
 * camera (no square root needed — ordering is monotonic in the square) and
 * returns `distB² − distA²`, which is positive when B is farther, sorting the
 * farther disk earlier.
 *
 * A factory (closing over `camPos`) rather than a bare comparator so the camera
 * coordinates are read once per frame, not per comparison; both planners build
 * one per frame and hand it to `sort`. Generic over any `{x,y,z}` so it serves
 * both `DiskInstance` and `ProceduralDiskInstance`.
 */
export function byDistanceToCamera<T extends Positioned>(camPos: Vec3): (a: T, b: T) => number {
  const cx = camPos[0];
  const cy = camPos[1];
  const cz = camPos[2];
  return (a, b) => {
    const dax = a.x - cx;
    const day = a.y - cy;
    const daz = a.z - cz;
    const dbx = b.x - cx;
    const dby = b.y - cy;
    const dbz = b.z - cz;
    return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
  };
}
