/**
 * famousCuratedOverrides — wrapper around the curator's override JSON,
 * used by fetchFamousImages.ts to short-circuit the Wikipedia/DESI chain
 * for hand-curated galaxies.
 *
 * Returns an empty index when the file is absent, so first-time clones
 * (or contributors who never run the curator) don't fail with ENOENT.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCuratedOverrides } from '../../../tools/famous/famousCuratedOverrides';

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'famous-cur-overrides-')), 'famous_curated_overrides.json');
}

describe('loadCuratedOverrides', () => {
  it('returns an empty index when the file does not exist', () => {
    const idx = loadCuratedOverrides(tmpPath());
    expect(idx).toEqual({ version: 1, entries: {} });
  });

  it('parses an existing index', () => {
    const path = tmpPath();
    writeFileSync(path, JSON.stringify({
      version: 1,
      entries: {
        m31: { dir: 'famous-curated/m31', sourceUrl: 'x', license: 'CC-BY', author: 'A', processedAt: 't' },
      },
    }));
    const idx = loadCuratedOverrides(path);
    expect(idx.entries.m31?.author).toBe('A');
  });

  it('throws on malformed JSON', () => {
    const path = tmpPath();
    writeFileSync(path, 'not json');
    expect(() => loadCuratedOverrides(path)).toThrow();
  });
});
