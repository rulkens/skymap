import { describe, expect, it } from 'vitest';

import { surfaceTileColumns } from '../../../src/utils/surfaceTiles/surfaceTileColumns';
import { equirectUvToDirection } from '../../../src/utils/math/equirectUvToDirection';
import { patchOriginRelEyeM } from '../../../src/utils/surfaceTiles/patchOriginRelEyeM';
import { surfacePatchAnchor } from '../../../src/utils/surfaceTiles/surfacePatchAnchor';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';

/** The walk's own uv footprint for tile `(z, x, y)` — `cutSurfaceTiles.ts:131-141`. */
function tileFootprint(z: number, x: number, y: number) {
  const cols = surfaceTileColumns(z, EARTH_TILE_PX);
  const rows = cols / 2;
  return { u0: x / cols, u1: (x + 1) / cols, v0: 1 - (y + 1) / rows, v1: 1 - y / rows };
}

describe('patchOriginRelEyeM', () => {
  it("lands on the uv corner direction the walk's own convention names", () => {
    // Levels 0 and 1 are useless here and deliberately absent: the base raster
    // is 512 px wide, so z0 is a single column with HALF a row, and every z1
    // tile's v0 is the south-pole edge, where the direction is (0, 0, -1)
    // whatever the longitude — a flipped TEXTURE_PRIME_MERIDIAN_U, which
    // rotates the Earth 180° about the pole, sails straight through.
    for (const [z, x, y] of [
      [2, 3, 0],
      [6, 41, 17],
    ] as const) {
      const { u0, v0, u1, v1 } = tileFootprint(z, x, y);
      const anchor = surfacePatchAnchor(u0, v0, u1, v1);
      const origin = patchOriginRelEyeM(anchor, 1, [0, 0, 0]);
      // The far corner walks the anchor by its two spans, so `dLonRad` and
      // `dLatRad` are pinned against the same authority the origin is — a
      // wrong factor has nowhere else to show up until the shader is built on
      // it. Swapping the two is NOT catchable and needs no test: the raster is
      // 2:1 and rows are cols/2, so every tile's two spans are equal.
      const far = patchOriginRelEyeM(
        {
          ...anchor,
          lon0Rad: anchor.lon0Rad + anchor.dLonRad,
          lat0Rad: anchor.lat0Rad + anchor.dLatRad,
        },
        1,
        [0, 0, 0],
      );
      const wantOrigin = equirectUvToDirection([u0, v0]);
      const wantFar = equirectUvToDirection([u1, v1]);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(origin[c]! - wantOrigin[c]!)).toBeLessThanOrEqual(1e-7);
        expect(Math.abs(far[c]! - wantFar[c]!)).toBeLessThanOrEqual(1e-7);
      }
    }
  });

  it('composes from the f32-rounded anchor, not the f64 one', () => {
    // None of these three is f32-exact, which is the point: the shader's frame
    // is built from the f32 words, so the CPU origin must be too (spec §7.1).
    const lon0Rad = (12.523 * Math.PI) / 180;
    const lat0Rad = (55.663 * Math.PI) / 180;
    const radiusM = 6378137.123;
    const anchor = { lon0Rad, lat0Rad, dLonRad: 1e-5, dLatRad: 1e-5 };
    const eye: [number, number, number] = [1234.5, -6789.25, 4321.125];

    const compose = (r: number, lon: number, lat: number): [number, number, number] => [
      r * Math.cos(lat) * Math.cos(lon) - eye[0],
      r * Math.cos(lat) * Math.sin(lon) - eye[1],
      r * Math.sin(lat) - eye[2],
    ];

    const got = patchOriginRelEyeM(anchor, radiusM, eye);
    expect(got).toEqual(compose(Math.fround(radiusM), Math.fround(lon0Rad), Math.fround(lat0Rad)));

    // A test that passed either way would not be testing the contract: the
    // unrounded composition is the ~0.13 m per-patch shift that means cracks.
    const unrounded = compose(radiusM, lon0Rad, lat0Rad);
    const drift = Math.hypot(got[0] - unrounded[0], got[1] - unrounded[1], got[2] - unrounded[2]);
    expect(drift).toBeGreaterThan(0.01);
  });
});
