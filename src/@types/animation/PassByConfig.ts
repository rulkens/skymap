/**
 * PassByConfig — how a `flyPath` flies PAST its interior galaxy waypoints
 * rather than straight through their centres.
 *
 * By default the eye flies the spline through each waypoint's centre — right for
 * sweeping through a group CLOUD, wrong for an individual galaxy (the eye rams
 * the billboard). A `PassByConfig` on the flyPath opts that leg's subjects into
 * a flyby: the interior eye knots are displaced laterally off-centre, so the eye
 * sweeps past at a chosen framing rather than through the subject. Absent =
 * through-centre (the historical behaviour), so a groups flythrough that sets no
 * `passBy` is untouched.
 *
 * The knobs are one cinematographic concept — "the flyby" — grouped so the
 * inspector gates them as a single override (like `SplineConfig`'s causal arm):
 *
 *   - `offset` — how far off-centre the eye passes, in units of the subject's
 *     RADIUS. 0 = through the centre; ~4 = the galaxy fills roughly a third of
 *     the frame at closest approach; framing distance is ~16 radii (gentle).
 *   - `dir` — which perpendicular the offset points along. See `PassByDir`.
 */
import type { PassByDir } from './PassByDir';

export type PassByConfig = {
  readonly offset: number;
  readonly dir: PassByDir;
};
