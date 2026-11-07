import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readStreamWikipedia } from '../../../../tools/streams/utils/readStreamWikipedia';

const body = (title: string, extract: string, type = 'standard') =>
  JSON.stringify({ type, title, extract });
const rows = [{ name: 'GD-1', title: 'GD-1' }];
const cachePath = () => join(mkdtempSync(join(tmpdir(), 'streamwiki-')), 'cache.json');

describe('readStreamWikipedia', () => {
  it('a cached summary is used without a fetch', async () => {
    const path = cachePath();
    writeFileSync(path, JSON.stringify({ 'GD-1': body('GD-1', 'A stream.') }));
    const fetchBody = vi.fn();
    const out = await readStreamWikipedia(rows, path, fetchBody, 0);
    expect(out).toEqual({ 'GD-1': { title: 'GD-1', extract: 'A stream.' } });
    expect(fetchBody).not.toHaveBeenCalled();
  });

  it('a missing summary is fetched by its REST URL and written to the cache', async () => {
    const path = cachePath();
    const fetchBody = vi.fn(async () => body('GD-1', 'Fetched.'));
    const out = await readStreamWikipedia(rows, path, fetchBody, 0);
    expect(fetchBody).toHaveBeenCalledWith(
      'https://en.wikipedia.org/api/rest_v1/page/summary/GD-1',
    );
    expect(out['GD-1']!.extract).toBe('Fetched.');
    expect(JSON.parse(readFileSync(path, 'utf8'))['GD-1']).toBe(body('GD-1', 'Fetched.'));
  });

  it('a page that is not a standard article fails the build', async () => {
    const fetchBody = async () => body('GD-1', 'May refer to', 'disambiguation');
    await expect(readStreamWikipedia(rows, cachePath(), fetchBody, 0)).rejects.toThrow(/GD-1/);
  });

  it('a failed fetch fails the build', async () => {
    await expect(readStreamWikipedia(rows, cachePath(), async () => null, 0)).rejects.toThrow(
      /GD-1/,
    );
  });
});
