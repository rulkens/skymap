/**
 * SplineMode — which basis a `flyPath` fits through its waypoints.
 *
 *   - `centripetal` — centripetal (α=0.5) Catmull-Rom. The tangent at a knot is
 *     the CENTRAL difference through its neighbours, so the curve (and the aim,
 *     which looks down the tangent) starts banking toward the NEXT waypoint
 *     before reaching the current one. Smooth and loop-free; the default.
 *
 *   - `causalHermite` — cubic Hermite whose arrival tangent is the INCOMING
 *     chord alone (a backward / "causal" difference). The camera reaches each
 *     interior waypoint head-on and only turns toward the next one AFTER passing
 *     it — a "fly in straight, then bank away" feel. `turnDelay` scales the
 *     tangent magnitude (overshoot on sharp corners).
 *
 * The two are an inspector-selectable A/B; authored clips default to
 * `centripetal`, so the choice changes nothing until a clip (or the inspector)
 * opts into `causalHermite`.
 */
export type SplineMode = 'centripetal' | 'causalHermite';
