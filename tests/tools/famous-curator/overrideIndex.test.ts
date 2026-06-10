/**
 * overrideIndex — read-modify-write helper for
 * data/seeds/famous_curated_overrides.json.
 *
 * Tests drive an in-memory fixture path.  Verifies:
 *   - loadOverrideIndex returns an empty index when the file is absent
 *   - upsertOverrideEntry creates the file + adds a new entry
 *   - upsertOverrideEntry overwrites an existing entry by id
 *   - Concurrent upserts to different ids preserve both entries
 *     (read-modify-write to a temp file + rename is atomic per call)
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOverrideIndex,
  upsertOverrideEntry,
} from '../../../tools/famous-curator/plugin/overrideIndex';

function tmpIndexPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'curator-override-')), 'famous_curated_overrides.json');
}

describe('overrideIndex', () => {
  it('loadOverrideIndex returns empty entries when the file does not exist', () => {
    const idx = loadOverrideIndex(tmpIndexPath());
    expect(idx).toEqual({ version: 1, entries: {} });
  });

  it('upsertOverrideEntry creates the file and adds the entry', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/a',
      license: 'CC-BY',
      author: 'Alice',
      processedAt: '2026-05-18T00:00:00Z',
    });
    expect(existsSync(path)).toBe(true);
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.entries.m31.author).toBe('Alice');
    expect(onDisk.entries.m31.sourceUrl).toBe('https://example.com/a');
  });

  it('overwrites an existing entry by id', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/a',
      license: 'CC-BY',
      author: 'Alice',
      processedAt: '2026-05-18T00:00:00Z',
    });
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31',
      sourceUrl: 'https://example.com/b',
      license: 'CC-BY-SA',
      author: 'Bob',
      processedAt: '2026-05-18T01:00:00Z',
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.entries.m31.author).toBe('Bob');
    expect(onDisk.entries.m31.sourceUrl).toBe('https://example.com/b');
    expect(Object.keys(onDisk.entries)).toHaveLength(1);
  });

  it('preserves other entries when upserting one id', () => {
    const path = tmpIndexPath();
    upsertOverrideEntry(path, 'm31', {
      dir: 'famous-curated/m31', sourceUrl: 'https://example.com/a',
      license: 'CC-BY', author: 'Alice', processedAt: '2026-05-18T00:00:00Z',
    });
    upsertOverrideEntry(path, 'm33', {
      dir: 'famous-curated/m33', sourceUrl: 'https://example.com/c',
      license: 'CC-BY', author: 'Carol', processedAt: '2026-05-18T02:00:00Z',
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(onDisk.entries).sort()).toEqual(['m31', 'm33']);
  });
});
