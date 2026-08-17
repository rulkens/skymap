import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDataManifest } from '../../../tools/deploy/buildDataManifest';

function seedTree(dir: string): void {
  mkdirSync(join(dir, 'galaxy-catalog/v9'), { recursive: true });
  mkdirSync(join(dir, 'star-catalog/v1'), { recursive: true });
  mkdirSync(join(dir, 'images/famous'), { recursive: true });
  writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.bin'), 'two-mrs-bytes-v1');
  writeFileSync(join(dir, 'star-catalog/v1/stars-small.bin'), 'stars-small-bytes');
  writeFileSync(join(dir, 'constellations.json'), '{"constellations":true}');
  writeFileSync(join(dir, 'galaxy-catalog/v9/sdss.bin'), 'pre-tier-sdss-bytes'); // untracked
  writeFileSync(join(dir, 'images/famous/x.webp'), 'webp-bytes'); // untracked, unhashed subtree
}

function listAllFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(d, entry.name), relPath);
      else out.push(relPath);
    }
  };
  walk(dir, '');
  return out.sort();
}

describe('buildDataManifest', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'data-manifest-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps every tracked file and renames it in place', () => {
    seedTree(dir);
    const manifest = buildDataManifest(dir);

    expect(Object.keys(manifest).sort()).toEqual(
      [
        'constellations.json',
        'galaxy-catalog/v9/2mrs.bin',
        'star-catalog/v1/stars-small.bin',
      ].sort(),
    );
    for (const hashedRel of Object.values(manifest)) {
      expect(existsSync(join(dir, hashedRel))).toBe(true);
    }
    // Untracked bin and the images subtree keep their original names.
    expect(existsSync(join(dir, 'galaxy-catalog/v9/sdss.bin'))).toBe(true);
    expect(existsSync(join(dir, 'images/famous/x.webp'))).toBe(true);
  });

  it('a rebuild with changed bytes replaces the hashed file', () => {
    seedTree(dir);
    buildDataManifest(dir);

    writeFileSync(join(dir, 'galaxy-catalog/v9/2mrs.bin'), 'two-mrs-bytes-v2-different');
    const manifest = buildDataManifest(dir);

    const survivors = readdirSync(join(dir, 'galaxy-catalog/v9')).filter((n) =>
      n.startsWith('2mrs.'),
    );
    expect(survivors).toHaveLength(1);
    expect(manifest['galaxy-catalog/v9/2mrs.bin']).toBe(`galaxy-catalog/v9/${survivors[0]}`);
  });

  it('re-running over unchanged bytes changes nothing', () => {
    seedTree(dir);
    const first = buildDataManifest(dir);
    const filesAfterFirst = listAllFiles(dir);

    const second = buildDataManifest(dir);
    const filesAfterSecond = listAllFiles(dir);

    expect(second).toEqual(first);
    expect(filesAfterSecond).toEqual(filesAfterFirst);
  });

  it('manifest.json is not itself an entry', () => {
    seedTree(dir);
    const manifest = buildDataManifest(dir);
    expect(Object.keys(manifest)).not.toContain('manifest.json');
    expect(Object.values(manifest)).not.toContain('manifest.json');
  });

  it('leaves a symlinked data dir untouched', () => {
    seedTree(dir);
    const filesBefore = listAllFiles(dir);

    const linkPath = join(tmpdir(), `data-manifest-link-${process.pid}-${Date.now()}`);
    symlinkSync(dir, linkPath);
    try {
      const manifest = buildDataManifest(linkPath);
      expect(manifest).toEqual({});
      expect(listAllFiles(dir)).toEqual(filesBefore);
      expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
    } finally {
      // `linkPath` is a symlink whose target is a directory: rmSync refuses
      // that (ERR_FS_EISDIR) unless told `recursive: true`, which would
      // delete through the link into the real target — unlinkSync removes
      // just the link itself. The target (`dir`) is cleaned separately by
      // afterEach, so nothing under $TMPDIR leaks either way.
      unlinkSync(linkPath);
    }
  });
});
