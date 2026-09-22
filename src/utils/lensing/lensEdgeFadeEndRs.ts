/**
 * lensEdgeFadeEndRs — where the Sgr A* lens's escape fade must reach zero, in
 * r_s. Weak-field deflection is 2/b rad (b in r_s), so it drops below one
 * screen pixel at b = 2·pxPerRad. Capped at 0.6× the anchor distance because
 * a billboard's impact-parameter coverage can never exceed that distance
 * (0.6 bounds the vertex's plane-stretch factor at 1.25 — see
 * `lensQuadPlaneRadiusRs`), and floored at the LUT's own max so the fade
 * never cuts into the LUT-resolved strong-field region during a close
 * descent — fading at the raw LUT edge blends a sky still deflected ~40 px
 * into the true sky.
 */
export function lensEdgeFadeEndRs(
  distRs: number,
  pxPerRad: number,
  lutMaxImpactParamRs: number,
): number {
  return Math.max(lutMaxImpactParamRs, Math.min(2 * pxPerRad, 0.6 * distRs));
}
