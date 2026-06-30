/**
 * maxVisibleCamDistSq — the squared camera distance beyond which no galaxy can
 * subtend `minPx`, used as the disk planners' inner-loop early-out bound.
 *
 * Inverts `apparentSizePxAtDistance`: a galaxy of diameter `d` subtends
 * `(d/dist)·pxPerRad` pixels, so it can only reach `minPx` while
 * `dist ≤ (d·pxPerRad)/minPx`. Feeding the largest plausible diameter
 * (`maxDiameterKpc`) gives the loosest bound — any row past it is too far to
 * matter at *any* size, so the loop skips the square root and the apparent-size
 * math entirely. Returning the *squared* bound lets the caller compare against
 * `dx²+dy²+dz²` without its own root.
 *
 * `maxDiameterKpc` defaults to 200 — the one home for the disk planners' "no
 * real galaxy is wider than this" constant, which both the procedural (LOD-1)
 * and textured (LOD-2) planners share. (The hi-res famous planner uses its own,
 * larger bound and does not call this.)
 */
export function maxVisibleCamDistSq(minPx: number, pxPerRad: number, maxDiameterKpc = 200): number {
  const dMpcMax = maxDiameterKpc / 1000;
  const maxDist = (dMpcMax * pxPerRad) / minPx;
  return maxDist * maxDist;
}
