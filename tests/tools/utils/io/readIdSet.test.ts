import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIdSet } from '../../../../tools/utils/io/readIdSet';

describe('readIdSet', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'readidset-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty Set for a missing file', () => {
    const result = readIdSet(join(dir, 'missing.csv'));
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('skips the header line and collects the first CSV column', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n12345,foo\n67890,bar\n');
    const result = readIdSet(path);
    expect([...result].sort()).toEqual(['12345', '67890']);
  });

  it('skips blank lines and lines without a comma', () => {
    const path = join(dir, 'cache.csv');
    writeFileSync(path, 'id,extra\n\n12345,foo\nnotacsvline\n67890,bar\n');
    const result = readIdSet(path);
    expect([...result].sort()).toEqual(['12345', '67890']);
  });
});
