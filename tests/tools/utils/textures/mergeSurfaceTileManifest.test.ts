import { describe, expect, it } from 'vitest';

import { mergeSurfaceTileManifest } from '../../../../tools/utils/textures/mergeSurfaceTileManifest';
import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../../../src/@types/scene/SurfaceTileManifestBand';

const PREFIX = 'earth-tiles/v9';
const BOUNDS_A = { west: -180, east: 0, south: -90, north: 90 };
const BOUNDS_B = { west: 0, east: 180, south: -90, north: 90 };
const BOUNDS_C = { west: -45, east: 45, south: -20, north: 20 };

function band(
  bounds: SurfaceTileManifestBand['bounds'],
  min: number,
  max: number,
  builtFrom: SurfaceTileManifestBand['builtFrom'],
): SurfaceTileManifestBand {
  return { bounds, min, max, builtFrom };
}

function manifest(bands: readonly SurfaceTileManifestBand[]): SurfaceTileManifest {
  return { prefix: PREFIX, tilePx: 512, bands: [...bands] };
}

describe('mergeSurfaceTileManifest', () => {
  it('an albedo-only run keeps the prior height provenance', () => {
    const albedoProv = { sourceId: 'bmng', attribution: 'bmng attribution', vintage: 'v2' };
    const heightProv = { sourceId: 'etopo', attribution: 'etopo attribution', vintage: 'v1' };
    const prior = manifest([
      band(BOUNDS_A, 0, 7, {
        albedo: { sourceId: 'bmng', attribution: 'bmng attribution', vintage: 'v1' },
        height: heightProv,
      }),
    ]);
    const run = manifest([band(BOUNDS_A, 0, 7, { albedo: albedoProv })]);

    const merged = mergeSurfaceTileManifest(prior, run);

    expect(merged.bands).toEqual([
      band(BOUNDS_A, 0, 7, { albedo: albedoProv, height: heightProv }),
    ]);
  });

  it('a run with one band keeps the other bands, in the prior order', () => {
    const provA = { sourceId: 'a', attribution: 'a', vintage: 'v1' };
    const provB = { sourceId: 'b', attribution: 'b', vintage: 'v1' };
    const provC = { sourceId: 'c', attribution: 'c', vintage: 'v1' };
    const provCRun = { sourceId: 'c', attribution: 'c', vintage: 'v2' };
    const prior = manifest([
      band(BOUNDS_A, 0, 7, { albedo: provA }),
      band(BOUNDS_B, 8, 13, { albedo: provB }),
      band(BOUNDS_C, 14, 19, { albedo: provC }),
    ]);
    const run = manifest([band(BOUNDS_C, 14, 19, { albedo: provCRun })]);

    const merged = mergeSurfaceTileManifest(prior, run);

    expect(merged.bands).toEqual([
      band(BOUNDS_A, 0, 7, { albedo: provA }),
      band(BOUNDS_B, 8, 13, { albedo: provB }),
      band(BOUNDS_C, 14, 19, { albedo: provCRun }),
    ]);
  });

  it('a new band is appended', () => {
    const provA = { sourceId: 'a', attribution: 'a', vintage: 'v1' };
    const provB = { sourceId: 'b', attribution: 'b', vintage: 'v1' };
    const prior = manifest([band(BOUNDS_A, 0, 7, { albedo: provA })]);
    const run = manifest([
      band(BOUNDS_A, 0, 7, { albedo: provA }),
      band(BOUNDS_B, 8, 13, { albedo: provB }),
    ]);

    const merged = mergeSurfaceTileManifest(prior, run);

    expect(merged.bands).toEqual([
      band(BOUNDS_A, 0, 7, { albedo: provA }),
      band(BOUNDS_B, 8, 13, { albedo: provB }),
    ]);
  });

  it('a prior with another prefix is dropped', () => {
    const priorProv = { sourceId: 'old', attribution: 'old', vintage: 'v1' };
    const runProv = { sourceId: 'new', attribution: 'new', vintage: 'v2' };
    const prior: SurfaceTileManifest = {
      prefix: 'earth-tiles/v8',
      tilePx: 512,
      bands: [band(BOUNDS_A, 0, 7, { albedo: priorProv })],
    };
    const run = manifest([band(BOUNDS_A, 0, 7, { albedo: runProv })]);

    const merged = mergeSurfaceTileManifest(prior, run);

    expect(merged).toEqual(run);
  });

  it('no prior manifest passes the run through unchanged', () => {
    const run = manifest([
      band(BOUNDS_A, 0, 7, { albedo: { sourceId: 'a', attribution: 'a', vintage: 'v1' } }),
    ]);

    expect(mergeSurfaceTileManifest(null, run)).toEqual(run);
  });
});
