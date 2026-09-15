import { describe, expect, it } from 'vitest';

import { lonLatToUtm32 } from '../../../../tools/utils/geo/lonLatToUtm32';

describe('lonLatToUtm32', () => {
  // The DHM/Terræn tile grid is named by SW-corner km indices in EPSG:25832
  // (`data/raw/dhm/README.md`), so "which tile holds this post" is exactly
  // this projection floored — a wrong zone or scale factor lands the sample
  // in a neighbouring 1 km tile and reads someone else's terrain.
  it('puts the Søndermarken anchor inside DHM tile 6175_721', () => {
    const { easting, northing } = lonLatToUtm32(12.53, 55.67);
    expect(Math.floor(easting / 1000)).toBe(721);
    expect(Math.floor(northing / 1000)).toBe(6175);
  });

  it('maps the central meridian at the equator to the false easting', () => {
    const { easting, northing } = lonLatToUtm32(9, 0);
    expect(easting).toBeCloseTo(500000, 6);
    expect(northing).toBeCloseTo(0, 6);
  });

  // cs2cs EPSG:4326 -> EPSG:25832 on the Søndermarken bbox corners,
  // `data/raw/dhm/README.md`'s "Tile list" block.
  it('agrees with cs2cs on the Søndermarken bbox corners', () => {
    const corners = [
      { lon: 12.51, lat: 55.662, easting: 720767.51, northing: 6174048.74 },
      { lon: 12.55, lat: 55.662, easting: 723282.22, northing: 6174176.84 },
      { lon: 12.51, lat: 55.678, easting: 720677.38, northing: 6175828.19 },
      { lon: 12.55, lat: 55.678, easting: 723191.05, northing: 6175956.25 },
    ];
    for (const c of corners) {
      const { easting, northing } = lonLatToUtm32(c.lon, c.lat);
      expect(easting).toBeCloseTo(c.easting, 1);
      expect(northing).toBeCloseTo(c.northing, 1);
    }
  });
});
