import { describe, it, expect } from 'vitest';
import { loadMoveContext } from '../src/loadMoveContext';
import { resolveReference } from '../src/resolveReference';
import { makeRepo } from './helpers/makeRepo';

const json = JSON.stringify;

// The repo's config files, loaded the way the CLI lists them, then asked what `@/a/b` means.
function resolvedThrough(files: Record<string, string>, specifier = '@/a/b', from = 'src/m.ts') {
  const root = makeRepo(files);
  const configs = Object.keys(files).map((f) => `${root}/${f}`);
  const { aliasScopes } = loadMoveContext(root, configs);
  const hit = resolveReference(
    specifier,
    `${root}/${from}`,
    (p) => p === `${root}/src/a/b.ts`,
    aliasScopes,
  );
  return hit?.target.slice(root.length + 1);
}

const srcAlias = { compilerOptions: { paths: { '@/*': ['./src/*'] } } };

describe('loadMoveContext', () => {
  it('reads paths through extends, scoped per tsconfig', () => {
    const root = makeRepo({
      'tsconfig.base.json': json({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'tsconfig.json': json({ extends: './tsconfig.base.json' }),
      'site/tsconfig.json': json({
        extends: '../tsconfig.base.json',
        compilerOptions: { paths: { '~/*': ['./lib/*'] } },
      }),
    });
    const { aliasScopes } = loadMoveContext(root, [
      `${root}/tsconfig.json`,
      `${root}/site/tsconfig.json`,
    ]);
    expect(aliasScopes).toEqual([
      {
        dir: root,
        rules: [
          { pattern: '@/*', targets: [`${root}/src/*`] },
          { pattern: '*', targets: [`${root}/*`] },
        ],
      },
      {
        dir: `${root}/site`,
        rules: [
          { pattern: '~/*', targets: [`${root}/lib/*`] },
          { pattern: '*', targets: [`${root}/*`] },
        ],
      },
    ]);
  });

  it('resolves paths from the config that declares them', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: './cfg/base.json' }),
        'cfg/base.json': json({ compilerOptions: { paths: { '@/*': ['../src/*'] } } }),
      }),
    ).toBe('src/a/b.ts');
  });

  it('merges an extends array key by key', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: ['./base.json', './strict.json'] }),
        'base.json': json(srcAlias),
        'strict.json': json({ compilerOptions: { strict: true } }),
      }),
    ).toBe('src/a/b.ts');
  });

  it('a later extends entry wins, and the paths keep their own folder', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: ['./one/a.json', './two/b.json'] }),
        'one/a.json': json({ compilerOptions: { paths: { '@/*': ['./nothing/*'] } } }),
        'two/b.json': json({ compilerOptions: { paths: { '@/*': ['../src/*'] } } }),
      }),
    ).toBe('src/a/b.ts');
  });

  it('a later parent reached by a diamond still overrides an earlier one', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: ['./x.json', './y.json'] }),
        'x.json': json({
          extends: './base.json',
          compilerOptions: { paths: { '@/*': ['./nothing/*'] } },
        }),
        'y.json': json({ extends: './base.json' }),
        'base.json': json({ extends: './root.json', ...srcAlias }),
        'root.json': json({}),
      }),
    ).toBe('src/a/b.ts');
  });

  it('configs in one folder pool the targets of a pattern', () => {
    expect(
      resolvedThrough({
        'tsconfig.app.json': json(srcAlias),
        'tsconfig.node.json': json({ compilerOptions: { paths: { '@/*': ['./tools/*'] } } }),
      }),
    ).toBe('src/a/b.ts');
  });

  it('survives an extends cycle', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: './x.json', ...srcAlias }),
        'x.json': json({ extends: './tsconfig.json' }),
      }),
    ).toBe('src/a/b.ts');
  });

  it('reads tsconfig.app.json beside a references-only tsconfig.json', () => {
    expect(
      resolvedThrough({
        'tsconfig.json': json({ references: [{ path: './tsconfig.app.json' }], files: [] }),
        'tsconfig.app.json': json(srcAlias),
      }),
    ).toBe('src/a/b.ts');
  });

  it('reads jsconfig.json', () => {
    expect(resolvedThrough({ 'jsconfig.json': json(srcAlias) })).toBe('src/a/b.ts');
  });

  it('ignores a config-shaped file that is not one', () => {
    expect(resolvedThrough({ 'mytsconfig.json': json(srcAlias) })).toBeUndefined();
  });

  it('baseUrl alone maps bare specifiers', () => {
    expect(
      resolvedThrough({ 'tsconfig.json': json({ compilerOptions: { baseUrl: './src' } }) }, 'a/b'),
    ).toBe('src/a/b.ts');
  });

  it('an explicit `*` path replaces the baseUrl mapping', () => {
    expect(
      resolvedThrough(
        {
          'tsconfig.json': json({ compilerOptions: { baseUrl: './src', paths: { '*': ['x/*'] } } }),
        },
        'a/b',
      ),
    ).toBeUndefined();
  });

  it('substitutes ${configDir} with the config that extends, in paths and baseUrl', () => {
    const paths = { compilerOptions: { paths: { '@/*': ['${configDir}/src/*'] } } };
    expect(
      resolvedThrough({
        'tsconfig.json': json({ extends: './cfg/base.json' }),
        'cfg/base.json': json(paths),
      }),
    ).toBe('src/a/b.ts');
    expect(
      resolvedThrough(
        {
          'tsconfig.json': json({ extends: './cfg/base.json' }),
          'cfg/base.json': json({ compilerOptions: { baseUrl: '${configDir}/src' } }),
        },
        'a/b',
      ),
    ).toBe('src/a/b.ts');
  });

  it('reads the companion rules and extra mock callees from the config file', () => {
    const rule = { from: '', to: '', sources: ['.tsx'], suffixes: ['.module.css'] };
    const root = makeRepo({
      'move-files.config.json': json({
        companions: [rule],
        extraMockCallees: ['mockIt'],
      }),
    });
    const { config } = loadMoveContext(root, []);
    expect(config).toEqual({ companions: [rule], extraMockCallees: ['mockIt'] });
  });

  it('works with no config file', () => {
    const root = makeRepo({});
    const context = loadMoveContext(root, []);
    expect(context).toEqual({
      root,
      config: { companions: [], extraMockCallees: [] },
      aliasScopes: [],
    });
  });
});
