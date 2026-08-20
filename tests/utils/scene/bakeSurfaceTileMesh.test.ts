import { describe, it, expect } from 'vitest';

import { bakeSurfaceTileMesh } from '../../../src/utils/scene/bakeSurfaceTileMesh';
import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';

// A single fixture tile shared across tests below: z=3, x=1, y=1 (cols=8,
// rows=4). Its uv footprint — u:[0.125,0.25], v:[0.5,0.75] — touches
// neither pole and isn't centred on the prime meridian, so it exercises
// the general (asymmetric) case rather than a degenerate one.
const TILE_ID = { z: 3, x: 1, y: 1 };
const RESOLUTION = 4;

describe('bakeSurfaceTileMesh', () => {
  it('produces (resolution+1)^2 vertices and resolution^2 * 6 indices', () => {
    const mesh = bakeSurfaceTileMesh(TILE_ID, RESOLUTION);
    const vertexCount = (RESOLUTION + 1) ** 2;
    expect(mesh.positions.length).toBe(vertexCount * 3);
    expect(mesh.uvs.length).toBe(vertexCount * 2);
    expect(mesh.tangents.length).toBe(vertexCount * 3);
    expect(mesh.indices.length).toBe(RESOLUTION * RESOLUTION * 6);
  });

  it('corner uvs are image-space: (0,1)/(1,1)/(0,0)/(1,0), v=0 at the NORTH edge', () => {
    const mesh = bakeSurfaceTileMesh(TILE_ID, RESOLUTION);
    const row = RESOLUTION + 1;
    const uvAt = (idx: number): [number, number] => [mesh.uvs[idx * 2]!, mesh.uvs[idx * 2 + 1]!];
    // j=0 is the tile's SOUTH edge (mesh-v min); image-space v is 1 there.
    expect(uvAt(0)).toEqual([0, 1]);
    expect(uvAt(RESOLUTION)).toEqual([1, 1]);
    // j=RESOLUTION is the tile's NORTH edge (mesh-v max); image-space v is 0.
    expect(uvAt(RESOLUTION * row)).toEqual([0, 0]);
    expect(uvAt(row * row - 1)).toEqual([1, 0]);
  });

  it('positions are origin-relative: vertex 0 is exactly [0,0,0], every other vertex stays within a small multiple of the tile angular extent', () => {
    const mesh = bakeSurfaceTileMesh(TILE_ID, RESOLUTION);
    expect([mesh.positions[0], mesh.positions[1], mesh.positions[2]]).toEqual([0, 0, 0]);

    // Hand-computed bound, NOT a re-derivation of the bake's grid loop: any
    // two points inside a tile's own [u0,u1]x[v0,v1] uv box are within one
    // tile-width delta = 2*PI/cols of each other in longitude and in
    // latitude (u and v boxes are equal-sized here: v-height = 1/rows =
    // 2/cols = u-width * 2... rows = cols/2, so 1/rows = 2/cols = u-width).
    // A geodesic between them is no longer than a constant-lat-then-lon
    // path of length <= delta*cosLat + delta <= 2*delta (cosLat <= 1), and
    // for unit vectors chord length <= geodesic length. 2*delta is a loose
    // but genuine bound: a forgotten origin-subtraction would regress
    // magnitudes toward whole-sphere scale (up to 2), well past it.
    const cols = earthTileColumns(TILE_ID.z, EARTH_TILE_PX);
    const bound = 2 * ((2 * Math.PI) / cols);
    const vertexCount = (RESOLUTION + 1) ** 2;
    for (let v = 0; v < vertexCount; v++) {
      const mag = Math.hypot(
        mesh.positions[v * 3]!,
        mesh.positions[v * 3 + 1]!,
        mesh.positions[v * 3 + 2]!,
      );
      expect(mag, `vertex ${v} magnitude`).toBeLessThan(bound);
    }
  });

  it('curvature: the centre vertex deviates from the flat bilinear interpolation of the four corners by a hand-computed sagitta', () => {
    const mesh = bakeSurfaceTileMesh(TILE_ID, RESOLUTION);
    const row = RESOLUTION + 1;
    const half = RESOLUTION / 2;
    const at = (i: number, j: number): [number, number, number] => {
      const idx = j * row + i;
      return [mesh.positions[idx * 3]!, mesh.positions[idx * 3 + 1]!, mesh.positions[idx * 3 + 2]!];
    };
    const c00 = at(0, 0);
    const c10 = at(RESOLUTION, 0);
    const c01 = at(0, RESOLUTION);
    const c11 = at(RESOLUTION, RESOLUTION);
    const bilinear: [number, number, number] = [
      (c00[0] + c10[0] + c01[0] + c11[0]) / 4,
      (c00[1] + c10[1] + c01[1] + c11[1]) / 4,
      (c00[2] + c10[2] + c01[2] + c11[2]) / 4,
    ];
    const centre = at(half, half);
    const deviation = Math.hypot(
      centre[0] - bilinear[0],
      centre[1] - bilinear[1],
      centre[2] - bilinear[2],
    );

    // Hand-computed independently (not by calling bakeSurfaceTileMesh):
    // for uv corners (u0,v0)=(0.125,0.5), (u1,v0)=(0.25,0.5),
    // (u0,v1)=(0.125,0.75), (u1,v1)=(0.25,0.75) mapped through
    // dir(u,v) = (cosLat*cos(lon), cosLat*sin(lon), sinLat),
    // lon=(u-0.5)*2*PI, lat=(v-0.5)*PI:
    //   c00 = (-sqrt2/2, -sqrt2/2, 0)
    //   c10 = (0, -1, 0)
    //   c01 = (-0.5, -0.5, sqrt2/2)
    //   c11 = (0, -sqrt2/2, sqrt2/2)
    //   bilinear average = (-0.301776695, -0.728553391, 0.353553391)
    //   true centre (uMid,vMid)=(0.1875,0.625) = (-0.353553391, -0.853553391, 0.382683432)
    //   |centre - bilinear| = 0.1383993696136963
    // (7 digits, not more: positions round-trip through Float32Array.)
    expect(deviation).toBeCloseTo(0.1383993696136963, 7);
    expect(deviation).toBeGreaterThan(0); // proves genuine curvature, not corner-lerp
  });
});
