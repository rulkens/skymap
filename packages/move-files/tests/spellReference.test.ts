import { describe, it, expect } from 'vitest';
import { resolveReference } from '../src/resolveReference';
import { spellReference } from '../src/spellReference';
import type { AliasScope } from '../src/@types/AliasScope';

const has = (files: string[]) => (p: string) => files.includes(p);

// Resolve in the old layout, spell for the new one.
function respell(
  specifier: string,
  oldFiles: string[],
  newFiles: string[],
  importer: string,
  newTarget: string,
  scopes: AliasScope[] = [],
  newImporter = importer,
) {
  const ref = resolveReference(specifier, importer, has(oldFiles), scopes)!;
  return spellReference(ref, specifier, newImporter, newTarget, has(newFiles), scopes);
}

describe('spellReference', () => {
  it.each([
    ['./x', '/r/x.ts', '/r/sub/x.ts', './sub/x'],
    ['./x.ts', '/r/x.ts', '/r/sub/x.ts', './sub/x.ts'],
    ['./x.js', '/r/x.ts', '/r/sub/x.ts', './sub/x.js'],
    ['./dir', '/r/dir/index.ts', '/r/sub/dir/index.ts', './sub/dir'],
    ['./x?worker', '/r/x.ts', '/r/sub/x.ts', './sub/x?worker'],
    ['./x.jsx', '/r/x.tsx', '/r/sub/x.tsx', './sub/x.jsx'],
    ['./x.mjs', '/r/x.mts', '/r/sub/x.mts', './sub/x.mjs'],
    ['./x.cjs', '/r/x.d.cts', '/r/sub/x.d.cts', './sub/x.cjs'],
    ['./x.js', '/r/x.d.ts', '/r/sub/x.d.ts', './sub/x.js'],
    ['./data', '/r/data.json', '/r/sub/data.json', './sub/data'],
    ['./data.json', '/r/data.json', '/r/sub/data.json', './sub/data.json'],
    ['./dir/', '/r/dir/index.ts', '/r/sub/dir/index.ts', './sub/dir/'],
    ['./dir', '/r/dir/index.d.ts', '/r/sub/dir/index.d.ts', './sub/dir'],
    ['./dir', '/r/dir/index.js', '/r/sub/dir/index.js', './sub/dir'],
    ['./dir', '/r/dir/index.ts', '/r/lib/foo.ts', './lib/foo'],
    ['./x.js', '/r/x.ts', '/r/x.mts', './x.mts'],
  ])('keeps the written shape: %s', (spec, oldT, newT, expected) => {
    expect(respell(spec, [oldT], [newT], '/r/a.ts', newT)).toBe(expected);
  });

  it('spells the parent folder as ..', () => {
    const out = respell(
      './dir',
      ['/r/dir/index.ts'],
      ['/r/dir/index.ts'],
      '/r/a.ts',
      '/r/dir/index.ts',
      [],
      '/r/dir/sub/a.ts',
    );
    expect(out).toBe('..');
  });

  it('keeps .tsx extension spelling', () => {
    const out = respell(
      './Card.tsx',
      ['/r/Card.tsx'],
      ['/r/Card/Card.tsx'],
      '/r/a.tsx',
      '/r/Card/Card.tsx',
    );
    expect(out).toBe('./Card/Card.tsx');
    const moved = respell(
      './Card.tsx',
      ['/r/m/Card.tsx'],
      ['/r/m/Card.tsx'],
      '/r/m/a.tsx',
      '/r/m/Card.tsx',
      [],
      '/r/Card/a.tsx',
    );
    expect(moved).toBe('../m/Card.tsx');
  });

  it('falls back when the spelling would hit another file', () => {
    const out = respell(
      './foo',
      ['/r/foo/index.ts'],
      ['/r/foo/index.ts', '/r/foo.ts'],
      '/r/a.ts',
      '/r/foo/index.ts',
    );
    expect(out).toBe('./foo/index');
  });

  const scopes = [{ dir: '/r', rules: [{ pattern: '@/*', targets: ['/r/src/*'] }] }];

  it('keeps an alias while the target stays inside it', () => {
    const out = respell(
      '@/a/b',
      ['/r/src/a/b.ts'],
      ['/r/src/c/b.ts'],
      '/r/x.ts',
      '/r/src/c/b.ts',
      scopes,
    );
    expect(out).toBe('@/c/b');
  });

  it('falls back to relative when the target leaves the alias', () => {
    const out = respell(
      '@/a/b',
      ['/r/src/a/b.ts'],
      ['/r/lib/b.ts'],
      '/r/x.ts',
      '/r/lib/b.ts',
      scopes,
    );
    expect(out).toBe('./lib/b');
  });

  it.each([
    ['@/a/b.js', '/r/src/a/b.ts', '/r/src/c/b.ts', '@/c/b.js'],
    ['@/a/b.ts', '/r/src/a/b.ts', '/r/src/c/b.ts', '@/c/b.ts'],
    ['@/a?worker', '/r/src/a.ts', '/r/src/c/a.ts', '@/c/a?worker'],
    ['@/dir', '/r/src/dir/index.ts', '/r/src/lib/index.ts', '@/lib'],
    ['@/dir', '/r/src/dir/index.ts', '/r/src/dir2/foo.ts', '@/dir2/foo'],
  ])('keeps the written shape through an alias: %s', (spec, oldT, newT, expected) => {
    expect(respell(spec, [oldT], [newT], '/r/x.ts', newT, scopes)).toBe(expected);
  });

  it.each([
    [['/r/other/*', '/r/b/*'], '/r/b/x.ts', '/r/b/c/x.ts', '@/c/x'],
    [['/r/src/*.gen.ts', '/r/src/*.ts'], '/r/src/x.ts', '/r/src/c/x.ts', '@/c/x'],
  ])('tries each target of an alias: %j', (targets, oldT, newT, expected) => {
    const many = [{ dir: '/r', rules: [{ pattern: '@/*', targets }] }];
    expect(respell('@/x', [oldT], [newT], '/r/m.ts', newT, many)).toBe(expected);
  });

  it('an alias falls back to the explicit index when a sibling file would shadow it', () => {
    const out = respell(
      '@/dir',
      ['/r/src/dir/index.ts'],
      ['/r/src/foo/index.ts', '/r/src/foo.ts'],
      '/r/x.ts',
      '/r/src/foo/index.ts',
      scopes,
    );
    expect(out).toBe('@/foo/index');
  });

  it('a star-less alias stays while its target does, and spells no extension when it goes', () => {
    const core = [{ dir: '/r', rules: [{ pattern: '#core', targets: ['/r/lib/engine.ts'] }] }];
    const files = ['/r/lib/engine.ts'];
    expect(respell('#core', files, files, '/r/a.ts', '/r/lib/engine.ts', core, '/r/z/a.ts')).toBe(
      '#core',
    );
    expect(respell('#core', files, ['/r/k/e.ts'], '/r/a.ts', '/r/k/e.ts', core)).toBe('./k/e');
    const asJs = [{ dir: '/r', rules: [{ pattern: '#core', targets: ['/r/lib/engine.js'] }] }];
    expect(respell('#core', files, files, '/r/a.ts', '/r/lib/engine.ts', asJs, '/r/z/a.ts')).toBe(
      '#core',
    );
    const stem = [{ dir: '/r', rules: [{ pattern: '#core', targets: ['/r/lib/engine'] }] }];
    expect(respell('#core', files, files, '/r/a.ts', '/r/lib/engine.ts', stem, '/r/z/a.ts')).toBe(
      '#core',
    );
  });
});
