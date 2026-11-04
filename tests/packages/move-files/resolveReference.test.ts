import { describe, it, expect } from 'vitest';
import { resolveReference } from '../../../packages/move-files/src/resolveReference';

const has = (files: string[]) => (p: string) => files.includes(p);

describe('resolveReference', () => {
  it('resolves in TS order', () => {
    const hit = resolveReference('./x', '/r/a.ts', has(['/r/x.ts', '/r/x.tsx']), []);
    expect(hit).toMatchObject({ target: '/r/x.ts', shape: 'bare' });
  });

  it('treats .js as standing for .ts', () => {
    const hit = resolveReference('./x.js', '/r/a.ts', has(['/r/x.ts']), []);
    expect(hit).toMatchObject({ target: '/r/x.ts', shape: 'js' });
  });

  it('splits a query', () => {
    const hit = resolveReference('./x.worker?worker', '/r/a.ts', has(['/r/x.worker.ts']), []);
    expect(hit).toMatchObject({ target: '/r/x.worker.ts', query: '?worker' });
  });

  it('resolves a directory and a dot-specifier to the index', () => {
    const files = has(['/r/dir/index.ts', '/r/index.ts']);
    expect(resolveReference('./dir', '/r/a.ts', files, [])).toMatchObject({ shape: 'dir' });
    expect(resolveReference('.', '/r/a.ts', files, [])?.target).toBe('/r/index.ts');
  });

  it('a bare package name resolves to nothing', () => {
    expect(resolveReference('react', '/r/a.ts', has(['/r/react.ts']), [])).toBeNull();
  });

  it('uses the nearest tsconfig scope', () => {
    const scopes = [
      { dir: '/r', rules: [{ pattern: '@/*', targets: ['/r/src/*'] }] },
      { dir: '/r/pkg', rules: [{ pattern: '@/*', targets: ['/r/pkg/src/*'] }] },
    ];
    const files = has(['/r/src/a.ts', '/r/pkg/src/a.ts']);
    expect(resolveReference('@/a', '/r/pkg/x.ts', files, scopes)?.target).toBe('/r/pkg/src/a.ts');
    expect(resolveReference('@/a', '/r/y.ts', files, scopes)?.target).toBe('/r/src/a.ts');
  });
});
