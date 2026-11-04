import { describe, it, expect } from 'vitest';
import { posix } from 'node:path';
import { planMoves } from '../src/planMoves';
import type { MoveContext } from '../src/@types/MoveContext';
import type { MovePair } from '../src/@types/MovePair';

const context: MoveContext = {
  root: '/r',
  config: {
    companions: [
      { from: 'src/', to: 'tests/', sources: ['.ts', '.tsx'], suffixes: ['.test.ts'] },
      { from: '', to: '', sources: ['.tsx'], suffixes: ['.module.css'] },
    ],
    extraMockCallees: [],
  },
  aliasScopes: [],
};

// A fake project. With `foldCase` the disk answers as macOS's does, whatever the case
// asked for, while `listed` keeps the exact names git holds.
function plan(
  request: MovePair[],
  files: Record<string, string>,
  { assets = [] as string[], foldCase = false } = {},
) {
  const present = [...Object.keys(files), ...assets].map((p) => `/r/${p}`);
  const name = (p: string) => (foldCase ? p.toLowerCase() : p);
  const directories = new Set<string>();
  for (const path of present) {
    for (let d = posix.dirname(path); d !== '/'; d = posix.dirname(d)) directories.add(name(d));
  }
  const snapshot = {
    texts: new Map(Object.entries(files).map(([p, t]) => [`/r/${p}`, t])),
    listed: new Set(present),
    fileExists: (p: string) => present.map(name).includes(name(p)),
    directoryExists: (p: string) => directories.has(name(p)),
  };
  return planMoves(request, snapshot, context);
}
const codes = (r: ReturnType<typeof plan>) =>
  r.ok ? [] : r.refusals.map((x) => `${x.code}:${x.path}`);

describe('planMoves', () => {
  it('refuses every invalid pair at once', () => {
    const r = plan(
      [
        { from: 'src/gone.ts', to: 'src/x.ts' },
        { from: 'src/a.ts', to: 'src/b.ts' },
      ],
      { 'src/a.ts': '', 'src/b.ts': '' },
    );
    expect(codes(r)).toEqual(['missing-source:src/gone.ts', 'occupied-destination:src/b.ts']);
  });

  it('refuses duplicates', () => {
    const r = plan(
      [
        { from: 'src/a.ts', to: 'src/x.ts' },
        { from: 'src/a.ts', to: 'src/y.ts' },
        { from: 'src/b.ts', to: 'src/z.ts' },
        { from: 'src/c.ts', to: 'src/z.ts' },
      ],
      { 'src/a.ts': '', 'src/b.ts': '', 'src/c.ts': '' },
    );
    expect(codes(r)).toEqual(['duplicate-source:src/a.ts', 'duplicate-destination:src/z.ts']);
  });

  it('refuses a path outside the repo', () => {
    const r = plan([{ from: 'src/a.ts', to: '../x.ts' }], { 'src/a.ts': '' });
    expect(codes(r)).toEqual(['outside-repo:../x.ts']);
  });

  it('a name that only starts with dots is inside the repo', () => {
    const r = plan([{ from: 'src/a.ts', to: '..foo.ts' }], { 'src/a.ts': '' });
    expect(r.ok).toBe(true);
  });

  it('allows a destination this batch vacates', () => {
    const r = plan(
      [
        { from: 'src/a.ts', to: 'src/b.ts' },
        { from: 'src/b.ts', to: 'src/c.ts' },
      ],
      { 'src/a.ts': '', 'src/b.ts': '' },
    );
    expect(r.ok).toBe(true);
  });

  it('refuses a companion with nowhere to go', () => {
    const files = { 'src/a.ts': '', 'tests/a.test.ts': '' };
    const r = plan([{ from: 'src/a.ts', to: 'lib/a.ts' }], files);
    expect(codes(r)).toEqual(['companion-unplaceable:tests/a.test.ts']);
  });

  it('an explicit pair resolves an unplaceable companion', () => {
    const files = { 'src/a.ts': '', 'tests/a.test.ts': '' };
    const r = plan(
      [
        { from: 'src/a.ts', to: 'lib/a.ts' },
        { from: 'tests/a.test.ts', to: 'lib/a.test.ts' },
      ],
      files,
    );
    expect(r.ok).toBe(true);
  });

  describe.each([[false], [true]])('case, with foldCase %s', (foldCase) => {
    it('allows a case-only rename', () => {
      const r = plan(
        [{ from: 'src/Foo.ts', to: 'src/foo.ts' }],
        { 'src/Foo.ts': '' },
        { foldCase },
      );
      expect(r.ok).toBe(true);
    });

    it('allows a destination that only differs by case from a file this batch vacates', () => {
      const r = plan(
        [
          { from: 'src/x.ts', to: 'src/foo.ts' },
          { from: 'src/Foo.ts', to: 'src/y.ts' },
        ],
        { 'src/x.ts': '', 'src/Foo.ts': '' },
        { foldCase },
      );
      expect(r.ok).toBe(true);
    });

    it('refuses a destination differing only by case from a file that stays', () => {
      const r = plan(
        [{ from: 'src/x.ts', to: 'src/foo.ts' }],
        { 'src/x.ts': '', 'src/Foo.ts': '' },
        { foldCase },
      );
      expect(codes(r)).toEqual([
        foldCase ? 'occupied-destination:src/foo.ts' : 'case-collision:src/foo.ts',
      ]);
    });

    it('refuses a case-differing asset that stays', () => {
      const r = plan(
        [{ from: 'a.png', to: 'B.png' }],
        {},
        {
          assets: ['a.png', 'b.png'],
          foldCase,
        },
      );
      expect(codes(r)).toEqual([foldCase ? 'occupied-destination:B.png' : 'case-collision:B.png']);
    });

    it('refuses two destinations in a batch differing only by case', () => {
      const r = plan(
        [
          { from: 'a.ts', to: 'x/foo.ts' },
          { from: 'b.ts', to: 'x/Foo.ts' },
        ],
        { 'a.ts': '', 'b.ts': '' },
        { foldCase },
      );
      expect(codes(r)).toEqual(['case-collision:x/Foo.ts']);
    });

    it('refuses a destination in a folder differing only by case from an existing one', () => {
      const r = plan(
        [{ from: 'a.ts', to: 'Lib/deep/a.ts' }],
        { 'a.ts': '', 'lib/deep/b.ts': '' },
        { foldCase },
      );
      expect(codes(r)).toEqual(['case-collision:Lib/deep/a.ts']);
    });

    it('refuses two destination folders in a batch differing only by case', () => {
      const r = plan(
        [
          { from: 'a.ts', to: 'lib/a.ts' },
          { from: 'b.ts', to: 'Lib/b.ts' },
        ],
        { 'a.ts': '', 'b.ts': '' },
        { foldCase },
      );
      expect(codes(r)).toEqual(['case-collision:Lib/b.ts']);
    });

    it('allows a destination in a folder of exactly that case', () => {
      const r = plan(
        [{ from: 'a.ts', to: 'lib/deep/a.ts' }],
        { 'a.ts': '', 'lib/deep/b.ts': '' },
        { foldCase },
      );
      expect(codes(r)).toEqual([]);
    });

    it('refuses a source named in the wrong case', () => {
      const r = plan(
        [{ from: 'foo.ts', to: 'lib/x.ts' }],
        { 'Foo.ts': '', 'main.ts': `import './Foo';` },
        { foldCase },
      );
      expect(codes(r)).toEqual(['missing-source:foo.ts']);
    });
  });

  it('a real file beside a case-only rename stays occupied', () => {
    const r = plan([{ from: 'src/Foo.ts', to: 'src/foo.ts' }], {
      'src/Foo.ts': '',
      'src/foo.ts': '',
    });
    expect(codes(r)).toEqual(['occupied-destination:src/foo.ts']);
  });

  it('refuses a source git does not list, even when the disk has it', () => {
    const r = planMoves(
      [{ from: 'secret.ts', to: 'lib/secret.ts' }],
      {
        texts: new Map(),
        listed: new Set(),
        fileExists: (p) => p === '/r/secret.ts',
        directoryExists: () => false,
      },
      context,
    );
    expect(r.ok ? [] : r.refusals.map((x) => x.code)).toEqual(['missing-source']);
  });

  it('refuses a listed source that is gone from disk', () => {
    const r = planMoves(
      [{ from: 'gone.ts', to: 'lib/gone.ts' }],
      {
        texts: new Map(),
        listed: new Set(['/r/gone.ts']),
        fileExists: () => false,
        directoryExists: () => false,
      },
      context,
    );
    expect(r.ok ? [] : r.refusals.map((x) => x.code)).toEqual(['missing-source']);
  });

  it.each([
    ['an existing directory', 'dir'],
    ['a trailing slash', 'newdir/'],
    ['a path under a file', 'file.txt/a.ts'],
    ['a path deep under a file', 'file.txt/x/y/a.ts'],
    ['an apostrophe', `it's/a.ts`],
    ['a double quote', `a"b/a.ts`],
    ['a backtick', 'a`b/a.ts'],
    ['a backslash', 'a\\b/a.ts'],
  ])('refuses a destination with %s', (_, to) => {
    const files = { 'a.ts': '', 'file.txt': '', 'dir/k.ts': '', 'u.ts': `import './a';` };
    const r = plan([{ from: 'a.ts', to }], files);
    expect(r.ok ? [] : r.refusals.map((x) => x.code)).toEqual(['invalid-destination']);
  });

  it('refuses a destination another destination in the batch sits under', () => {
    const r = plan(
      [
        { from: 'a.ts', to: 'x' },
        { from: 'b.ts', to: 'x/y.ts' },
      ],
      { 'a.ts': '', 'b.ts': '' },
    );
    expect(codes(r)).toEqual(['invalid-destination:x/y.ts']);
  });

  it('drops a move to where the file already is', () => {
    const r = plan([{ from: 'a.ts', to: './a.ts' }], { 'a.ts': '' });
    expect(r.ok && r.plan.moves).toEqual([]);
  });

  it('moves a file that has no text, such as an asset', () => {
    const r = plan(
      [{ from: 'public/a.png', to: 'public/b.png' }],
      {},
      { assets: ['public/a.png'] },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.edits).toEqual([]);
  });

  it('drags companions and reports findings', () => {
    const r = plan([{ from: 'src/ui/Card.tsx', to: 'src/box/Card.tsx' }], {
      'src/ui/Card.tsx': `import s from './Card.module.css';`,
      'src/ui/Card.module.css': `.a { composes: b from '../x.module.css'; }`,
      'src/x.module.css': '.b {}',
      'tests/ui/Card.test.ts': `import '../../src/ui/Card';`,
      'src/old.ts': `const p = 'src/ui/Card.tsx';`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.moves.map((m) => m.to)).toEqual([
      'src/box/Card.tsx',
      'tests/box/Card.test.ts',
      'src/box/Card.module.css',
    ]);
    expect(r.plan.edits.find((e) => e.to === '/r/tests/box/Card.test.ts')?.text).toBe(
      `import '../../src/box/Card';`,
    );
    expect(r.plan.findings.map((f) => `${f.file}:${f.reason}`)).toEqual([
      '/r/src/old.ts:mentions-old-path',
    ]);
  });
});
