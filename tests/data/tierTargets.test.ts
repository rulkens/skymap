/**
 * Tests for the tierTargets table — the single source of truth for "how many
 * galaxies do we keep per source per tier?".
 *
 * The table is deliberately a `Partial<Record<Source, number>>` per tier:
 *   - missing key  → no cap (use the full source unchanged)
 *   - 0            → exclude this source entirely from this tier
 *   - positive N   → keep the brightest N by absolute magnitude
 *
 * These three cases are tested against each tier so the build pipeline and
 * the runtime hot-swap can rely on consistent semantics.
 */

import { describe, expect, it } from 'vitest';
import { Source } from '../../src/data/sources';
import { TIER_TARGETS, tierFilenameForSource } from '../../src/data/tierTargets';

describe('TIER_TARGETS', () => {
  it('small tier excludes SDSS and caps GLADE at 256k', () => {
    expect(TIER_TARGETS.small[Source.SDSS]).toBe(0);
    expect(TIER_TARGETS.small[Source.Glade]).toBe(256_000);
  });

  it('small tier keeps 2MRS and Famous uncapped (key absent)', () => {
    expect(TIER_TARGETS.small).not.toHaveProperty(String(Source.TwoMRS));
    expect(TIER_TARGETS.small).not.toHaveProperty(String(Source.Famous));
  });

  it('medium tier caps SDSS at ~156k and GLADE at ~400k', () => {
    expect(TIER_TARGETS.medium[Source.SDSS]).toBe(156_000);
    expect(TIER_TARGETS.medium[Source.Glade]).toBe(400_000);
  });

  it('large tier has no caps for any source', () => {
    expect(Object.keys(TIER_TARGETS.large)).toEqual([]);
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
    expect(tierFilenameForSource(Source.Famous, 'medium')).toBe('famous.bin');
  });
});

describe('tierFilenameForSource — Milliquas', () => {
  it('returns tier-suffixed filenames for medium/large', () => {
    // Milliquas is tiered like SDSS and GLADE — every tier produces a
    // distinct on-disk file because the brightest-N subsample is
    // different at each cap.  Suffixed names let the three variants
    // coexist on the static host.
    expect(tierFilenameForSource(Source.Milliquas, 'medium')).toBe(
      'milliquas-medium.bin',
    );
    expect(tierFilenameForSource(Source.Milliquas, 'large')).toBe(
      'milliquas-large.bin',
    );
  });
});

describe('TIER_TARGETS — Milliquas', () => {
  it('excludes Milliquas from the small tier (mobile budget)', () => {
    // Same shape as SDSS small: the mobile GPU budget can't accommodate
    // another ~10^5 instanced points on top of the existing GLADE small
    // sample, so the small tier ships without quasars.
    expect(TIER_TARGETS.small[Source.Milliquas]).toBe(0);
  });

  it('caps Milliquas at 200k in the medium tier', () => {
    expect(TIER_TARGETS.medium[Source.Milliquas]).toBe(200_000);
  });

  it('keeps Milliquas uncapped in the large tier (key absent)', () => {
    expect(TIER_TARGETS.large).not.toHaveProperty(String(Source.Milliquas));
  });
});
