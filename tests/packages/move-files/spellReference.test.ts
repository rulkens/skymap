import { describe, it, expect } from 'vitest';
import { resolveReference } from '../../../packages/move-files/src/resolveReference';
import { spellReference } from '../../../packages/move-files/src/spellReference';
import type { AliasScope } from '../../../packages/move-files/src/@types/AliasScope';

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
  ])('keeps the written shape: %s', (spec, oldT, newT, expected) => {
    expect(respell(spec, [oldT], [newT], '/r/a.ts', newT)).toBe(expected);
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
});
