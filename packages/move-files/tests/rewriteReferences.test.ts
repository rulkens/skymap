import { describe, it, expect } from 'vitest';
import { rewriteReferences } from '../src/rewriteReferences';
import type { AliasScope } from '../src/@types/AliasScope';
import type { MoveContext } from '../src/@types/MoveContext';

const context: MoveContext = {
  root: '/r',
  config: { companions: [], extraMockCallees: [] },
  aliasScopes: [],
};

function run(
  files: Record<string, string>,
  moves: Record<string, string>,
  assets: string[] = [],
  aliasScopes: AliasScope[] = [],
) {
  const snapshot = {
    texts: new Map(Object.entries(files)),
    fileExists: (p: string) => assets.includes(p),
  };
  const edits = rewriteReferences(snapshot, new Map(Object.entries(moves)), {
    ...context,
    aliasScopes,
  });
  return new Map(edits.map((e) => [e.from, e]));
}

describe('rewriteReferences', () => {
  it('rewrites importers and moved files together', () => {
    const edits = run(
      {
        '/r/a/x.ts': `import { y } from './y';\nimport z from '../z';`,
        '/r/a/y.ts': `import { x } from './x';`,
        '/r/z.ts': ``,
      },
      { '/r/a/x.ts': '/r/b/x.ts', '/r/a/y.ts': '/r/b/y.ts' },
    );
    expect(edits.get('/r/a/x.ts')).toEqual({
      from: '/r/a/x.ts',
      to: '/r/b/x.ts',
      text: `import { y } from './y';\nimport z from '../z';`,
    });
    expect(edits.get('/r/a/y.ts')?.text).toBe(`import { x } from './x';`);
    expect(edits.has('/r/z.ts')).toBe(false);
  });

  it('keeps an unchanged spelling when a moved pair keeps its distance', () => {
    const edits = run(
      { '/r/a/x.ts': `import '../z';`, '/r/z.ts': `` },
      { '/r/a/x.ts': '/r/b/x.ts' },
    );
    expect(edits.get('/r/a/x.ts')?.text).toBe(`import '../z';`);
  });

  it('a swap resolves against the old layout', () => {
    const edits = run(
      {
        '/r/a.ts': `export {};`,
        '/r/b.ts': `export {};`,
        '/r/u.ts': `import './a'; import './b';`,
        '/r/v.ts': `import './b';`,
      },
      { '/r/a.ts': '/r/b.ts', '/r/b.ts': '/r/a.ts' },
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import './b'; import './a';`);
    expect(edits.get('/r/v.ts')?.text).toBe(`import './a';`);
  });

  it('keeps bytes with a BOM and non-ASCII text', () => {
    const edits = run(
      { '/r/u.ts': `﻿// é\nimport './x';`, '/r/x.ts': `` },
      { '/r/x.ts': '/r/sub/x.ts' },
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`﻿// é\nimport './sub/x';`);
  });

  it('does not edit an importer with an unchanged spelling', () => {
    const edits = run(
      {
        '/r/a/p.ts': `export {};`,
        '/r/a/q.ts': `import './p';`,
        '/r/o.ts': `import './a/q';`,
      },
      { '/r/a/p.ts': '/r/b/p.ts', '/r/a/q.ts': '/r/b/q.ts' },
    );
    expect(edits.has('/r/o.ts')).toBe(true);
    expect(edits.get('/r/o.ts')?.text).toBe(`import './b/q';`);
    expect(edits.get('/r/a/q.ts')?.text).toBe(`import './p';`);
    const other = run(
      { '/r/a/p.ts': ``, '/r/a/q.ts': `import './p';`, '/r/w.ts': `import './k';`, '/r/k.ts': `` },
      {
        '/r/a/p.ts': '/r/b/p.ts',
        '/r/a/q.ts': '/r/b/q.ts',
      },
    );
    expect(other.has('/r/w.ts')).toBe(false);
  });

  it('repoints a moved file CSS import at a CSS file that stayed', () => {
    const edits = run(
      {
        '/r/old/Card.tsx': `import s from './X.module.css';`,
        '/r/old/X.module.css': `.a {}`,
        '/r/old/Y.module.css': `.b { composes: a from './X.module.css'; }`,
      },
      { '/r/old/Y.module.css': '/r/new/Y.module.css' },
    );
    expect(edits.get('/r/old/Y.module.css')?.text).toBe(
      `.b { composes: a from '../old/X.module.css'; }`,
    );
    expect(edits.has('/r/old/Card.tsx')).toBe(false);
  });

  it('keeps a moved TS file pointing at an asset', () => {
    const edits = run(
      { '/r/old/m.ts': `import u from './x.png';` },
      { '/r/old/m.ts': '/r/new/m.ts' },
      ['/r/old/x.png'],
    );
    expect(edits.get('/r/old/m.ts')?.text).toBe(`import u from '../old/x.png';`);
  });

  it('moves CSS with its references', () => {
    const edits = run(
      {
        '/r/a/Card.tsx': `import s from './Card.module.css';`,
        '/r/a/Card.module.css': `.a { composes: b from './base.css'; background: url(./i.png); }`,
        '/r/a/base.css': `.b {}`,
      },
      { '/r/a/Card.tsx': '/r/c/Card.tsx', '/r/a/Card.module.css': '/r/c/Card.module.css' },
      ['/r/a/i.png'],
    );
    expect(edits.get('/r/a/Card.tsx')?.text).toBe(`import s from './Card.module.css';`);
    expect(edits.get('/r/a/Card.module.css')?.text).toBe(
      `.a { composes: b from '../a/base.css'; background: url(../a/i.png); }`,
    );
    const reverse = run(
      {
        '/r/a/Card.module.css': `.a {}`,
        '/r/a/base.css': `.b { composes: a from './Card.module.css'; }`,
      },
      { '/r/a/Card.module.css': '/r/c/Card.module.css' },
    );
    expect(reverse.get('/r/a/base.css')?.text).toBe(
      `.b { composes: a from '../c/Card.module.css'; }`,
    );
  });

  it.each([['.scss'], ['.less']])('leaves %s files alone', (ext) => {
    const edits = run(
      { [`/r/x/m${ext}`]: `@import './v${ext}';`, [`/r/x/v${ext}`]: ``, '/r/k.ts': `` },
      { [`/r/x/m${ext}`]: `/r/y/m${ext}` },
    );
    expect(edits.get(`/r/x/m${ext}`)?.text).toBe(`@import './v${ext}';`);
    const importer = run(
      { [`/r/x/m${ext}`]: `@import './v${ext}';`, [`/r/x/v${ext}`]: `` },
      { [`/r/x/v${ext}`]: `/r/y/v${ext}` },
    );
    expect(importer.has(`/r/x/m${ext}`)).toBe(false);
  });

  it('quotes an unquoted CSS url that gains a space or a bracket', () => {
    const edits = run(
      { '/r/s.css': `.a { background: url(a.png); }` },
      {
        '/r/a.png': '/r/my dir/a (1).png',
      },
      ['/r/a.png'],
    );
    expect(edits.get('/r/s.css')?.text).toBe(`.a { background: url("./my dir/a (1).png"); }`);
  });

  it('the filter never skips an index importer', () => {
    const edits = run(
      { '/r/math/index.ts': ``, '/r/u/c.ts': `import { m } from '../math';` },
      { '/r/math/index.ts': '/r/maths/index.ts' },
    );
    expect(edits.get('/r/u/c.ts')?.text).toBe(`import { m } from '../maths';`);
  });

  it('the filter matches a dot-specifier when an index moved', () => {
    const edits = run(
      { '/r/math/index.ts': ``, '/r/math/c.ts': `import { m } from '.';` },
      { '/r/math/index.ts': '/r/maths/index.ts' },
    );
    expect(edits.get('/r/math/c.ts')?.text).toBe(`import { m } from '../maths';`);
  });

  it('the filter changes no output', () => {
    const files = {
      '/r/math/index.ts': ``,
      '/r/u/c.ts': `import { m } from '../math';`,
      '/r/u/d.ts': `import 'react';`,
      '/r/t/e.ts': `import { q } from '../u/c';`,
    };
    const moves = { '/r/math/index.ts': '/r/maths/index.ts', '/r/u/c.ts': '/r/v/c.ts' };
    const plain = run(files, moves);
    const noisy = run(
      Object.fromEntries(Object.entries(files).map(([p, t]) => [p, `${t}\n// index c\n`])),
      moves,
    );
    const strip = (t: string) => t.replace('\n// index c\n', '');
    expect(new Set(noisy.keys())).toEqual(new Set(plain.keys()));
    for (const [from, edit] of plain) expect(strip(noisy.get(from)!.text)).toBe(edit.text);
  });

  it.each([
    ['/r/util.js', '/r/lib/util.js', `import './util'; require('./util');`, './lib/util'],
    ['/r/C.jsx', '/r/lib/C.jsx', `import './C';`, './lib/C'],
    ['/r/dir/index.js', '/r/dir2/index.js', `import './dir';`, './dir2'],
    ['/r/x.mts', '/r/lib/x.mts', `import './x.mjs';`, './lib/x.mjs'],
    ['/r/x.cts', '/r/lib/x.cts', `require('./x.cjs');`, './lib/x.cjs'],
    ['/r/x.d.mts', '/r/lib/x.d.mts', `import './x.mjs';`, './lib/x.mjs'],
    ['/r/x.ts', '/r/lib/x.ts', `import './x.jsx';`, './lib/x.jsx'],
  ])('keeps an importer of %s correct', (from, to, importer, expected) => {
    const edits = run({ [from]: ``, '/r/u.ts': importer }, { [from]: to });
    const specifiers = [...edits.get('/r/u.ts')!.text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(specifiers)).toEqual(new Set([expected]));
  });

  it('keeps an importer of a bare .json correct', () => {
    const edits = run({ '/r/u.ts': `require('./data');` }, { '/r/data.json': '/r/lib/data.json' }, [
      '/r/data.json',
    ]);
    expect(edits.get('/r/u.ts')?.text).toBe(`require('./lib/data');`);
  });

  it('a TS file beats a JS file for a .js spelling, so moving the TS file repoints it', () => {
    const edits = run(
      { '/r/x.js': ``, '/r/x.ts': ``, '/r/u.ts': `import './x.js';` },
      { '/r/x.ts': '/r/lib/x.ts' },
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import './lib/x.js';`);
  });

  const fooLayout = {
    '/r/src/foo.ts': ``,
    '/r/src/foo/index.ts': ``,
    '/r/src/foo/c.ts': `import { foo } from '.';`,
    '/r/src/g.ts': `import { foo } from './foo/';`,
  };

  it('moving a file leaves directory-only importers of its namesake folder alone', () => {
    const edits = run(fooLayout, { '/r/src/foo.ts': '/r/src/lib/foo.ts' });
    expect(edits.has('/r/src/foo/c.ts')).toBe(false);
    expect(edits.has('/r/src/g.ts')).toBe(false);
  });

  it('moving a folder index repoints directory-only importers, keeping the slash', () => {
    const edits = run(fooLayout, { '/r/src/foo/index.ts': '/r/src/bar/index.ts' });
    expect(edits.get('/r/src/foo/c.ts')?.text).toBe(`import { foo } from '../bar';`);
    expect(edits.get('/r/src/g.ts')?.text).toBe(`import { foo } from './bar/';`);
  });

  it.each([
    [`import '../..';`, `import '../../../other';`],
    [`import '../../';`, `import '../../../other/';`],
    [`import './../..';`, `import '../../../other';`],
    [`import '../../q/..';`, `import '../../../other';`],
  ])('the filter keeps a deep dot-specifier: %s', (before, after) => {
    const edits = run(
      { '/r/utils/index.ts': ``, '/r/utils/x/y/z.ts': before },
      { '/r/utils/index.ts': '/r/other/index.ts' },
    );
    expect(edits.get('/r/utils/x/y/z.ts')?.text).toBe(after);
  });

  it.each([
    [`import './';`, '/r/q/c.ts', `import '../n/';`],
    [`import '../';`, '/r/q/s/c.ts', `import '../../n/';`],
  ])('the filter keeps a slashed dot-specifier: %s', (before, importer, after) => {
    const edits = run(
      { '/r/q/index.ts': ``, [importer]: before },
      { '/r/q/index.ts': '/r/n/index.ts' },
    );
    expect(edits.get(importer)?.text).toBe(after);
  });

  it('the filter reads a moved name with regex characters literally', () => {
    const edits = run(
      { '/r/routes/$slug.ts': ``, '/r/u.ts': `import './routes/$slug';` },
      { '/r/routes/$slug.ts': '/r/pages/$slug.ts' },
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import './pages/$slug';`);
  });

  it('a moved file keeps a specifier that resolves to nothing, by path math', () => {
    const edits = run(
      { '/r/old/m.ts': `import './gen.js';\nimport './data.bin?raw';\nimport '.hidden/x';` },
      { '/r/old/m.ts': '/r/new/m.ts' },
    );
    expect(edits.get('/r/old/m.ts')?.text).toBe(
      `import '../old/gen.js';\nimport '../old/data.bin?raw';\nimport '.hidden/x';`,
    );
  });

  it('a moved stylesheet keeps a url that resolves to nothing, by path math', () => {
    const edits = run(
      { '/r/old/s.css': `.a { src: url(./gone.woff?#iefix); background: url(/abs.png); }` },
      { '/r/old/s.css': '/r/new/s.css' },
    );
    expect(edits.get('/r/old/s.css')?.text).toBe(
      `.a { src: url(../old/gone.woff?#iefix); background: url(/abs.png); }`,
    );
  });

  it('keeps a CSS url suffix when its file moves', () => {
    const edits = run(
      { '/r/s.css': `.a { src: url(./a.woff?#iefix); }` },
      { '/r/a.woff': '/r/f/a.woff' },
      ['/r/a.woff'],
    );
    expect(edits.get('/r/s.css')?.text).toBe(`.a { src: url(./f/a.woff?#iefix); }`);
  });

  it('keeps a dot-less CSS url whose relative place did not change', () => {
    const edits = run(
      { '/r/a/s.css': `.a { background: url(i.png); }` },
      { '/r/a/s.css': '/r/b/s.css', '/r/a/i.png': '/r/b/i.png' },
      ['/r/a/i.png'],
    );
    expect(edits.get('/r/a/s.css')?.text).toBe(`.a { background: url(i.png); }`);
  });

  it('the filter keeps a star-less alias that names neither stem nor folder', () => {
    const aliases = [
      {
        dir: '/r',
        rules: [
          { pattern: '#core', targets: ['/r/src/lib/engine.ts'] },
          { pattern: '#idx', targets: ['/r/kit/index.ts'] },
        ],
      },
    ];
    const edits = run(
      { '/r/src/lib/engine.ts': ``, '/r/kit/index.ts': ``, '/r/u.ts': `import '#core';` },
      { '/r/src/lib/engine.ts': '/r/src/core/engine.ts' },
      [],
      aliases,
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import './src/core/engine';`);
    const indexEdits = run(
      { '/r/kit/index.ts': ``, '/r/u.ts': `import '#idx';` },
      { '/r/kit/index.ts': '/r/tools/index.ts' },
      [],
      aliases,
    );
    expect(indexEdits.get('/r/u.ts')?.text).toBe(`import './tools/index';`);
  });

  it('the filter keeps a wildcard alias whose target adds to the file name', () => {
    const aliases = [{ dir: '/r', rules: [{ pattern: '@g/*', targets: ['/r/src/*.gen.ts'] }] }];
    const edits = run(
      { '/r/src/foo.gen.ts': ``, '/r/u.ts': `import '@g/foo';` },
      { '/r/src/foo.gen.ts': '/r/src/lib/foo.gen.ts' },
      [],
      aliases,
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import '@g/lib/foo';`);
  });

  it('a path holding a replacement pattern survives an alias rewrite', () => {
    const aliases = [{ dir: '/r', rules: [{ pattern: '@/*', targets: ['/r/src/*'] }] }];
    const edits = run(
      { '/r/src/routes/$&x.ts': ``, '/r/src/u.ts': `import '@/routes/$&x';` },
      { '/r/src/routes/$&x.ts': '/r/src/pages/$&x.ts' },
      [],
      aliases,
    );
    expect(edits.get('/r/src/u.ts')?.text).toBe(`import '@/pages/$&x';`);
  });

  it('rewrites a literal written with an escape', () => {
    const edits = run(
      { '/r/a.ts': ``, '/r/u.ts': `import './\\x61';` },
      { '/r/a.ts': '/r/lib/a.ts' },
    );
    expect(edits.get('/r/u.ts')?.text).toBe(`import './lib/a';`);
  });
});
