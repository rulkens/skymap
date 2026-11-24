import { describe, it, expect } from 'vitest';
import { parseTarget } from '../../../../tools/utils/refactor/parseTarget';

describe('parseTarget', () => {
  it('parseTarget reads file#symbol as a symbol address', () => {
    expect(parseTarget('src/utils/math/clamp.ts#clamp')).toEqual({
      kind: 'symbol',
      file: 'src/utils/math/clamp.ts',
      symbol: 'clamp',
    });
  });

  it('parseTarget reads file#Type.prop as a prop address', () => {
    expect(parseTarget('src/shape.ts#Shape.radius')).toEqual({
      kind: 'prop',
      file: 'src/shape.ts',
      typeName: 'Shape',
      prop: 'radius',
    });
  });

  it('parseTarget rejects two dots', () => {
    expect(() => parseTarget('src/shape.ts#A.b.c')).toThrow(/A\.b\.c/);
  });

  it('parseTarget rejects an empty half of Type.prop', () => {
    expect(() => parseTarget('src/shape.ts#Shape.')).toThrow();
    expect(() => parseTarget('src/shape.ts#.radius')).toThrow();
  });

  it("throws when the '#' delimiter is missing", () => {
    expect(() => parseTarget('src/utils/math/clamp.ts')).toThrow();
  });

  it('throws on an empty file or empty symbol', () => {
    expect(() => parseTarget('#clamp')).toThrow();
    expect(() => parseTarget('src/utils/math/clamp.ts#')).toThrow();
  });
});
