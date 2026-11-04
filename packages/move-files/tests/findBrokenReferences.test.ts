import { describe, it, expect, vi } from 'vitest';
import { findBrokenReferences } from '../src/findBrokenReferences';
import { findLiteralRanges } from '../src/findLiteralRanges';
import { rewriteReferences } from '../src/rewriteReferences';
import type { AliasScope } from '../src/@types/AliasScope';
import type { FileEdit } from '../src/@types/FileEdit';
import type { MoveContext } from '../src/@types/MoveContext';

vi.mock('../src/findLiteralRanges', async (actual) => {
  const module = await actual<typeof import('../src/findLiteralRanges')>();
  return { findLiteralRanges: vi.fn(module.findLiteralRanges) };
});

const contextWith = (aliasScopes: AliasScope[] = []): MoveContext => ({
  root: '/r',
  config: { companions: [], extraMockCallees: [] },
  aliasScopes,
});

function guard(
  files: Record<string, string>,
  moves: Record<string, string>,
  assets: string[] = [],
  edits?: FileEdit[],
  scopes: AliasScope[] = [],
) {
  const texts = new Map(Object.entries(files));
  const snapshot = { texts, fileExists: (p: string) => assets.includes(p) };
  const moveMap = new Map(Object.entries(moves));
  // Without explicit edits, moved files carry their text unchanged, as the engine emits them.
  const effective =
    edits ?? [...moveMap].map(([from, to]) => ({ from, to, text: texts.get(from) ?? '' }));
  return findBrokenReferences(snapshot, effective, moveMap, contextWith(scopes));
}

// The real pipeline: what the rewrite produces, then what the guard says about it.
function afterRewrite(
  files: Record<string, string>,
  moves: Record<string, string>,
  assets: string[] = [],
  scopes: AliasScope[] = [],
) {
  const snapshot = {
    texts: new Map(Object.entries(files)),
    fileExists: (p: string) => assets.includes(p),
  };
  const moveMap = new Map(Object.entries(moves));
  const edits = rewriteReferences(snapshot, moveMap, contextWith(scopes));
  return findBrokenReferences(snapshot, edits, moveMap, contextWith(scopes)).map(
    (f) => `${f.file}:${f.line} ${f.reason}`,
  );
}

const srcAlias = [{ dir: '/r', rules: [{ pattern: '@/*', targets: ['/r/src/*'] }] }];

describe('findBrokenReferences', () => {
  it('reports a path string that no longer resolves', () => {
    const findings = guard(
      { '/r/old/m.ts': `\nconst u = new URL('./x.wesl', import.meta.url);` },
      { '/r/old/m.ts': '/r/new/m.ts' },
      ['/r/old/x.wesl'],
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: '/r/new/m.ts', line: 2, reason: 'no-longer-resolves' }),
    ]);
  });

  it('does not report a string that never resolved', () => {
    expect(guard({ '/r/old/m.ts': `const s = './y';` }, { '/r/old/m.ts': '/r/new/m.ts' })).toEqual(
      [],
    );
  });

  it('reports a string now pointing at a different file', () => {
    const findings = guard(
      { '/r/a.ts': ``, '/r/c.ts': ``, '/r/f.ts': `const s = './a.ts';` },
      { '/r/a.ts': '/r/b.ts', '/r/c.ts': '/r/a.ts' },
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: '/r/f.ts', reason: 'now-resolves-elsewhere' }),
    ]);
  });

  it('a relative string that merely ends in the old path is not a mention', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/x/src/a/b.ts': ``, '/r/x/t.ts': `const p = './src/a/b.ts';` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([]);
  });

  it('reports an old repo-relative path in a string', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `\n\nconst p = 'src/a/b.ts';` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([
      { file: '/r/t.ts', line: 3, text: `const p = 'src/a/b.ts';`, reason: 'mentions-old-path' },
    ]);
  });

  it.each([
    ['xsrc/a/b.ts'],
    ['x-src/a/b.ts'],
    ['x.src/a/b.ts'],
    ['src/a/b.test.ts'],
    ['src/a/bb.ts'],
  ])('an old path needs a path boundary: %s', (mention) => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `const p = '${mention}';` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([]);
  });

  it.each([['src/a/b'], ['src/a/b.ts'], ['src/a/b.js'], ['https://x.test/src/a/b.ts']])(
    'still reports the old path written as %s',
    (mention) => {
      const findings = guard(
        { '/r/src/a/b.ts': ``, '/r/t.ts': `const p = '${mention}';` },
        { '/r/src/a/b.ts': '/r/src/c/b.ts' },
      );
      expect(findings.map((f) => f.reason)).toEqual(['mentions-old-path']);
    },
  );

  it.each([
    ['.jsx', `const p = 'src/a/C.jsx';`, 1],
    ['.js', `const p = 'src/a/C.js';`, 1],
    ['.ts', `const p = 'src/a/C.ts';`, 0],
  ])('an old .tsx path is also written with %s', (_, text, count) => {
    const findings = guard(
      { '/r/src/a/C.tsx': ``, '/r/t.ts': text },
      { '/r/src/a/C.tsx': '/r/src/c/C.tsx' },
    );
    expect(findings.length).toBe(count);
  });

  it('reports one line once per reason', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `const p = ['src/a/b.ts', 'src/a/b'];` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings.length).toBe(1);
  });

  it('a string with a fragment or a query is judged by its file', () => {
    const findings = guard(
      {
        '/r/old/m.ts': `const u = './i.svg#icon';\nconst v = './i.svg?raw#icon';\nconst w = './k.ts#x';`,
      },
      { '/r/old/m.ts': '/r/new/m.ts' },
      ['/r/old/i.svg', '/r/old/k.ts'],
    );
    expect(findings.map((f) => f.line)).toEqual([1, 2, 3]);
    const moved = guard(
      { '/r/m.ts': `const u = './i.svg#icon';`, '/r/i.svg': `` },
      { '/r/i.svg': '/r/j.svg', '/r/k.svg': '/r/i.svg' },
      ['/r/k.svg'],
    );
    expect(moved.map((f) => f.reason)).toEqual(['now-resolves-elsewhere']);
  });

  it('parses a .js file with JSX, so a string after JSX text is still seen', () => {
    const findings = guard(
      {
        '/r/src/a/b.ts': ``,
        '/r/t.js': `const e = <div>/* text</div>;\nconst p = 'src/a/b.ts';`,
      },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: '/r/t.js', line: 2, reason: 'mentions-old-path' }),
    ]);
  });

  it('ignores an old path in a comment', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `// src/a/b.ts\nexport {};` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([]);
  });

  it('ignores a relative path in a comment', () => {
    const findings = guard(
      { '/r/old/m.ts': `// see './x.wesl'\nexport {};` },
      { '/r/old/m.ts': '/r/new/m.ts' },
      ['/r/old/x.wesl'],
    );
    expect(findings).toEqual([]);
  });

  it('ignores an old path in a CSS comment', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/s.css': `/* src/a/b.ts */\n.a {}` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([]);
  });

  it('parses only a file with a suspected break', () => {
    vi.mocked(findLiteralRanges).mockClear();
    guard(
      {
        '/r/src/a/b.ts': ``,
        '/r/clean.ts': `import './other'; const s = './y';`,
        '/r/other.ts': ``,
        '/r/stale.ts': `const p = 'src/a/b.ts';`,
      },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(vi.mocked(findLiteralRanges).mock.calls.map(([path]) => path)).toEqual(['/r/stale.ts']);
  });

  it('scans .astro and .mdx', () => {
    const findings = guard(
      {
        '/r/moved.ts': ``,
        '/r/p.astro': `---\nimport x from './moved';\n---`,
        '/r/q.mdx': `import y from './moved'`,
      },
      { '/r/moved.ts': '/r/sub/moved.ts' },
    );
    expect(findings.map((f) => [f.file, f.reason])).toEqual([
      ['/r/p.astro', 'no-longer-resolves'],
      ['/r/q.mdx', 'no-longer-resolves'],
    ]);
  });

  it('checks a template fixed prefix', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': 'const u = `${BLOB}/src/a/b.ts`;' },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: '/r/t.ts', reason: 'mentions-old-path' }),
    ]);
  });

  it('checks Sass and Less, which nothing rewrites', () => {
    const findings = afterRewrite(
      {
        '/r/old/m.scss': `@use './v.scss';\n.a { background: url(./i.png); }\n/* './v.scss' */`,
        '/r/old/v.scss': ``,
        '/r/l/m.less': `@import './v.less';`,
        '/r/l/v.less': ``,
      },
      { '/r/old/m.scss': '/r/new/m.scss', '/r/l/v.less': '/r/k/v.less' },
      ['/r/old/i.png'],
    );
    expect(findings.sort()).toEqual([
      '/r/l/m.less:1 no-longer-resolves',
      '/r/new/m.scss:1 no-longer-resolves',
      '/r/new/m.scss:2 no-longer-resolves',
    ]);
  });

  it.each([
    ['.astro', `---\nimport b from '@/a/b';\n---`, 2],
    ['.mdx', `import b from '@/a/b'`, 1],
    ['.scss', `@use '@/a/b';`, 1],
  ])('reports an alias that broke in a %s file, which nothing rewrites', (ext, text, line) => {
    const file = `/r/src/p${ext}`;
    expect(
      afterRewrite(
        { '/r/src/a/b.ts': ``, [file]: text },
        { '/r/src/a/b.ts': '/r/src/c/b.ts' },
        [],
        srcAlias,
      ),
    ).toEqual([`${file}:${line} no-longer-resolves`]);
  });

  it('ignores a non-relative string in a file the rewrite covers', () => {
    expect(
      guard(
        {
          '/r/src/a/b.ts': ``,
          '/r/src/k.ts': ``,
          '/r/src/p.ts': `import './k';\nconst s = '@/a/b';`,
        },
        { '/r/src/a/b.ts': '/r/src/c/b.ts' },
        [],
        undefined,
        srcAlias,
      ),
    ).toEqual([]);
  });

  describe('says nothing about a correct rewrite', () => {
    it('that lengthens a dot-specifier', () => {
      expect(
        afterRewrite(
          {
            '/r/lib/index.ts': ``,
            '/r/lib/a.ts': ``,
            '/r/lib/b.ts': ``,
            '/r/lib/sub/c.ts': `import '..';\nimport '../a';\nimport '../b';`,
          },
          { '/r/lib/index.ts': '/r/lib/main.ts' },
        ),
      ).toEqual([]);
    });

    it('that turns an alias into a relative path', () => {
      expect(
        afterRewrite(
          {
            '/r/src/lib/b.ts': ``,
            '/r/src/k.ts': ``,
            '/r/src/u.ts': `import '@/lib/b';\nimport './k';\nconst w = './k';`,
          },
          { '/r/src/lib/b.ts': '/r/other/b.ts' },
          [],
          srcAlias,
        ),
      ).toEqual([]);
    });

    it('that shortens to a dot-specifier, while a real break keeps its line', () => {
      expect(
        afterRewrite(
          {
            '/r/lib/index.ts': ``,
            '/r/lib/k.ts': ``,
            '/r/x/asset.wesl': ``,
            '/r/x/m.ts': `import '../lib';\nimport '../lib/k';\nconst u = './asset.wesl';`,
          },
          { '/r/x/m.ts': '/r/lib/m.ts' },
          ['/r/x/asset.wesl'],
        ),
      ).toEqual(['/r/lib/m.ts:3 no-longer-resolves']);
    });

    it('that quotes an unquoted url', () => {
      expect(
        afterRewrite(
          { '/r/s.css': `.a { background: url(./a.png); }\n.b { src: url(./f.woff); }` },
          { '/r/a.png': '/r/my dir/a.png' },
          ['/r/a.png', '/r/f.woff'],
        ),
      ).toEqual([]);
    });

    it('into a tree that ends in the old path', () => {
      expect(
        afterRewrite(
          { '/r/src/a.ts': ``, '/r/main.ts': `import './src/a';` },
          { '/r/src/a.ts': '/r/packages/app/src/a.ts' },
        ),
      ).toEqual([]);
    });

    it('of a root-level file into a folder', () => {
      expect(
        afterRewrite(
          {
            '/r/config.ts': ``,
            '/r/main.ts': `import './config';\nconst k = 'config';\nconst p = 'a/config';\nconst q = 'a/config.ts';`,
            '/r/doc.mdx': `explains config options`,
          },
          { '/r/config.ts': '/r/lib/config.ts' },
        ),
      ).toEqual([]);
    });

    it('where a string is left as a dot-specifier beside an index', () => {
      expect(
        afterRewrite(
          { '/r/a/index.ts': ``, '/r/a/k.ts': ``, '/r/a/m.ts': `import './k';\ns.split('.');` },
          { '/r/a/m.ts': '/r/b/m.ts' },
        ),
      ).toEqual([]);
    });
  });

  it('still reports a root-level file by its name with an extension', () => {
    expect(
      afterRewrite(
        { '/r/config.ts': ``, '/r/main.ts': `const p = 'config.ts';` },
        { '/r/config.ts': '/r/lib/config.ts' },
      ),
    ).toEqual(['/r/main.ts:1 mentions-old-path']);
  });

  it('reads a string that holds a quote of another kind', () => {
    expect(
      afterRewrite(
        { '/r/old/m.ts': `const s = "it's"; const u = './i.png';` },
        { '/r/old/m.ts': '/r/new/m.ts' },
        ['/r/old/i.png'],
      ),
    ).toEqual(['/r/new/m.ts:1 no-longer-resolves']);
  });
});
