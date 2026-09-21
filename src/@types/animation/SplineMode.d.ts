/**
 * SplineMode — the bare basis NAME a `flyPath` fits through its waypoints,
 * derived from `SplineConfig`'s discriminant so the two can never drift.
 *
 *   - `centripetal` — centripetal (α=0.5) Catmull-Rom. The tangent at a knot is
 *     the CENTRAL difference through its neighbours, so the curve (and the aim,
 *     which looks down the tangent) starts banking toward the NEXT waypoint
 *     before reaching the current one. Smooth and loop-free; the default.
 *
 *   - `causalHermite` — cubic Hermite whose arrival tangent is the INCOMING
 *     chord alone (a backward / "causal" difference). The camera reaches each
 *     interior waypoint head-on and only turns toward the next one AFTER passing
 *     it — a "fly in straight, then bank away" feel.
 *
 * Use this where only the basis name matters (the inspector dropdown). The
 * causal-only knobs (`turnDelay`, `lookAhead`) live on `SplineConfig`'s
 * `causalHermite` arm, NOT here — a basis name carries no pacing.
 */
import type { SplineConfig } from './SplineConfig';

export type SplineMode = SplineConfig['kind'];
