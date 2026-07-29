import { describe, it, expect } from 'vitest';
import {
  Source,
  SOURCE_REGISTRY,
  GALAXY_CATALOG_SOURCES,
  HI_RES_LAYER_COUNT,
  HI_RES_LAYER_SIDE_BY_TIER,
} from '../../src/data/sources';
import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';
import { LABEL_CATEGORIES } from '../../src/data/structure/labelCategories';
import { DEFAULT_FLOW } from '../../src/data/defaults';
import { ALL_VISIBLE_MASK } from '../../src/utils/allVisibleMask';
import { maskHas } from '../../src/utils/maskHas';

describe('Source.FamousGalaxy', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.FamousGalaxy).toBe(4);
  });

  it('appears in GALAXY_CATALOG_SOURCES', () => {
    expect(GALAXY_CATALOG_SOURCES).toContain(Source.FamousGalaxy);
  });

  it('is included in ALL_VISIBLE_MASK', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.FamousGalaxy)).toBe(true);
  });

  it('has a non-empty display label', () => {
    expect(SOURCE_REGISTRY[Source.FamousGalaxy].label.length).toBeGreaterThan(0);
  });

  it('is treated as all-sky (cherry-picked entries from anywhere)', () => {
    expect(SOURCE_REGISTRY[Source.FamousGalaxy].allSky).toBe(true);
  });

  it('has a sensible default max-distance for camera framing', () => {
    // Famous nearby galaxies span M31 (0.78 Mpc) to NGC 4889 (~94 Mpc);
    // pad to 200 Mpc so the camera frames the whole catalog comfortably.
    expect(SOURCE_REGISTRY[Source.FamousGalaxy].maxDistMpc).toBeGreaterThanOrEqual(200);
  });

  it('exposes the SDSS-like band layout (curated metadata uses optical bands)', () => {
    // Curated entries don't carry photometry; the band layout is cosmetic
    // — InfoCard uses it to label colour rows. We mirror SDSS so the
    // existing FullCard markup renders cleanly without a new branch.
    const entry = SOURCE_REGISTRY[Source.FamousGalaxy];
    expect(entry.type).toBe('galaxyCatalog');
    if (entry.type === 'galaxyCatalog') expect(entry.bandLabels.g).toBeTruthy();
  });
});

describe('SOURCE_REGISTRY ids', () => {
  const ids = Object.values(SOURCE_REGISTRY).map((e) => e.id);

  it('every entry carries a non-empty id', () => {
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('ids are unique across the registry', () => {
    // The id is the single home for each source's readable key — domain
    // types (StructureId, visibility records, volume handles) derive
    // from it, so a collision would silently merge two sources downstream.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('STRUCTURE_IDS is exactly the four structure ids', () => {
    // STRUCTURE_IDS derives from the registry's type:'structure' rows,
    // so this pins the registry's structure set — accidentally dropping or
    // renaming a structure source (or mistyping an id) trips this guard.
    expect([...STRUCTURE_IDS].sort()).toEqual(['cluster', 'group', 'supercluster', 'void']);
  });
});

describe('Source enum — structure codes (cluster/supercluster/void)', () => {
  it('appends Cluster=5, Supercluster=6, Void=7 to the enum', () => {
    expect(Source.Cluster).toBe(5);
    expect(Source.Supercluster).toBe(6);
    expect(Source.Void).toBe(7);
  });

  it('keeps structure codes OUT of GALAXY_CATALOG_SOURCES (structures are not galaxy catalog sources)', () => {
    // The points-pipeline visibility bitmask iterates GALAXY_CATALOG_SOURCES. Structures
    // render through their own renderer (structureMarkerRenderer)
    // with its own per-category visibility logic, so listing them here
    // would muddy the meaning of "this bitmask filters galaxy catalog galaxies."
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Cluster);
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Supercluster);
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Void);
  });

  it('ALL_VISIBLE_MASK covers default-visible galaxy catalog sources only (no structure bits)', () => {
    // Default-visible galaxy catalog bits: 0 (Synthetic), 1 (SDSS), 2 (2MRS),
    // 3 (Glade), 4 (Famous), 8 (Milliquas) = 0b100011111. Milliquas ships on
    // by default now that the quasar source is stable. The DESI patches —
    // DesiDeep (bit 18), DesiWedge (bit 19), and DesiSgw (bit 20) — are
    // deliberately CLEAR: all three drill geometries are specialist opt-in
    // overlays, not part of the all-sky default scene, so their bits stay off.
    // Structure codes 5/6/7 stay clear so the galaxy catalog draw loop
    // doesn't accidentally gate on them.
    expect(ALL_VISIBLE_MASK).toBe(0b100011111);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Milliquas)).toBe(true);
    expect(maskHas(ALL_VISIBLE_MASK, Source.DesiDeep)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.DesiWedge)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.DesiSgw)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Cluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Supercluster)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Void)).toBe(false);
  });
});

describe('Source enum — star-catalog code (survey-wide Gaia bin)', () => {
  it('appends GaiaStars=24 to the enum', () => {
    // Registry-key-only code (not persisted, not pickable); appended after
    // the three body codes (FamousStar=21, Planet=22, Earth=23). Never
    // renumber the codes below it.
    expect(Source.GaiaStars).toBe(24);
  });

  it('keeps GaiaStars OUT of GALAXY_CATALOG_SOURCES', () => {
    // Load-bearing behavioural invariant: the survey-wide Gaia stars render
    // through their own star renderer, gated by the star-catalog crossfade
    // band — NOT the galaxy-catalog points-pipeline visibility bitmask. If
    // this code ever joined GALAXY_CATALOG_SOURCES the stars would be OR'd
    // into ALL_VISIBLE_MASK and toggled by the galaxy-catalog draw loop,
    // silently coupling two independent visibility systems.
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.GaiaStars);
  });
});

describe('Registry capability flags — bearsLabel / bearsMarker', () => {
  it('famousGalaxy row bears a label but no marker', () => {
    const entry = SOURCE_REGISTRY[Source.FamousGalaxy];
    expect(entry.bearsLabel).toBe(true);
    expect(entry.bearsMarker).toBe(false);
    expect(entry.labelLayer).toBe('galaxy');
  });

  it('structure rows bear both a label and a marker', () => {
    // The four structure source ids — verified correct in STRUCTURE_IDS test above.
    const structureIds = [Source.Cluster, Source.Supercluster, Source.Void, Source.Group] as const;
    for (const id of structureIds) {
      const entry = SOURCE_REGISTRY[id];
      expect(entry.bearsLabel).toBe(true);
      expect(entry.bearsMarker).toBe(true);
      expect(entry.labelLayer).toBe('structure');
    }
  });

  it('bulk galaxy catalog rows bear neither a label nor a marker', () => {
    const galaxyCatalogIds = [Source.SDSS, Source.Glade] as const;
    for (const id of galaxyCatalogIds) {
      const entry = SOURCE_REGISTRY[id];
      expect(entry.bearsLabel).toBe(false);
      expect(entry.bearsMarker).toBe(false);
    }
  });
});

describe('Famous-galaxy hi-res LOD constants', () => {
  it('HI_RES_LAYER_SIDE_BY_TIER pegs small to 512 and medium/large to 1024', () => {
    // Mobile (small) halves the layer dim to keep the GPU footprint at
    // 8 MB instead of 32 MB; desktop tiers share the 1024 px source
    // resolution the curator emits.
    expect(HI_RES_LAYER_SIDE_BY_TIER.small).toBe(512);
    expect(HI_RES_LAYER_SIDE_BY_TIER.medium).toBe(1024);
    expect(HI_RES_LAYER_SIDE_BY_TIER.large).toBe(1024);
  });

  it('HI_RES_LAYER_COUNT is 8', () => {
    // Load-bearing: texture_2d_array is sized
    // `HI_RES_LAYER_COUNT * HI_RES_LAYER_SIDE_BY_TIER[tier]^2 * 4 bytes`,
    // and the 32 MB desktop / 8 MB mobile budget assumes N=8.
    expect(HI_RES_LAYER_COUNT).toBe(8);
  });
});

describe('Source enum — overlay codes (milkyWay/flow)', () => {
  it('appends MilkyWay=16 and Flow=17 to the enum', () => {
    // Registry-key-only codes (not persisted, not pickable); appended after
    // the debug-volume codes — never renumber the codes below them.
    expect(Source.MilkyWay).toBe(16);
    expect(Source.Flow).toBe(17);
  });

  it('keeps overlay codes OUT of GALAXY_CATALOG_SOURCES', () => {
    // Overlays render through their own renderers, not the points pipeline's
    // visibility bitmask.
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.MilkyWay);
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Flow);
  });

  it('keeps overlay bits clear of ALL_VISIBLE_MASK (galaxy-catalog-only)', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.MilkyWay)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Flow)).toBe(false);
  });

  it('LABEL_CATEGORIES includes milkyWay', () => {
    expect(LABEL_CATEGORIES).toContain('milkyWay');
  });

  it('flow row is a default-off overlay carrying the look/motion defaults', () => {
    const entry = SOURCE_REGISTRY[Source.Flow];
    expect(entry.type).toBe('flow');
    expect(entry.id).toBe('flow');
    expect(entry.visible).toBe(false);
    expect(entry.mode).toBe('advect');
    expect(entry.count).toBeGreaterThan(0);
    expect(entry.binBaseName).toBe('flowfield');
  });

  it('DEFAULT_FLOW is seeded from the registry flow row', () => {
    // The registry row is the single source of truth; DEFAULT_FLOW just
    // assembles its fields into the settings shape.
    const entry = SOURCE_REGISTRY[Source.Flow];
    expect(DEFAULT_FLOW.enabled).toBe(entry.visible);
    expect(DEFAULT_FLOW.mode).toBe(entry.mode);
    expect(DEFAULT_FLOW.count).toBe(entry.count);
    expect(DEFAULT_FLOW.boundaryFadeWidth).toBe(entry.boundaryFadeWidth);
  });
});

describe('Source enum — body codes (famousStar/planet/earth)', () => {
  it('appends FamousStar=21, Planet=22, Earth=23 to the enum', () => {
    // Registry-key-only codes (not persisted, not pickable); the three body
    // codes are contiguous after the DESI patches. FamousStar/Planet fill the
    // 21/22 slots the Earth comment reserved; Earth stays 23 (append-only by
    // VALUE — insertion order in the const is cosmetic). Never renumber below.
    expect(Source.FamousStar).toBe(21);
    expect(Source.Planet).toBe(22);
    expect(Source.Earth).toBe(23);
  });

  it('planet/earth are label-bearing, marker-free body rows', () => {
    // Bodies caption themselves on the final descent, so `bearsLabel` — a
    // CAPABILITY flag — is true and `labelLayer` routes those captions to the
    // NEAR0 foreground layer instead of the COSMO label director. They carry no
    // ring, so the marker flag stays false.
    const bodyRows = [
      [Source.Planet, 'planet'],
      [Source.Earth, 'earth'],
    ] as const;
    for (const [code, id] of bodyRows) {
      const entry = SOURCE_REGISTRY[code];
      expect(entry.type).toBe('body');
      expect(entry.id).toBe(id);
      expect(entry.bearsLabel).toBe(true);
      expect(entry.labelLayer).toBe('body');
      expect(entry.bearsMarker).toBe(false);
    }
  });

  it('keeps famousStar/planet/earth OUT of GALAXY_CATALOG_SOURCES', () => {
    // Bodies render through their own content-layer, not the points
    // pipeline's visibility bitmask.
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.FamousStar);
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Planet);
    expect(GALAXY_CATALOG_SOURCES).not.toContain(Source.Earth);
  });

  it('keeps the famousStar/planet/earth bits clear of ALL_VISIBLE_MASK', () => {
    // ALL_VISIBLE_MASK is the OR of default-visible galaxy-catalog rows only,
    // so a body code never lands in it.
    expect(maskHas(ALL_VISIBLE_MASK, Source.FamousStar)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Planet)).toBe(false);
    expect(maskHas(ALL_VISIBLE_MASK, Source.Earth)).toBe(false);
  });
});
