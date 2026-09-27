/**
 * readSlopeLattice — MOLA-post slopes at a fixed lattice level (design §5),
 * always `SLOPE_LEVEL` regardless of the caller's pyramid level, so the same
 * `g` field means the same thing at every zoom. Reads one post of margin
 * beyond `box` so its own edge posts get a true central difference.
 */
import type { HeightSource } from './HeightSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { slopeLatticeFromPosts } from '../utils/textures/slopeLatticeFromPosts';
import type { SlopeLattice } from './SlopeLattice';

export const SLOPE_LEVEL = 8;

export async function readSlopeLattice(
  height: HeightSource,
  box: LonLatBounds,
  radiusM: number,
): Promise<SlopeLattice> {
  const step = heightLatticeStepDeg(SLOPE_LEVEL);
  const iMin = Math.floor((box.west + 180) / step);
  const iMax = Math.ceil((box.east + 180) / step);
  const jMin = Math.floor((90 - box.north) / step);
  const jMax = Math.ceil((90 - box.south) / step);
  const nx = iMax - iMin + 1;
  const ny = jMax - jMin + 1;

  const posts = await height.readGrid(SLOPE_LEVEL, iMin - 1, jMin - 1, nx + 2, ny + 2);
  if (posts === null) {
    throw new Error(`readSlopeLattice: no height coverage for box ${JSON.stringify(box)}`);
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!Number.isFinite(posts[(j + 1) * (nx + 2) + (i + 1)]!)) {
        throw new Error(
          `readSlopeLattice: NaN height post inside box at i=${iMin + i}, j=${jMin + j}`,
        );
      }
    }
  }

  const withMargin = slopeLatticeFromPosts(
    posts,
    nx + 2,
    ny + 2,
    -180 + (iMin - 1) * step,
    90 - (jMin - 1) * step,
    step,
    radiusM,
  );

  // Crop the margin ring back off: it only got a one-sided difference and
  // exists solely to feed the box's own edge posts a true central one.
  const sx = new Float32Array(nx * ny);
  const sy = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const from = (j + 1) * (nx + 2) + (i + 1);
      const to = j * nx + i;
      sx[to] = withMargin.sx[from]!;
      sy[to] = withMargin.sy[from]!;
    }
  }
  return { west: -180 + iMin * step, north: 90 - jMin * step, stepDeg: step, nx, ny, sx, sy };
}
