import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { resolveReference } from '../src/resolveReference';

const has = (files: string[]) => (p: string) => files.includes(p);

describe('resolveReference', () => {
  it('calls a spelling exact only when it names the target', () => {
    expect(resolveReference('./x.js', '/r/a.ts', has(['/r/x.js']), [])?.shape).toBe('exact');
    expect(resolveReference('./x.mjs', '/r/a.ts', has(['/r/x.mts']), [])?.shape).toBe('js');
    expect(resolveReference('./x.png', '/r/a.ts', has(['/r/x.png']), [])?.shape).toBe('exact');
  });

  it('splits a query', () => {
    const hit = resolveReference('./x.worker?worker', '/r/a.ts', has(['/r/x.worker.ts']), []);
    expect(hit).toMatchObject({ target: '/r/x.worker.ts', query: '?worker' });
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

  it('a scope stops at its directory boundary', () => {
    const scopes = [{ dir: '/r/pkg', rules: [{ pattern: '@/*', targets: ['/r/pkg/*'] }] }];
    expect(resolveReference('@/a', '/r/pkg2/x.ts', has(['/r/pkg/a.ts']), scopes)).toBeNull();
  });
});

// TypeScript's own resolver is the oracle: bundler mode with JS and JSON allowed, on a fake disk.
function typescriptSays(
  specifier: string,
  importer: string,
  files: string[],
  aliases: ts.CompilerOptions = {},
) {
  const directories = new Set<string>();
  for (const file of files) {
    for (let d = file; d.lastIndexOf('/') > 0; ) {
      d = d.slice(0, d.lastIndexOf('/'));
      directories.add(d);
    }
  }
  const options: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
    resolveJsonModule: true,
    allowImportingTsExtensions: true,
    ...aliases,
  };
  const host: ts.ModuleResolutionHost = {
    fileExists: (p) => files.includes(p),
    readFile: () => undefined,
    directoryExists: (p) => directories.has(p.replace(/\/$/, '')),
    getCurrentDirectory: () => '/r',
  };
  return ts.resolveModuleName(specifier, importer, options, host).resolvedModule?.resolvedFileName;
}

describe('resolveReference agrees with TypeScript', () => {
  const rows: [string, string, string[]][] = [
    // JS targets
    ['./util', '/r/m.ts', ['/r/util.js']],
    ['./C', '/r/m.ts', ['/r/C.jsx']],
    ['./dir', '/r/m.ts', ['/r/dir/index.js']],
    ['./dir', '/r/m.ts', ['/r/dir/index.jsx']],
    ['./x.mjs', '/r/m.ts', ['/r/x.mts']],
    ['./x.mjs', '/r/m.ts', ['/r/x.d.mts']],
    ['./x.mjs', '/r/m.ts', ['/r/x.mjs']],
    ['./x.cjs', '/r/m.ts', ['/r/x.cts']],
    ['./x.cjs', '/r/m.ts', ['/r/x.d.cts']],
    ['./x.cjs', '/r/m.ts', ['/r/x.cjs']],
    ['./x.json', '/r/m.ts', ['/r/x.json']],
    // Directory-only forms never hit a sibling file
    ['.', '/r/foo/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['./', '/r/foo/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['..', '/r/foo/sub/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['../', '/r/foo/sub/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['../..', '/r/foo/a/b/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['./foo/', '/r/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['./foo/.', '/r/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    ['./foo/', '/r/c.ts', ['/r/foo.ts']],
    ['./foo', '/r/c.ts', ['/r/foo.ts', '/r/foo/index.ts']],
    // The order inside and across TS's two passes
    ['./x', '/r/m.ts', ['/r/x.ts', '/r/x.tsx', '/r/x.d.ts', '/r/x.js']],
    ['./x', '/r/m.ts', ['/r/x.tsx', '/r/x.d.ts']],
    ['./x', '/r/m.ts', ['/r/x.d.ts', '/r/x.js']],
    ['./x', '/r/m.ts', ['/r/x.js', '/r/x.jsx']],
    ['./x', '/r/m.ts', ['/r/x.js', '/r/x/index.ts']],
    ['./x', '/r/m.ts', ['/r/x', '/r/x.ts']],
    ['./x.js', '/r/m.ts', ['/r/x.js', '/r/x.ts']],
    ['./x.js', '/r/m.ts', ['/r/x.js', '/r/x.d.ts']],
    ['./x.js', '/r/m.ts', ['/r/x.tsx']],
    ['./x.jsx', '/r/m.ts', ['/r/x.ts']],
    ['./x.jsx', '/r/m.ts', ['/r/x.tsx', '/r/x.ts']],
    ['./x.jsx', '/r/m.ts', ['/r/x.js']],
    ['./x.tsx', '/r/m.ts', ['/r/x.tsx']],
    ['./x.ts', '/r/m.ts', ['/r/x.ts']],
    ['./x.d.ts', '/r/m.ts', ['/r/x.d.ts']],
    ['./x.mts', '/r/m.ts', ['/r/x.mts']],
    ['./x.worker', '/r/m.ts', ['/r/x.worker.ts']],
    // Not a module spelling
    ['./x', '/r/m.ts', ['/r/x.mts']],
    ['.hidden/x', '/r/m.ts', ['/r/.hidden/x.ts']],
    ['react', '/r/m.ts', []],
  ];

  it.each(rows)('%s from %s with %j', (specifier, importer, files) => {
    const hit = resolveReference(specifier, importer, has(files), []);
    expect(hit?.target).toBe(typescriptSays(specifier, importer, files));
  });

  const paths = {
    '@/*': ['src/*'],
    '@/x/*': ['other/*'],
    '#core': ['src/lib/engine.ts'],
    '#dir': ['kit'],
    'a*a': ['src/*'],
  };
  const scopes = [
    {
      dir: '/r',
      rules: Object.entries(paths).map(([pattern, targets]) => ({
        pattern,
        targets: targets.map((t) => `/r/${t}`),
      })),
    },
  ];
  const aliasRows: [string, string[]][] = [
    ['@/a/b', ['/r/src/a/b.ts']],
    ['@/a/', ['/r/src/a.ts', '/r/src/a/index.ts']],
    ['@/x/a', ['/r/src/x/a.ts', '/r/other/a.ts']],
    ['@/x/a', ['/r/src/x/a.ts']],
    ['#core', ['/r/src/lib/engine.ts']],
    ['#dir', ['/r/kit/index.ts']],
    ['@/a.js', ['/r/src/a.ts']],
    ['a', ['/r/src/index.ts']],
    ['aba', ['/r/src/b.ts']],
  ];

  it.each(aliasRows)('alias %s with %j', (specifier, files) => {
    const hit = resolveReference(specifier, '/r/m.ts', has(files), scopes);
    expect(hit?.target).toBe(typescriptSays(specifier, '/r/m.ts', files, { baseUrl: '/r', paths }));
  });

  it.each([
    ['./x.png', '/r/x.png'],
    ['./data', '/r/data.json'],
  ])('goes past TS for %s, as bundlers and Node do', (specifier, file) => {
    expect(typescriptSays(specifier, '/r/m.ts', [file])).toBeUndefined();
    expect(resolveReference(specifier, '/r/m.ts', has([file]), [])?.target).toBe(file);
  });
});
