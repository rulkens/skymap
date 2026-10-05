/**
 * PassByDir — which way a `flyPath` offsets the eye off a galaxy centre so it
 * flies PAST the subject instead of through it.
 *
 * The offset is a lateral displacement of the interior eye knot, perpendicular
 * to the local travel direction; this names WHICH perpendicular:
 *
 *   - `outsideBend` — the outside of the path's turn at that knot, so the eye
 *     arcs around the galaxy on the convex side and the galaxy sits on the
 *     inside of the curve. Organic, but the screen-side varies per waypoint;
 *     on a near-straight leg (no bend to speak of) it falls back to `above`.
 *
 *   - `above` — world-up perpendicular: the eye passes over the top, so the
 *     galaxy sweeps DOWNWARD through frame. Consistent and documentary.
 *
 *   - `screenSide` — the travel-right perpendicular (tangent × up): the galaxy
 *     drifts consistently across one side of frame horizontally.
 */
export type PassByDir = 'outsideBend' | 'above' | 'screenSide';
