import { describe, it, expect } from 'vitest';
import { loadMoveContext } from '../../../packages/move-files/src/loadMoveContext';
import { makeRepo } from './helpers/makeRepo';

describe('loadMoveContext', () => {
  it('reads paths through extends, scoped per tsconfig', () => {
    const root = makeRepo({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
      }),
      'tsconfig.json': JSON.stringify({ extends: './tsconfig.base.json' }),
      'site/tsconfig.json': JSON.stringify({
        extends: '../tsconfig.base.json',
        compilerOptions: { paths: { '~/*': ['./lib/*'] } },
      }),
    });
    const { aliasScopes } = loadMoveContext(root, [
      `${root}/tsconfig.json`,
      `${root}/site/tsconfig.json`,
    ]);
    expect(aliasScopes).toEqual([
      { dir: root, rules: [{ pattern: '@/*', targets: [`${root}/src/*`] }] },
      { dir: `${root}/site`, rules: [{ pattern: '~/*', targets: [`${root}/lib/*`] }] },
    ]);
  });

  it('reads the companion rules and extra mock callees from the config file', () => {
    const rule = { from: '', to: '', sources: ['.tsx'], suffixes: ['.module.css'] };
    const root = makeRepo({
      'move-files.config.json': JSON.stringify({
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
