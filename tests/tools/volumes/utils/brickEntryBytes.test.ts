import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { brickEntryBytes } from '../../../../tools/volumes/utils/brickEntryBytes';

describe('brickEntryBytes', () => {
  it('an all-zero brick stores nothing; any other is one gzip member', () => {
    const formatBrick = Uint8Array.from({ length: 64 }, (_, i) => i * 7);
    const r8 = new Uint8Array(110_592);
    expect(brickEntryBytes(r8, formatBrick).length).toBe(0);

    r8[5000] = 1;
    expect([...gunzipSync(brickEntryBytes(r8, formatBrick))]).toEqual([...formatBrick]);
  });
});
