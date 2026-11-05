/**
 * voidFilledHeightSource — wrap a deep PRIMARY height source so its NaN posts
 * (source voids, tile gaps, nodata) take a coarser FALLBACK's value instead.
 * Every post of a baked tile must be finite (`encodeHeightTile` refuses
 * otherwise), so a band whose source has holes needs this rather than a sentinel.
 */

import type { HeightSource } from './@types/HeightSource';

export function voidFilledHeightSource(
  primary: HeightSource,
  fallback: HeightSource,
): HeightSource {
  return {
    id: `${primary.id}+${fallback.id}`,
    attribution: `${primary.attribution} Void fill: ${fallback.attribution}`,
    maxLevel: primary.maxLevel,
    coverage: primary.coverage,
    provenance: {
      sourceId: `${primary.provenance.sourceId}+${fallback.provenance.sourceId}`,
      attribution: `${primary.provenance.attribution} Void fill: ${fallback.provenance.attribution}`,
      vintage: primary.provenance.vintage,
    },

    async readGrid(z, i0, j0, nx, ny) {
      const grid = await primary.readGrid(z, i0, j0, nx, ny);
      if (grid === null) return fallback.readGrid(z, i0, j0, nx, ny);
      if (grid.every(Number.isFinite)) return grid;

      const filler = await fallback.readGrid(z, i0, j0, nx, ny);
      if (filler === null) return grid;
      for (let k = 0; k < grid.length; k++) {
        if (!Number.isFinite(grid[k])) grid[k] = filler[k]!;
      }
      return grid;
    },

    async boundsInBox(box) {
      // The union, not the primary's: which posts fall back is not known
      // without sampling, and a header bound may be conservative but never
      // narrower than the data it covers.
      const [a, b] = await Promise.all([primary.boundsInBox(box), fallback.boundsInBox(box)]);
      if (a === null) return b;
      if (b === null) return a;
      return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
    },
  };
}
