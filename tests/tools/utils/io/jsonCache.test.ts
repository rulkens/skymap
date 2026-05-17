import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadJsonCache, saveJsonCache } from '../../../../tools/utils/io/jsonCache';

describe('jsonCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jsoncache-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('loadJsonCache returns {} for a missing file', () => {
    const result = loadJsonCache<Record<string, string>>(join(dir, 'missing.json'));
    expect(result).toEqual({});
  });

  it('loadJsonCache returns the parsed contents for a well-formed file', () => {
    const path = join(dir, 'ok.json');
    writeFileSync(path, JSON.stringify({ a: '1', b: '2' }));
    expect(loadJsonCache<Record<string, string>>(path)).toEqual({ a: '1', b: '2' });
  });

  it('loadJsonCache warns and returns {} for malformed JSON', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{not valid json');
    const warn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = loadJsonCache<Record<string, string>>(path);
    expect(result).toEqual({});
    expect(warn).toHaveBeenCalled();
  });

  it('saveJsonCache writes 2-space-indented JSON and creates the parent directory', () => {
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
