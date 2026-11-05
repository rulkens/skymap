import { describe, it, expect } from 'vitest';
import { catalogPickCodes } from '../../../src/utils/picking/catalogPickCodes';
import { fakePickCode } from '../../support/fakePickCode';

const ROWS = [
  [1, { id: 'a' }],
  [7, { id: 'b' }],
] as const;

describe('catalogPickCodes', () => {
  it('asks pickCode by entry id, and the inverse maps each code back to its catalog', () => {
    const codes = catalogPickCodes(ROWS, fakePickCode());
    expect([codes.pickCodeOf(1), codes.pickCodeOf(7)]).toEqual([40, 41]);
    expect(codes.catalogOfPickCode(41)).toBe(7);
  });

  it("answers null for a code it did not hand out (another Layer's)", () => {
    expect(catalogPickCodes(ROWS, fakePickCode()).catalogOfPickCode(1)).toBeNull();
  });
});
