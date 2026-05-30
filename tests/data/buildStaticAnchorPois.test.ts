/**
 * Tests for `buildStaticAnchorPois` — the shared id-slug + worldPos
 * builder that backs both the engine's POI subsystem seed and the
 * React-side `#poi=<id>` deep-link drain.
 *
 * The interesting invariant is the id rule: the URL hash codec
 * (`parsePoiHash`) accepts `[a-z0-9_-]+`, and the drain looks up the
 * pending id verbatim against the POI table.  A drift between the
 * engine's stored ids and what the URL hook produces would silently
 * break deep-link resolution for any anchor whose name contains
 * punctuation.  We assert a handful of known names lower-kebab the
 * way the codec expects.
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

  it('produces URL-safe ids that lower-kebab the anchor name and prefix the category', () => {
    const pois = buildStaticAnchorPois();
    const byName = new Map(pois.map((p) => [p.name, p.id]));
    // Punctuation in the name should be collapsed to single dashes, with
    // leading / trailing dashes stripped — matches `parsePoiHash`'s
    // `[a-z0-9_-]+` accept set without a trailing hyphen.
    expect(byName.get('Virgo (M87)')).toBe('cluster-virgo-m87');
    expect(byName.get('Coma (A1656)')).toBe('cluster-coma-a1656');
    expect(byName.get('Laniakea SC')).toBe('supercluster-laniakea-sc');
    // Non-ASCII letters (`ö`) get collapsed by the `[^a-z0-9]+` strip,
    // leaving the surrounding ASCII letters intact — so 'Boötes' becomes
    // 'bo-tes', not 'b-tes' or 'bootes'.  The id still round-trips through
    // `parsePoiHash` (regex is /[a-z0-9_-]+/).
    expect(byName.get('Boötes Void')).toBe('void-bo-tes-void');
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
