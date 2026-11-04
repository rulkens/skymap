import { describe, it, expect, vi } from 'vitest';
import { findBrokenReferences } from '../src/findBrokenReferences';
import { findLiteralRanges } from '../src/findLiteralRanges';
import type { FileEdit } from '../src/@types/FileEdit';

vi.mock('../src/findLiteralRanges', async (actual) => {
  const module =
    await actual<typeof import('../src/findLiteralRanges')>();
  return { findLiteralRanges: vi.fn(module.findLiteralRanges) };
});

function guard(
  files: Record<string, string>,
  moves: Record<string, string>,
  assets: string[] = [],
  edits?: FileEdit[],
) {
  const texts = new Map(Object.entries(files));
  const snapshot = { texts, fileExists: (p: string) => assets.includes(p) };
  const moveMap = new Map(Object.entries(moves));
  // Without explicit edits, moved files carry their text unchanged, as the engine emits them.
  const effective =
    edits ?? [...moveMap].map(([from, to]) => ({ from, to, text: texts.get(from) ?? '' }));
  return findBrokenReferences(snapshot, effective, moveMap, '/r');
}

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

  it('reports an old repo-relative path in a string', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `\n\nconst p = 'src/a/b.ts';` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([
      { file: '/r/t.ts', line: 3, text: `const p = 'src/a/b.ts';`, reason: 'mentions-old-path' },
    ]);
  });

  it('matches old paths on a path boundary', () => {
    const findings = guard(
      { '/r/src/a/b.ts': ``, '/r/t.ts': `const p = 'xsrc/a/b.tsx'; const q = 'src/a/b.test.ts';` },
      { '/r/src/a/b.ts': '/r/src/c/b.ts' },
    );
    expect(findings).toEqual([]);
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

  it('checks CSS urls', () => {
    const findings = guard(
      { '/r/old/s.css': `.a { background: url(./i.png); }` },
      { '/r/old/s.css': '/r/new/s.css' },
      ['/r/old/i.png'],
    );
    expect(findings).toEqual([
      expect.objectContaining({ file: '/r/new/s.css', reason: 'no-longer-resolves' }),
    ]);
  });
});
