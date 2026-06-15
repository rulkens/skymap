import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadJsonCache } from '../../../../tools/utils/io/loadJsonCache';

describe('loadJsonCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jsoncache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns {} for a missing file', () => {
    const result = loadJsonCache<Record<string, string>>(join(dir, 'missing.json'));
    expect(result).toEqual({});
  });

  it('returns the parsed contents for a well-formed file', () => {
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify({ a: '1', b: '2' }));
    expect(loadJsonCache<Record<string, string>>(path)).toEqual({ a: '1', b: '2' });
  });

  it('warns and returns {} for malformed JSON', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{not valid json');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = loadJsonCache<Record<string, string>>(path);
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });
});
