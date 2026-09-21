/**
 * constantHeightSource — a `HeightSource` returning one fixed elevation
 * everywhere: the global band's underfill, since `etopoHeightSource` maps its
 * GeoTIFF's NODATA sentinel to NaN rather than a finite value, and one such
 * pixel would otherwise abort a long bake at `bakeHeightLevel`'s finiteness assert.
 */

import type { HeightSource } from './@types/HeightSource';

const WHOLE_GLOBE = [{ west: -180, east: 180, south: -90, north: 90 }] as const;

export function constantHeightSource(valueM: number): HeightSource {
  return {
    id: `constant-${valueM}m`,
    attribution: 'synthetic constant elevation (void fill only, not a real source)',
    maxLevel: Number.POSITIVE_INFINITY,
    coverage: WHOLE_GLOBE,
    provenance: {
      sourceId: `constant-${valueM}m`,
      attribution: 'synthetic constant elevation (void fill only, not a real source)',
      vintage: 'n/a',
    },
    async readGrid(_z, _i0, _j0, nx, ny) {
      return new Float32Array(nx * ny).fill(valueM);
    },
    async boundsInBox() {
      return [valueM, valueM];
    },
  };
}
