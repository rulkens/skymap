// ─── Synthetic FITS builder (in-memory: throw-path + synthesized-row tests) ─
//
// Real FITS files pad every header to a whole number of 2880-byte blocks
// (36 cards × 80 chars). This mirrors `glade.test.ts`'s `makeFixture` idiom
// of writing a synthetic fixed-width record byte-by-byte via a small `put`
// helper — here the "fixed width" unit is the 80-char FITS card instead of
// a column range.

export const CARD_SIZE = 80;
export const BLOCK_SIZE = 2880;
