// Real FITS files pad every header to whole 2880-byte blocks (36×80-char
// cards); mirrors `glade.test.ts`'s synthetic fixed-width `put` idiom.

export const CARD_SIZE = 80;
export const BLOCK_SIZE = 2880;
