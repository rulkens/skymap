/**
 * ANTIQUE_ALBEDO_MASK — the bodies whose albedo the antique look reads off their own
 * map (`body-albedo-mask`), not off the lit colour, for its own print convention
 * (`antiqueLook/bodies/`). Each value is the linear luma at the middle of the mask's
 * lightness ramp: mean − 0.7σ of the body's map, area-weighted and lightly blurred as
 * the disc's mips sample it. On Mars that sets apart the classical dark markings
 * Huygens drew in 1659 (25% of the planet); a three-class Otsu cut also took the
 * mid-toned plains between them (47% of the Syrtis face).
 */
export const ANTIQUE_ALBEDO_MASK: Readonly<Record<string, number>> = {
  mars: 0.265,
};
