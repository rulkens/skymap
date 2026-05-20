import { describe, it, expect } from 'vitest';
import {
  Source,
  SOURCE_REGISTRY,
  ALL_SOURCES,
  ALL_VISIBLE_MASK,
  sourceLabel,
  sourceIsAllSky,
  bandLabels,
  maskHas,
  maskWith,
  maskWithout,
} from '../../src/data/sources';

describe('Source.Famous', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.Famous).toBe(4);
  });

  it('appears in ALL_SOURCES', () => {
    expect(ALL_SOURCES).toContain(Source.Famous);
  });

  it('is included in ALL_VISIBLE_MASK', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.Famous)).toBe(true);
  });

  it('has a non-empty display label', () => {
    expect(sourceLabel(Source.Famous).length).toBeGreaterThan(0);
  });

  it('is treated as all-sky (cherry-picked entries from anywhere)', () => {
    expect(sourceIsAllSky(Source.Famous)).toBe(true);
  });

  it('has a sensible default max-distance for camera framing', () => {
    // Famous nearby galaxies span M31 (0.78 Mpc) to NGC 4889 (~94 Mpc);
    // pad to 200 Mpc so the camera frames the whole catalog comfortably.
    expect(SOURCE_REGISTRY[Source.Famous].maxDistMpc).toBeGreaterThanOrEqual(200);
  });

  it('exposes the SDSS-like band layout (curated metadata uses optical bands)', () => {
    // Curated entries don't carry photometry; the band layout is cosmetic
    // — InfoCard uses it to label colour rows. We mirror SDSS so the
    // existing FullCard markup renders cleanly without a new branch.
    const bands = bandLabels(Source.Famous);
    expect(bands.g).toBeTruthy();
  });
});

describe('Source enum — POI codes (cluster/supercluster/void)', () => {
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.Cluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });

  it('keeps POI codes OUT of ALL_SOURCES (POIs are not survey sources)', () => {
    // The points-pipeline visibility bitmask iterates ALL_SOURCES. POIs
    // render through their own renderer (future clusterMarkerRenderer)
    // with its own per-category visibility logic, so listing them here
    // would muddy the meaning of "this bitmask filters survey galaxies."
    expect(ALL_SOURCES).not.toContain(Source.Cluster);
    expect(ALL_SOURCES).not.toContain(Source.Supercluster);
    expect(ALL_SOURCES).not.toContain(Source.Void);
  });

  it('ALL_VISIBLE_MASK still covers only survey sources (no POI bits)', () => {
    // Survey-source bits: 0 (Synthetic), 1 (SDSS), 2 (2MRS), 3 (Glade),
    // 4 (Famous), 8 (Milliquas).  POI codes 5/6/7 stay clear so the
    // survey draw loop doesn't accidentally gate on them.
    expect(ALL_VISIBLE_MASK).toBe(0b100011111);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Cluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Supercluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Void)).toBe(false);
  });

  it('bitmask helpers still operate correctly on survey-source bits', () => {
    // Sanity: the bitmask infrastructure isn't disturbed by appending
    // new enum members that don't participate in the mask.
    expect(maskHas(maskWith(0, Source.SDSS), Source.SDSS)).toBe(true);
    expect(maskHas(maskWithout(ALL_VISIBLE_MASK, Source.Glade), Source.Glade)).toBe(false);
  });
});
