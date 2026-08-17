import { describe, it, expect } from 'vitest';
import { resolveFeaturedEntries } from '../../../../src/components/CommandPalette/utils/resolveFeaturedEntries';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';

// Minimal famous-entry fixture keyed by id — the resolver only reads `id`,
// the rest are filled to satisfy the type.
function entry(id: string): FamousGalaxyMetaEntry {
  return { id, names: [id], description: '', type: '' };
}

describe('resolveFeaturedEntries', () => {
  it('preserves FEATURED_IDS order (m31 before m51), not input order', () => {
    // Feed them reversed; the resolver should re-order by the curated list.
    const result = resolveFeaturedEntries([entry('m51'), entry('m31')]);
    const ids = result.map((e) => e.id);
    expect(ids.indexOf('m31')).toBeLessThan(ids.indexOf('m51'));
  });

  it('silently drops ids missing from the catalog', () => {
    // 'not-a-real-id' is not in FEATURED_IDS, so it never appears; only the
    // featured 'm31' survives.
    const result = resolveFeaturedEntries([entry('m31'), entry('not-a-real-id')]);
    expect(result.map((e) => e.id)).toEqual(['m31']);
  });

  it('returns [] for empty input', () => {
    expect(resolveFeaturedEntries([])).toEqual([]);
  });
});
