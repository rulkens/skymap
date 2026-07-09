/**
 * SplineConfig — which basis a `flyPath` fits through its waypoints, WITH the
 * knobs that only that basis understands.
 *
 * This is a discriminated union, not a flat `{ spline, turnDelay, lookAhead }`
 * record, on purpose: `turnDelay` (overshoot) and `lookAhead` (the look leads
 * the eye) are meaningful ONLY for the causal-Hermite basis. Hanging them as
 * optional siblings of a `spline` string lets an author write the contradiction
 * `{ spline: 'centripetal', turnDelay: 2 }` — a value that silently does nothing.
 * Folding them INTO the `causalHermite` arm makes that state unrepresentable: the
 * compiler rejects `turnDelay` on the `centripetal` arm, so a knob can never be
 * attached to a basis that ignores it.
 *
 *   - `centripetal` — centripetal (α=0.5) Catmull-Rom. Banks toward the next
 *     waypoint before arriving. Carries no extra knobs. The default.
 *
 *   - `causalHermite` — cubic Hermite whose arrival tangent is the incoming
 *     chord (arrives head-on, turns after passing). `turnDelay` scales the
 *     tangent magnitude (overshoot on sharp corners); `lookAhead` (seconds)
 *     leads the look down the path ahead of the eye. Both omittable → builder
 *     defaults (`DEFAULT_TURN_DELAY` / `DEFAULT_LOOK_AHEAD`).
 *
 * `SplineMode` is the bare discriminant (`'centripetal' | 'causalHermite'`),
 * used where only the basis NAME is needed (the inspector dropdown).
 */
export type SplineConfig =
  | { readonly kind: 'centripetal' }
  | {
      readonly kind: 'causalHermite';
      readonly turnDelay?: number;
      readonly lookAhead?: number;
    };
