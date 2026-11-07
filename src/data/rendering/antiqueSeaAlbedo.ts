/**
 * ANTIQUE_SEA_ALBEDO — the bodies whose dark albedo the antique look maps as sea
 * (`body-sea-mask`), as Huygens charted Syrtis Major in 1659. Each value is the
 * linear luma of the body's surface map below which a texel is sea: mean − 0.7σ of
 * that map, area-weighted and lightly blurred as the disc's mips sample it, which
 * keeps the classical dark markings (25% of Mars); a three-class Otsu cut also took
 * the mid-toned plains between them (47% of the Syrtis face).
 */
export const ANTIQUE_SEA_ALBEDO: Readonly<Record<string, number>> = {
  mars: 0.265,
};
