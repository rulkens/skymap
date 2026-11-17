/*
 * The byte layout of assets/starField.bin, shared by its writer (tools/site/utils/encodeStarField.ts) and its
 * reader (utils/decodeStarField.ts). Little-endian:
 *   u8 version, u8 layer count, u8 palette count, u8 0
 *   per layer: u16 median distance in pc, u16 star count
 *   per tint: u8 r, g, b; then one byte of padding if the header is odd, for the 16-bit columns
 *   columns of N stars: u16 along, i16 across, u8 mag, u8 tint
 * The steps keep each value well under a pixel at the page's scale (0.0055° along, 0.01° across, 0.05 mag).
 */
export const STAR_FIELD_FORMAT = {
  version: 1,
  alongPerDeg: 65536 / 360,
  acrossPerDeg: 100,
  magOffset: 2,
  magPerUnit: 20,
} as const;
