import { describe, it, expect } from 'vitest';
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

function plan(request: MovePair[], files: Record<string, string>, assets: string[] = []) {
  const snapshot = {
    texts: new Map(Object.entries(files).map(([p, t]) => [`/r/${p}`, t])),
    fileExists: (p: string) => assets.map((a) => `/r/${a}`).includes(p),
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

  it('refuses destinations differing only by case', () => {
    const r = plan([{ from: 'src/x.ts', to: 'src/foo.ts' }], { 'src/x.ts': '', 'src/Foo.ts': '' });
    expect(codes(r)).toEqual(['case-collision:src/foo.ts']);
  });

  it('allows a case-only rename', () => {
    const r = plan([{ from: 'src/Foo.ts', to: 'src/foo.ts' }], { 'src/Foo.ts': '' });
    expect(r.ok).toBe(true);
  });

  it('moves a file that has no text, such as an asset', () => {
    const r = plan([{ from: 'public/a.png', to: 'public/b.png' }], {}, ['public/a.png']);
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
