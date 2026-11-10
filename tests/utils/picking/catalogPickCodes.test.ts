import { describe, it, expect } from 'vitest';
import { catalogPickCodes } from '../../../src/utils/picking/catalogPickCodes';

const ROWS = [{ id: 'a' }, { id: 'b' }] as const;
const pickCode = (id: string): number => (id === 'a' ? 40 : 41);

describe('catalogPickCodes', () => {
  it('asks pickCode by entry id, and the inverse maps each code back to its catalog', () => {
    const codes = catalogPickCodes(ROWS, pickCode);
    expect([codes.pickCodeOf('a'), codes.pickCodeOf('b')]).toEqual([40, 41]);
    expect(codes.catalogOfPickCode(41)).toBe('b');
  });

  it("answers null for a code it did not hand out (another Layer's)", () => {
    expect(catalogPickCodes(ROWS, pickCode).catalogOfPickCode(1)).toBeNull();
  });
});
