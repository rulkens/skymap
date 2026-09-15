/**
 * Tests for the tier-target helpers — the single source of truth for
 * "how many galaxies do we keep per source per tier?".
 *
 * Per-source caps live on `SOURCE_REGISTRY[source].tierTargets` with
 * three encodings:
 *   - missing key  → no cap (use the full source unchanged)
 *   - 0            → exclude this source entirely from this tier
 *   - positive N   → keep the brightest N by absolute magnitude
 *
 * These three cases are tested against each tier so the build pipeline
 * and the runtime hot-swap can rely on consistent semantics.
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { tierTarget, tierFilenameForSource } from '../../src/data/tierTargets';

describe('tierTarget', () => {
  it('small tier excludes SDSS and caps GLADE at 256k', () => {
    expect(tierTarget(Source.SDSS, 'small')).toBe(0);
    expect(tierTarget(Source.Glade, 'small')).toBe(256_000);
  });

  it('small tier keeps 2MRS and Famous uncapped (returns undefined)', () => {
    expect(tierTarget(Source.TwoMRS, 'small')).toBeUndefined();
    expect(tierTarget(Source.FamousGalaxy, 'small')).toBeUndefined();
  });

  it('returns undefined for non-galaxy catalog sources (structures cannot be subsampled)', () => {
    expect(tierTarget(Source.Cluster, 'medium')).toBeUndefined();
    expect(tierTarget(Source.Supercluster, 'small')).toBeUndefined();
    expect(tierTarget(Source.Void, 'large')).toBeUndefined();
  });
});

describe('tierFilenameForSource', () => {
  it('emits per-tier filenames for subsampled sources (SDSS, GLADE)', () => {
    expect(tierFilenameForSource(Source.SDSS, 'small')).toBe('galaxy-catalog/v9/sdss-small.bin');
    expect(tierFilenameForSource(Source.SDSS, 'medium')).toBe('galaxy-catalog/v9/sdss-medium.bin');
    expect(tierFilenameForSource(Source.SDSS, 'large')).toBe('galaxy-catalog/v9/sdss-large.bin');
    expect(tierFilenameForSource(Source.Glade, 'medium')).toBe(
      'galaxy-catalog/v9/glade-medium.bin',
    );
  });

  it('emits the shared filename for tier-agnostic sources (2MRS, Famous)', () => {
    expect(tierFilenameForSource(Source.TwoMRS, 'small')).toBe('galaxy-catalog/v9/2mrs.bin');
    expect(tierFilenameForSource(Source.TwoMRS, 'large')).toBe('galaxy-catalog/v9/2mrs.bin');
    expect(tierFilenameForSource(Source.FamousGalaxy, 'medium')).toBe(
      'galaxy-catalog/v9/famous.bin',
    );
  });
});
