import { describe, expect, it } from 'vitest';

import { horizonAngleOfByte } from '../../../../src/layers/body/surfaceTiles/horizon/utils/horizonAngleOfByte';
import type { HeightPyramid } from '../../../../tools/textures/surfaceHorizon/@types/HeightPyramid';
import { bakeHorizonTile } from '../../../../tools/textures/surfaceHorizon/bakeHorizonTile';

const MOON_RADIUS_M = 1_737_400;
const DEG = Math.PI / 180;
// z10: 1024 columns of 128 lattice cells; tile row 256 starts on the equator, column 512 at lon 0.
const Z = 10;
const STEP_RAD = (360 / (1024 * 128)) * DEG;
const POST_M = STEP_RAD * MOON_RADIUS_M;
const RIDGE_M = 100;
const RIDGE_DISTANCE_M = 10 * POST_M;
const RIDGE_WIDTH_RAD = 0.01;
const ONE_BYTE_DEG = 30 / 204;
// The flat sphere's horizon sits a hair under 0°: byte round(3/30·204) = 20.
const FLAT_BYTE = 20;

// Raw texel offsets, written out rather than read through horizonTexelOf: sector 0 (north) is
// texel (0,0) R, 4 (east) (1,0) R, 8 (south) (0,1) R, 12 (west) (1,1) R.
const NORTH = [0, 0] as const;
const EAST = [1, 0] as const;
const SOUTH = [0, 1] as const;
const WEST = [1, 1] as const;

function redAt(rgba: Uint8Array, i: number, j: number, [dx, dy]: readonly [number, number]) {
  return rgba[((2 * j + dy) * 66 + 2 * i + dx) * 4]!;
}

function inBand(rad: number, fromRad: number): boolean {
  return rad >= fromRad && rad < fromRad + RIDGE_WIDTH_RAD;
}

function pyramid(
  heightAt: HeightPyramid['heightAt'],
  ceilingM: (x: number) => number = () => RIDGE_M,
): HeightPyramid {
  return { radiusM: MOON_RADIUS_M, heightAt, subtreeMaxM: (_z, x) => ceilingM(x) };
}

function bakedImage(source: HeightPyramid, x: number, y: number): Uint8Array {
  return bakeHorizonTile(source, Z, x, y).rgba;
}

function analyticDeg(heightM: number, distanceM: number): number {
  return Math.atan2(heightM - distanceM ** 2 / (2 * MOON_RADIUS_M), distanceM) / DEG;
}

describe('bakeHorizonTile', () => {
  it('a ridge on a sphere shades its anti-sun side at the analytic angle', () => {
    // Post (0,0) sits at lon 0 on the equator; a north–south ridge's near face is 10 posts east
    // of it, half a post before the sample the march lands on.
    const ridgeFrom = (RIDGE_DISTANCE_M - POST_M / 2) / MOON_RADIUS_M;
    const rgba = bakedImage(
      pyramid((_z, lon) => (inBand(lon, ridgeFrom) ? RIDGE_M : 0)),
      512,
      256,
    );
    const east = horizonAngleOfByte(redAt(rgba, 0, 0, EAST));
    expect(Math.abs(east - analyticDeg(RIDGE_M, RIDGE_DISTANCE_M))).toBeLessThan(ONE_BYTE_DEG);
    expect(redAt(rgba, 0, 0, WEST)).toBe(FLAT_BYTE);
  });

  it('north is up the meridian and post rows run south', () => {
    // Post (0,2) sits 8 lattice posts south of the equator; an east–west ridge starts 10 posts
    // north of it. A flipped row order puts the post on the ridge; a negated north looks away.
    const rgba = bakedImage(
      pyramid((_z, _lon, lat) => (inBand(lat, 1.5 * STEP_RAD) ? RIDGE_M : 0)),
      512,
      256,
    );
    const north = horizonAngleOfByte(redAt(rgba, 0, 2, NORTH));
    expect(Math.abs(north - analyticDeg(RIDGE_M, RIDGE_DISTANCE_M))).toBeLessThan(ONE_BYTE_DEG);
    expect(redAt(rgba, 0, 2, SOUTH)).toBe(FLAT_BYTE);
  });

  it("a flat sphere's horizon stays under the 1° flat-tile threshold", () => {
    const flat = pyramid(
      () => -1200,
      () => -1200,
    );
    expect(bakeHorizonTile(flat, Z, 512, 256).maxDeg).toBeLessThan(1);
  });

  it('the march reads past the tile edge', () => {
    // Tile x = 511 ends at lon 0, which is also its z3 ancestor's east edge. Post (30,0) sits
    // 8 lattice posts west of it; the ridge starts 10 posts east of the post, in the next tile
    // and the next z3 tile, which alone holds ground that high.
    const rgba = bakedImage(
      pyramid(
        (_z, lon) => (inBand(lon, 1.5 * STEP_RAD) ? RIDGE_M : 0),
        (x) => (x === 4 ? RIDGE_M : 0),
      ),
      511,
      256,
    );
    const east = horizonAngleOfByte(redAt(rgba, 30, 0, EAST));
    expect(Math.abs(east - analyticDeg(RIDGE_M, RIDGE_DISTANCE_M))).toBeLessThan(ONE_BYTE_DEG);
  });

  it('the far field reads coarser levels', () => {
    // A 1 km ridge 150 posts east that only levels coarser than the tile's hold: steps there
    // are ~6 posts long, so the march reads z8. Sample spacing blurs the angle by ~0.2°.
    const farM = 150 * POST_M;
    const rgba = bakedImage(
      pyramid(
        (z, lon) => (z < Z && inBand(lon, farM / MOON_RADIUS_M) ? 1000 : 0),
        () => 1000,
      ),
      512,
      256,
    );
    const east = horizonAngleOfByte(redAt(rgba, 0, 0, EAST));
    expect(Math.abs(east - analyticDeg(1000, farM))).toBeLessThan(0.5);
  });
});
