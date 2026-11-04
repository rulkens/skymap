import { describe, it, expect } from 'vitest';
import { rewriteReferences } from '../../../packages/move-files/src/rewriteReferences';
import type { MoveContext } from '../../../packages/move-files/src/@types/MoveContext';

const context: MoveContext = {
  root: '/r',
  config: { companions: [], extraMockCallees: [] },
  aliasScopes: [],
};

function run(files: Record<string, string>, moves: Record<string, string>, assets: string[] = []) {
  const snapshot = {
    texts: new Map(Object.entries(files)),
    fileExists: (p: string) => assets.includes(p),
  };
  const edits = rewriteReferences(snapshot, new Map(Object.entries(moves)), context);
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
});
