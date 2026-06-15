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

  it('medium tier caps SDSS at ~156k and GLADE at ~400k', () => {
    expect(tierTarget(Source.SDSS, 'medium')).toBe(156_000);
    expect(tierTarget(Source.Glade, 'medium')).toBe(400_000);
  });

  it('large tier has no caps for any source', () => {
    expect(tierTarget(Source.SDSS, 'large')).toBeUndefined();
    expect(tierTarget(Source.Glade, 'large')).toBeUndefined();
    expect(tierTarget(Source.Milliquas, 'large')).toBeUndefined();
  });

  it('returns undefined for non-galaxy catalog sources (structures cannot be subsampled)', () => {
    expect(tierTarget(Source.Cluster, 'medium')).toBeUndefined();
    expect(tierTarget(Source.Supercluster, 'small')).toBeUndefined();
    expect(tierTarget(Source.Void, 'large')).toBeUndefined();
  });
});

describe('tierFilenameForSource', () => {
  it('emits per-tier filenames for subsampled sources (SDSS, GLADE)', () => {
    expect(tierFilenameForSource(Source.SDSS, 'small')).toBe('sdss-small.bin');
    expect(tierFilenameForSource(Source.SDSS, 'medium')).toBe('sdss-medium.bin');
    expect(tierFilenameForSource(Source.SDSS, 'large')).toBe('sdss-large.bin');
    expect(tierFilenameForSource(Source.Glade, 'medium')).toBe('glade-medium.bin');
  });

  it('emits the shared filename for tier-agnostic sources (2MRS, Famous)', () => {
    expect(tierFilenameForSource(Source.TwoMRS, 'small')).toBe('2mrs.bin');
    expect(tierFilenameForSource(Source.TwoMRS, 'large')).toBe('2mrs.bin');
    expect(tierFilenameForSource(Source.FamousGalaxy, 'medium')).toBe('famous.bin');
  });
});

describe('tierFilenameForSource — Milliquas', () => {
  it('returns tier-suffixed filenames for medium/large', () => {
    // Milliquas is tiered like SDSS and GLADE — every tier produces a
    // distinct on-disk file because the brightest-N subsample is
    // different at each cap.  Suffixed names let the three variants
    // coexist on the static host.
    expect(tierFilenameForSource(Source.Milliquas, 'medium')).toBe('milliquas-medium.bin');
    expect(tierFilenameForSource(Source.Milliquas, 'large')).toBe('milliquas-large.bin');
  });
});

describe('tierTarget — Milliquas', () => {
  it('excludes Milliquas from the small tier (mobile budget)', () => {
    // Same shape as SDSS small: the mobile GPU budget can't accommodate
    // another ~10^5 instanced points on top of the existing GLADE small
    // sample, so the small tier ships without quasars.
    expect(tierTarget(Source.Milliquas, 'small')).toBe(0);
  });

  it('caps Milliquas at 200k in the medium tier', () => {
    expect(tierTarget(Source.Milliquas, 'medium')).toBe(200_000);
  });

  it('keeps Milliquas uncapped in the large tier (undefined)', () => {
    expect(tierTarget(Source.Milliquas, 'large')).toBeUndefined();
  });
});
