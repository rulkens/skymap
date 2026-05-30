/**
 * Tests for `buildStaticAnchorPois` — the shared id + worldPos builder
 * that backs both the engine's POI subsystem seed and the React-side
 * `#poi=<id>` deep-link drain.
 *
 * The interesting invariant is the id rule: the URL hash codec
 * (`parsePoiHash`) accepts `[a-z0-9_-]+`, and the drain looks up the
 * pending id verbatim against the POI table.  We assert that the
 * emitted ids match the seed's curated `id` field prefixed by category,
 * including entries whose display names contain non-ASCII characters
 * (Boötes Void → `void-bootes-void` from seed id, not `bo-tes-void`
 * from a naive slug).
 *
 * No DOM — this is pure data assembly, so it runs in the project's
 * default `node` vitest environment with no extra setup.
 */

import { describe, it, expect } from 'vitest';
import { buildStaticAnchorPois } from '../../src/data/buildStaticAnchorPois';
import clusterSeedJson from '../../data/cluster_anchors.seed.json';

describe('buildStaticAnchorPois', () => {
  it('emits one POI per seed entry across all three categories', () => {
    const pois = buildStaticAnchorPois();
    expect(pois.length).toBe(clusterSeedJson.length);
  });

  it('produces URL-safe ids by prefixing the category to the seed id field', () => {
    const pois = buildStaticAnchorPois();
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
    const pois = buildStaticAnchorPois();
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87');
    // Narrow off the famousGalaxy arm so the radius field is in scope —
    // static anchors are always extended structures.
    const radius = virgo && virgo.category !== 'famousGalaxy' ? virgo.physicalRadiusMpc : undefined;
    expect(radius).toBe(2.2);
  });

  it('carries apparentRadiusMpc through from the seed', () => {
    const pois = buildStaticAnchorPois();
    const virgo = pois.find((p) => p.id === 'cluster-virgo-m87');
    // Same narrow as the physical-radius test: static anchors are always
    // extended structures, so the apparent-radius field is in scope.
    const radius =
      virgo && virgo.category !== 'famousGalaxy' ? virgo.apparentRadiusMpc : undefined;
    expect(radius).toBe(6);
  });

  it('is synchronous and returns a fresh array per call', () => {
    const a = buildStaticAnchorPois();
    const b = buildStaticAnchorPois();
    // Fresh array each call (so a mutating caller can't corrupt a shared
    // instance) but structurally identical — the build is deterministic.
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('surfaces the abell designation on a featured cluster', () => {
    const pois = buildStaticAnchorPois();
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

  it('marks every static anchor POI as featured', () => {
    const pois = buildStaticAnchorPois();
    expect(pois.length).toBeGreaterThan(0);
    expect(pois.every((p) => p.featured === true)).toBe(true);
  });

  it('assigns the correct category per anchor list', () => {
    const pois = buildStaticAnchorPois();
    const cats = new Set(pois.map((p) => p.category));
    expect(cats.has('cluster')).toBe(true);
    expect(cats.has('supercluster')).toBe(true);
    expect(cats.has('void')).toBe(true);
    // No other categories sneak in.
    expect(cats.size).toBe(3);
  });
});
