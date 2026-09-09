/**
 * The re-read-then-write contract is the point of this file: a bake CLI and
 * (from plan 3) a dev-server endpoint both mutate the same manifest, so an
 * implementation that caches a parsed object across calls would silently
 * clobber a concurrent writer's change. These tests catch that by writing
 * disk state the function under test never received directly, then checking
 * `update` was handed exactly that state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonAtomic } from '../../../../tools/utils/io/writeJsonAtomic';

describe('writeJsonAtomic', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'write-json-atomic-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes the on-disk contents to update at call time', async () => {
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify({ value: 'on-disk' }));

    let seen: { value: string } | null = null;
    await writeJsonAtomic<{ value: string }>(path, (current) => {
      seen = current;
      return { value: 'updated' };
    });

    expect(seen).toEqual({ value: 'on-disk' });
  });

  it('passes null to update when the file is absent', async () => {
    const path = join(dir, 'missing.json');

    let seen: unknown = 'not-called';
    const written = await writeJsonAtomic<{ value: string }>(path, (current) => {
      seen = current;
      return { value: 'seeded' };
    });

    expect(seen).toBeNull();
    expect(written).toEqual({ value: 'seeded' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: 'seeded' });
  });

  it('leaves no temp file behind', async () => {
    const path = join(dir, 'manifest.json');

    await writeJsonAtomic<{ value: string }>(path, () => ({ value: 'final' }));

    expect(readdirSync(dir)).toEqual(['manifest.json']);
  });
});
