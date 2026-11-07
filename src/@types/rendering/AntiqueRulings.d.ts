/**
 * AntiqueRulings — the plate's one RA and one Dec ruling interval, degrees,
 * picked per frame by `antiqueGraticuleSteps`; the border numbers stand where
 * these rulings meet it.
 */
export type AntiqueRulings = { readonly raDeg: number; readonly decDeg: number };
