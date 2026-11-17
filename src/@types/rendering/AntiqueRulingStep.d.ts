/**
 * AntiqueRulingStep — one rung of the plate's ruling ladder, degrees: the
 * interval between rulings (and numbers), and the border ladder's chequer cell
 * that subdivides it (`ANTIQUE_RULING_STEPS`).
 */
export type AntiqueRulingStep = { readonly stepDeg: number; readonly cellDeg: number };
