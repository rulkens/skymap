import { describe, it, expect } from 'vitest';
import {
  Source,
  SOURCE_REGISTRY,
  SURVEY_SOURCES,
  HI_RES_LAYER_COUNT,
  HI_RES_LAYER_SIDE_BY_TIER,
} from '../../src/data/sources';
import { ALL_VISIBLE_MASK, maskHas, maskWith, maskWithout } from '../../src/utils/sourceMask';

describe('Source.Famous', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.Famous).toBe(4);
  });

  it('appears in SURVEY_SOURCES', () => {
    expect(SURVEY_SOURCES).toContain(Source.Famous);
  });

  it('is included in ALL_VISIBLE_MASK', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.Famous)).toBe(true);
  });

  it('has a non-empty display label', () => {
    expect(SOURCE_REGISTRY[Source.Famous].label.length).toBeGreaterThan(0);
  });

  it('is treated as all-sky (cherry-picked entries from anywhere)', () => {
    expect(SOURCE_REGISTRY[Source.Famous].allSky).toBe(true);
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
    const entry = SOURCE_REGISTRY[Source.Famous];
    expect(entry.type).toBe('survey');
    if (entry.type === 'survey') expect(entry.bandLabels.g).toBeTruthy();
  });
});

describe('Source enum — POI codes (cluster/supercluster/void)', () => {
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.Cluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });

  it('keeps POI codes OUT of SURVEY_SOURCES (POIs are not survey sources)', () => {
    // The points-pipeline visibility bitmask iterates SURVEY_SOURCES. POIs
    // render through their own renderer (future clusterMarkerRenderer)
    // with its own per-category visibility logic, so listing them here
    // would muddy the meaning of "this bitmask filters survey galaxies."
    expect(SURVEY_SOURCES).not.toContain(Source.Cluster);
    expect(SURVEY_SOURCES).not.toContain(Source.Supercluster);
    expect(SURVEY_SOURCES).not.toContain(Source.Void);
  });

  it('ALL_VISIBLE_MASK covers default-visible survey sources only (no POI bits)', () => {
    // Default-visible survey bits: 0 (Synthetic), 1 (SDSS), 2 (2MRS),
    // 3 (Glade), 4 (Famous) = 0b11111.  Milliquas (bit 8) is in the
    // registry but its `visible` flag is false, so its bit stays clear.
    // POI codes 5/6/7 also stay clear so the survey draw loop doesn't
    // accidentally gate on them.
    expect(ALL_VISIBLE_MASK).toBe(0b11111);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Milliquas)).toBe(false);
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

describe('Famous-galaxy hi-res LOD constants', () => {
  it('HI_RES_LAYER_SIDE_BY_TIER pegs small to 512 and medium/large to 1024', () => {
    // Mobile (small) halves the layer dim to keep the GPU footprint at
    // 8 MB instead of 32 MB; desktop tiers (medium / large) share the
    // 1024 px source resolution the curator emits. See the spec's
    // "Tier-aware sizing" table at
    // docs/superpowers/specs/2026-05-28-famous-galaxy-high-res-lod-design.md.
    expect(HI_RES_LAYER_SIDE_BY_TIER.small).toBe(512);
    expect(HI_RES_LAYER_SIDE_BY_TIER.medium).toBe(1024);
    expect(HI_RES_LAYER_SIDE_BY_TIER.large).toBe(1024);
  });

  it('HI_RES_LAYER_COUNT is 8', () => {
    // Load-bearing: the texture_2d_array is sized
    // `HI_RES_LAYER_COUNT * HI_RES_LAYER_SIDE_BY_TIER[tier]^2 * 4 bytes`
    // at construction, and the memory budget in ADR 0002 (32 MB desktop /
    // 8 MB mobile) assumes N=8. Changing this changes the budget.
    expect(HI_RES_LAYER_COUNT).toBe(8);
  });
});
