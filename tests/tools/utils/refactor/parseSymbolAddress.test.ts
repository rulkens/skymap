import { describe, it, expect } from 'vitest';
import { parseSymbolAddress } from '../../../../tools/utils/refactor/parseSymbolAddress';

describe('parseSymbolAddress', () => {
  it('parses file#symbol into its parts', () => {
    expect(parseSymbolAddress('src/utils/math/clamp.ts#clamp')).toEqual({
      file: 'src/utils/math/clamp.ts',
      symbol: 'clamp',
    });
  });

  it("throws when the '#' delimiter is missing", () => {
    expect(() => parseSymbolAddress('src/utils/math/clamp.ts')).toThrow();
  });

  it('throws on an empty file or empty symbol', () => {
    expect(() => parseSymbolAddress('#clamp')).toThrow();
    expect(() => parseSymbolAddress('src/utils/math/clamp.ts#')).toThrow();
  });
});
