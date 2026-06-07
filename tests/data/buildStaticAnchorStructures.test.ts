/**
 * Tests for `buildStaticAnchorStructures` — the shared id + worldPos builder
 * that backs both the structure store's `anchors` group and the React-side
 * `#poi=<id>` deep-link drain.
 *
 * The interesting invariant is the id rule: the URL hash codec
 * (`parsePoiHash`) accepts `[a-z0-9_-]+`, and the drain looks up the
 * pending id verbatim against the structure table.  We assert that the
 * emitted ids match the seed's curated `id` field prefixed by category,
 * including entries whose display names contain non-ASCII characters
 * (Boötes Void → `void-bootes-void` from seed id, not `bo-tes-void`
 * from a naive slug).
 *
 * No DOM — this is pure data assembly, so it runs in the project's
 * default `node` vitest environment with no extra setup.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildStaticAnchorStructures } from '../../src/data/buildStaticAnchorStructures';
import structureSeedJson from '../../data/structure_anchors.seed.json';
import { raDecDistToEqCart } from '../../src/utils/math/raDecDistToEqCart';

describe('buildStaticAnchorStructures', () => {
  it('emits one structure per seed entry across all four categories', () => {
    const pois = buildStaticAnchorStructures();
    expect(pois.length).toBe(structureSeedJson.length);
  });

  it('produces URL-safe ids by prefixing the category to the seed id field', () => {
    const pois = buildStaticAnchorStructures();
    const byName = new Map(pois.map((p) => [p.name, p.id]));
    // Ids come from the curated seed `id` field, not a runtime slug —
    // so they're stable regardless of display-name punctuation or encoding.
    expect(byName.get('Virgo (M87)')).toBe('cluster-virgo-m87');
    expect(byName.get('Coma (A1656)')).toBe('cluster-coma-a1656');
    expect(byName.get('Laniakea SC')).toBe('supercluster-laniakea-sc');
    // The seed id is `bootes-void` (curated ASCII), so the POI id is
    // `void-bootes-void` — not the slug `bo-tes-void` that a naive
    // [^a-z0-9] strip of 'Boötes' would produce.
    expect(byName.get('Boötes Void')).toBe('void-bootes-void');
    // Entries whose seed id differs from slug(names[0]):
    expect(byName.get('Leo Cluster')).toBe('cluster-leo-a1367');
    expect(byName.get('Corona Borealis Supercluster')).toBe('supercluster-corona-borealis-sc');
    expect(byName.get('Pisces-Cetus Supercluster')).toBe('supercluster-pisces-cetus-sc');
  });

  it('carries physicalRadiusMpc through from the seed', () => {
    const pois = buildStaticAnchorStructures();
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87');
    // StructureRecord carries the radius on every arm — no narrowing needed.
    expect(virgo?.physicalRadiusMpc).toBe(2.2);
  });

  it('carries apparentRadiusMpc through from the seed', () => {
    const pois = buildStaticAnchorStructures();
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87');
    expect(virgo?.apparentRadiusMpc).toBe(6);
  });

  it('carries the curated description through from the seed', () => {
    const pois = buildStaticAnchorStructures();
    // Assert against the seed's own value (not a hardcoded string) so the
    // test stays green when the curated blurbs are rewritten — it verifies
    // the carry-through wiring, not the prose.
    const seedVirgo = (structureSeedJson as readonly { id: string; description?: string }[]).find(
      (e) => e.id === 'virgo-m87',
    )!;
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87')!;
    expect(virgo.description).toBe(seedVirgo.description);
    expect(virgo.description).toBeTruthy();
  });

  it('is synchronous and returns a fresh array per call', () => {
    const a = buildStaticAnchorStructures();
    const b = buildStaticAnchorStructures();
    // Fresh array each call (so a mutating caller can't corrupt a shared
    // instance) but structurally identical — the build is deterministic.
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('surfaces the abell designation on a featured cluster', () => {
    const pois = buildStaticAnchorStructures();
    const coma = pois.find((p) => p.id === 'cluster-coma-a1656');
    // Narrow to the cluster arm — `abell` lives there alone.
    const abell = coma && coma.category === 'cluster' ? coma.abell : undefined;
    expect(abell).toBe('A1656');
    // Virgo has no seed `abell`, so the field is absent (not undefined-keyed)
    // even on the cluster arm.
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87');
    expect(virgo && 'abell' in virgo).toBe(false);
    // The non-cluster arms structurally cannot carry an `abell` field.
    const aVoid = pois.find((p) => p.id === 'void-bootes-void');
    expect(aVoid && 'abell' in aVoid).toBe(false);
  });

  it('marks every static anchor as featured', () => {
    const pois = buildStaticAnchorStructures();
    expect(pois.length).toBeGreaterThan(0);
    expect(pois.every((p) => p.featured === true)).toBe(true);
  });

  it('assigns the correct category per anchor list', () => {
    const pois = buildStaticAnchorStructures();
    const cats = new Set(pois.map((p) => p.category));
    expect(cats.has('cluster')).toBe(true);
    expect(cats.has('supercluster')).toBe(true);
    expect(cats.has('void')).toBe(true);
    expect(cats.has('group')).toBe(true);
    // No other categories sneak in.
    expect(cats.size).toBe(4);
  });
});

/**
 * Group-entry mapping — isolated describe block so the vi.doMock + dynamic
 * import pattern doesn't affect the module cache shared by the tests above.
 *
 * The real seed now carries group entries, but this block keeps an isolated
 * synthetic fixture (injected via vi.doMock before a dynamic import) so the
 * id/category/worldPos wiring is asserted against a single known entry rather
 * than coupling to whichever groups happen to be seeded.
 */
describe('buildStaticAnchorStructures — group seed entry mapping', () => {
  it('maps a group seed entry to a GroupRecord with the correct id, category, featured, and worldPos', async () => {
    // Inline fixture — mirrors the shape of a real seed entry.
    const groupFixture = {
      id: 'local-group',
      names: ['Local Group'],
      category: 'group' as const,
      raHours: 10.67,
      decDeg: 41.27,
      distMpc: 0.78,
      physicalRadiusMpc: 0.5,
      apparentRadiusMpc: 1.0,
    };

    // Inject only our fixture into the seed so the whole output is one entry.
    // `resetModules` busts the ESM cache so the dynamic import below
    // re-evaluates `buildStaticAnchorStructures` (already statically imported
    // at the top of this file) and picks up the mocked seed — `doMock` alone
    // does not invalidate an already-loaded module.
    vi.resetModules();
    vi.doMock('../../data/structure_anchors.seed.json', () => ({
      default: [groupFixture],
    }));

    // Dynamic import after resetModules + doMock so this load sees the mock.
    const { buildStaticAnchorStructures: buildWithGroupSeed } =
      await import('../../src/data/buildStaticAnchorStructures');

    const pois = buildWithGroupSeed();
    expect(pois.length).toBe(1);
    const poi = pois[0]!;

    expect(poi.id).toBe('group-local-group');
    expect(poi.category).toBe('group');
    expect(poi.featured).toBe(true);
    // worldPos must match the independent conversion of the same ra/dec/dist —
    // asserting this verifies the carry-through wiring, not just the discriminant.
    expect(poi.worldPos).toEqual(raDecDistToEqCart(groupFixture));

    vi.doUnmock('../../data/structure_anchors.seed.json');
    vi.resetModules();
  });
});
