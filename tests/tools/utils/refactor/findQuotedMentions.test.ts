import { describe, expect, it } from 'vitest';
import { findQuotedMentions } from '../../../../tools/utils/refactor/findQuotedMentions';

const PICK = "import type { Shape } from './shape';\nexport type R = Pick<Shape, 'radius'>;\n";

function mentions(texts: Record<string, string>, known: { file: string; start: number }[] = []) {
  return findQuotedMentions({
    typeName: 'Shape',
    prop: 'radius',
    texts: new Map(Object.entries(texts)),
    known: known.map((k) => ({ ...k, end: k.start + 6 })),
  });
}

describe('findQuotedMentions', () => {
  it('reports the string in Pick<Shape, radius>', () => {
    expect(mentions({ '/r/use.ts': PICK })).toEqual([
      {
        file: '/r/use.ts',
        line: 2,
        message: "'radius' as a string: not a tracked reference, check by hand",
      },
    ]);
  });

  it('skips a string-key reference the engine already reported', () => {
    const text = "const x: Shape = a;\nconst y = a['radius'];\n";
    const start = text.indexOf("'radius'") + 1;
    expect(mentions({ '/r/a.ts': text }, [{ file: '/r/a.ts', start }])).toEqual([]);
  });

  it('skips a file that never mentions the type', () => {
    expect(mentions({ '/r/other.ts': "type K = Pick<Other, 'radius'>;" })).toEqual([]);
  });

  it('does not take a longer type name for the type', () => {
    expect(mentions({ '/r/other.ts': "type K = Pick<ShapeX, 'radius'>;" })).toEqual([]);
  });

  it('finds a double-quoted string type and not a longer string', () => {
    const text = 'type A = Pick<Shape, "radius">;\ntype B = Pick<Shape, "radiuses">;';
    expect(mentions({ '/r/q.ts': text }).map((f) => f.line)).toEqual([1]);
  });

  it('ignores a plain string expression in a file without keyof', () => {
    const text = "type S = Shape;\nconst k = 'radius';\nconst t = `radius`;";
    expect(mentions({ '/r/p.ts': text })).toEqual([]);
  });

  it('reports a string expression in a file that uses keyof Shape', () => {
    const text = "type K = keyof Shape;\nconst k: K = 'radius';\nconst t = `radius`;";
    expect(mentions({ '/r/k.ts': text }).map((f) => f.line)).toEqual([2]);
  });
});
