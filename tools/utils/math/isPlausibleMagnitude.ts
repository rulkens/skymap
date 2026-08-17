/**
 * isPlausibleMagnitude — "is this number a photometric measurement at all?"
 *
 * Every survey we parse marks missing photometry with an in-band numeric
 * sentinel rather than a blank cell: SDSS writes `-9999`, other VizieR
 * tables write `-999` or `99.99`, 2MRS publishes `99.999`. A parser that
 * only rejects NaN happily hands those straight through as magnitudes, and
 * they are not merely wrong — they are catastrophically wrong in the
 * direction the renderer amplifies. `absoluteFromApparent(-9999, d)` is a
 * perfectly FINITE −10040, so every downstream `Number.isFinite` guard
 * accepts it, the per-catalog zero-point collapses by several magnitudes,
 * and the tier sub-sampler (which ranks ascending by absolute magnitude)
 * promotes the sentinels to "brightest galaxies in the survey".
 *
 * Why an inclusive-range test and not an equality check against the known
 * sentinels? Because enumerating them means editing this function every
 * time a new source appears, and every miss is silent. A range test states
 * the actual physical claim instead: the brightest object in any catalog
 * here is far brighter than nothing at −27 (the Sun, the brightest thing a
 * human ever measures, is −26.7) and the faintest survey limits sit near
 * 25. `-30 < mag < 40` brackets that with an order of magnitude of slack in
 * both directions, so anything outside it is a sentinel or a parse error —
 * never a measurement. A value that is genuinely borderline-implausible but
 * inside the window stays the catalog's business, not this predicate's.
 *
 * Catalog-SPECIFIC missing-value rules do not belong here. Milliquas uses a
 * literal `0` for "band absent", which is a fact about Milliquas: zero is a
 * perfectly plausible magnitude in general (Vega is 0.03). That guard stays
 * in `tools/parsers/milliquas.ts` and composes with this one.
 */
export function isPlausibleMagnitude(mag: number): boolean {
  return mag > -30 && mag < 40;
}
