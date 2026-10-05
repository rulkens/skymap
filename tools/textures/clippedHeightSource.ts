/**
 * clippedHeightSource — narrow a height source to `extent`: posts outside it
 * are NaN (the band's underfill takes them), and across the ring between
 * `extent` and `core` the posts blend from `underfill` to the source, so the
 * two surfaces never meet in a step. A coarse tile never scans a whole 1 m DTM.
 */

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { featherWeight } from '../utils/textures/featherWeight';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import type { HeightSource } from './@types/HeightSource';

/** Lattice indices of `extent`'s edges are integers whenever the edge sits on
 *  a coarser tile line, but float division can land a hair either side. */
const INDEX_EPSILON = 1e-9;

export function clippedHeightSource(
  source: HeightSource,
  /** Must be the band's own height underfill: its value IS the edge post. */
  underfill: HeightSource,
  extent: LonLatBounds,
  core: LonLatBounds,
): HeightSource {
  return {
    ...source,
    coverage: [extent],

    async readGrid(z, i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      // Inclusive on the edges: an edge post is shared with the tile beyond,
      // and both must read the same value there.
      const iLo = Math.max(i0, Math.ceil((extent.west + 180) / step - INDEX_EPSILON));
      const iHi = Math.min(i0 + nx - 1, Math.floor((extent.east + 180) / step + INDEX_EPSILON));
      const jLo = Math.max(j0, Math.ceil((90 - extent.north) / step - INDEX_EPSILON));
      const jHi = Math.min(j0 + ny - 1, Math.floor((90 - extent.south) / step + INDEX_EPSILON));
      if (iHi < iLo || jHi < jLo) return null;

      const innerWidth = iHi - iLo + 1;
      const innerHeight = jHi - jLo + 1;
      const inner = await source.readGrid(z, iLo, jLo, innerWidth, innerHeight);
      if (inner === null) return null;
      let under: Float32Array | null | undefined;
      const grid = new Float32Array(nx * ny).fill(Number.NaN);
      for (let j = jLo; j <= jHi; j++) {
        const lat = 90 - j * step;
        for (let i = iLo; i <= iHi; i++) {
          const k = (j - jLo) * innerWidth + (i - iLo);
          const weight = featherWeight(extent, core, -180 + i * step, lat);
          let value = inner[k]!;
          if (weight < 1) {
            under ??= await underfill.readGrid(z, iLo, jLo, innerWidth, innerHeight);
            const fill = under?.[k] ?? Number.NaN;
            value = weight === 0 ? fill : weight * value + (1 - weight) * fill;
          }
          grid[(j - j0) * nx + (i - i0)] = value;
        }
      }
      return grid;
    },

    async boundsInBox(box) {
      const west = Math.max(box.west, extent.west);
      const east = Math.min(box.east, extent.east);
      const south = Math.max(box.south, extent.south);
      const north = Math.min(box.north, extent.north);
      if (east < west || north < south) return null;
      return source.boundsInBox({ west, east, south, north });
    },
  };
}
