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
    expect(virgo?.physicalRadiusMpc).toBe(2.2);
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
