import { describe, it, expect } from 'vitest';
import { structureMemberCount } from '../../../../../src/layers/galaxyCatalog/structureMembership/utils/structureMemberCount';
import { Source } from '../../../../../src/data/source';
import { galaxyCatalogIdOf } from '../../../../../src/utils/galaxyCatalogIdOf';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { galaxyRecordsOver } from '../../../../support/galaxyRecordsOver';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../../../src/@types/data/SourceType';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';

/** The visible catalogs covering the two catalogs this file's fixtures populate. */
const SDSS_AND_TWOMRS = new Set([galaxyCatalogIdOf(Source.SDSS), galaxyCatalogIdOf(Source.TwoMRS)]);
const SDSS_ONLY = new Set([galaxyCatalogIdOf(Source.SDSS)]);

/**
 * Minimal GalaxyCatalog from (x,y,z) tuples — only `positions`/`count` are
 * read by the cone search; the rest are zero-filled to satisfy the shape.
 * Mirrors the helper in structureMembership.test.ts.
 */
function makeCatalog(positions: ReadonlyArray<readonly [number, number, number]>): GalaxyCatalog {
  const count = positions.length;
  const flat = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    flat[i * 3 + 0] = positions[i]![0];
    flat[i * 3 + 1] = positions[i]![1];
    flat[i * 3 + 2] = positions[i]![2];
  }
  return makeGalaxyCatalog(count, { positions: flat });
}

/** A cluster at the origin with a 10 Mpc core radius. */
const cluster: StructureInfo = {
  type: 'structure',
  id: 'test-cluster',
  name: 'Test Cluster',
  category: 'galaxy-cluster',
  worldPos: [0, 0, 0],
  featured: true,
  physicalRadiusMpc: 10,
};

/** The flat record sources over a per-source catalog map. */
function cloudFrom(map: Partial<Record<SourceType, GalaxyCatalog>>) {
  return galaxyRecordsOver(
    new Map(
      Object.entries(map).map(([source, catalog]) => [Number(source) as SourceType, catalog]),
    ),
  );
}

describe('structureMemberCount', () => {
  it('counts galaxies inside the sphere across visible galaxy catalogs', () => {
    const getCloud = cloudFrom({
      [Source.SDSS]: makeCatalog([
        [1, 0, 0],
        [2, 0, 0],
        [100, 0, 0],
      ]), // 2 inside
      [Source.TwoMRS]: makeCatalog([
        [0, 3, 0],
        [0, 200, 0],
      ]), // 1 inside
    });
    expect(structureMemberCount(cluster, getCloud, SDSS_AND_TWOMRS)).toBe(3);
  });

  it('excludes galaxy catalogs toggled off in the visibility mask', () => {
    const getCloud = cloudFrom({
      [Source.SDSS]: makeCatalog([
        [1, 0, 0],
        [2, 0, 0],
      ]), // 2 inside
      [Source.TwoMRS]: makeCatalog([
        [0, 1, 0],
        [0, 2, 0],
      ]), // 2 inside, but hidden
    });
    expect(structureMemberCount(cluster, getCloud, SDSS_ONLY)).toBe(2);
  });

  it('returns 0 for a genuinely empty sphere over loaded data', () => {
    const getCloud = cloudFrom({
      [Source.SDSS]: makeCatalog([
        [100, 0, 0],
        [200, 0, 0],
      ]),
    });
    expect(structureMemberCount(cluster, getCloud, SDSS_AND_TWOMRS)).toBe(0);
  });

  it('prefers apparentRadiusMpc over physicalRadiusMpc for the cone', () => {
    // Galaxy at r=8: outside the 5 Mpc core, inside the 12 Mpc apparent extent.
    const wide: StructureInfo = {
      ...cluster,
      physicalRadiusMpc: 5,
      apparentRadiusMpc: 12,
    };
    const getCloud = cloudFrom({ [Source.SDSS]: makeCatalog([[8, 0, 0]]) });
    expect(structureMemberCount(wide, getCloud, SDSS_ONLY)).toBe(1);
    // With no apparent extent, the same galaxy falls outside the 5 Mpc core.
    expect(structureMemberCount({ ...cluster, physicalRadiusMpc: 5 }, getCloud, SDSS_ONLY)).toBe(0);
  });
});
