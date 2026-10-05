import { describe, expect, it } from 'vitest';

import type { IsisCubeRaster } from '../../../../tools/@types/image/IsisCubeRaster';
import { placeCubeInGlobe } from '../../../../tools/utils/image/placeCubeInGlobe';

const cube = (over: Partial<IsisCubeRaster>): IsisCubeRaster => ({
  data: Float32Array.from({ length: 8 }, (_, i) => i + 1),
  width: 4,
  height: 2,
  leftLonDeg: 0,
  topLatDeg: 90,
  degPerPixel: 90,
  equatorialRadiusM: 1,
  ...over,
});

describe('placeCubeInGlobe', () => {
  it('treats a globe whose label pixel scale is slightly rounded as a full globe', () => {
    // Ariel's DEM: 3652 px at a labelled 0.098599 deg/px spans 360.08 deg, not 360.
    const full = cube({ width: 40, height: 20, degPerPixel: 9.2, data: new Float32Array(800) });
    expect(placeCubeInGlobe(full)).toBe(full);
  });

  it('places a regional cube by its own latitude and longitude, NaN elsewhere', () => {
    // 4x2 globe at 90 deg/px; the cube covers lon -90..180 (3 cols) and lat 0..-90 (row 1).
    const g = placeCubeInGlobe(
      cube({ leftLonDeg: -90, topLatDeg: 0, width: 3, height: 1, data: Float32Array.of(7, 8, 9) }),
    );
    expect([g.width, g.height, g.leftLonDeg]).toEqual([4, 2, 0]);
    expect(Array.from(g.data.slice(0, 4))).toEqual([NaN, NaN, NaN, NaN]);
    // Column 0 is lon 0, so the cube's first column (lon -90) wraps to column 3.
    expect(Array.from(g.data.slice(4, 8))).toEqual([8, 9, NaN, 7]);
  });
});
