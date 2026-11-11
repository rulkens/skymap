/**
 * Tests for the tier-target helpers — the single source of truth for
 * "how many galaxies do we keep per source per tier?".
 *
 * Per-source caps live on `APP_SOURCE_REGISTRY[source].tierTargets` with
 * three encodings:
 *   - missing key  → no cap (use the full source unchanged)
 *   - 0            → exclude this source entirely from this tier
 *   - positive N   → keep the brightest N by absolute magnitude
 *
 * These three cases are tested against each tier so the build pipeline
 * and the runtime hot-swap can rely on consistent semantics.
 */

import { describe, expect, it } from 'vitest';
import {
  tierTarget,
  tierFilenameForSource,
} from '../../../../../src/layers/galaxyCatalog/records/data/tierTargets';

describe('tierTarget', () => {
  it('small tier excludes SDSS and caps GLADE at 256k', () => {
    expect(tierTarget('sdss', 'small')).toBe(0);
    expect(tierTarget('glade', 'small')).toBe(256_000);
  });

  it('small tier keeps 2MRS and Famous uncapped (returns undefined)', () => {
    expect(tierTarget('2mrs', 'small')).toBeUndefined();
    expect(tierTarget('famousGalaxy', 'small')).toBeUndefined();
  });

  it('returns undefined for non-galaxy catalog sources (structures cannot be subsampled)', () => {
    expect(tierTarget('galaxy-cluster', 'medium')).toBeUndefined();
    expect(tierTarget('supercluster', 'small')).toBeUndefined();
    expect(tierTarget('void', 'large')).toBeUndefined();
  });
});

describe('tierFilenameForSource', () => {
  it('emits per-tier filenames for subsampled sources (SDSS, GLADE)', () => {
    expect(tierFilenameForSource('sdss', 'small')).toBe('galaxy-catalog/v10/sdss-small.bin');
    expect(tierFilenameForSource('sdss', 'medium')).toBe('galaxy-catalog/v10/sdss-medium.bin');
    expect(tierFilenameForSource('sdss', 'large')).toBe('galaxy-catalog/v10/sdss-large.bin');
    expect(tierFilenameForSource('glade', 'medium')).toBe('galaxy-catalog/v10/glade-medium.bin');
  });

  it('emits the shared filename for tier-agnostic sources (2MRS, Famous)', () => {
    expect(tierFilenameForSource('2mrs', 'small')).toBe('galaxy-catalog/v10/2mrs.bin');
    expect(tierFilenameForSource('2mrs', 'large')).toBe('galaxy-catalog/v10/2mrs.bin');
    expect(tierFilenameForSource('famousGalaxy', 'medium')).toBe('galaxy-catalog/v10/famous.bin');
  });
});
