import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { byteRangeOf } from '../../../../tools/utils/serve/byteRangeOf';
import { serveGzipped } from '../../../../tools/utils/serve/serveGzipped';

describe('byteRangeOf', () => {
  it.each([
    ['bytes=0-99', 1000, { start: 0, end: 99 }],
    ['bytes=990-', 1000, { start: 990, end: 999 }],
    ['bytes=-10', 1000, { start: 990, end: 999 }],
    ['bytes=900-2000', 1000, { start: 900, end: 999 }],
    ['bytes=1000-', 1000, 'unsatisfiable'],
    ['bytes=0-1,5-9', 1000, null],
    ['items=0-1', 1000, null],
    [undefined, 1000, null],
  ])('%s of %i', (header, size, want) => expect(byteRangeOf(header, size)).toEqual(want));
});

describe('serveGzipped ranges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-range-'));
  writeFileSync(join(dir, 'tiles.pack'), Buffer.from('0123456789'));
  const serving = serveGzipped(dir, undefined, 0);
  afterAll(async () => (await serving).close());

  it('answers a Range on a raw data file with 206 and Content-Range', async () => {
    const { url } = await serving;
    const res = await fetch(`${url}/tiles.pack`, { headers: { Range: 'bytes=2-4' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await res.text()).toBe('234');
  });

  it('answers an out-of-bounds Range with 416', async () => {
    const { url } = await serving;
    const res = await fetch(`${url}/tiles.pack`, { headers: { Range: 'bytes=10-' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });
});
