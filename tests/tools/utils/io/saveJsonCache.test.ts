import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveJsonCache } from '../../../../tools/utils/io/saveJsonCache';
import { loadJsonCache } from '../../../../tools/utils/io/loadJsonCache';

describe('saveJsonCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jsoncache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes 2-space-indented JSON and creates the parent directory', () => {
    const path = join(dir, 'nested', 'sub', 'out.json');
    saveJsonCache(path, { x: 'y' });
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toBe('{\n  "x": "y"\n}');
  });

  it('round-trips through save → load', () => {
    const path = join(dir, 'rt.json');
    const data = { foo: 'bar', baz: 'qux' };
    saveJsonCache(path, data);
    expect(loadJsonCache<Record<string, string>>(path)).toEqual(data);
  });
});
