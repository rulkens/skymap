/**
 * catmullRom — uniform Catmull-Rom interpolation of one scalar channel.
 *
 * Evaluates the cubic spline segment between `p1` (at `t=0`) and `p2` (at
 * `t=1`), using the neighbouring control points `p0` and `p3` to set the
 * tangents. The curve passes THROUGH every control point (unlike a Bézier),
 * which is exactly what a waypoint path wants: the camera visits each authored
 * waypoint, and the neighbours only shape the curvature of the approach.
 *
 * ### Why uniform (not centripetal) parametrisation?
 *
 * Centripetal Catmull-Rom (knot spacing ∝ √chord) avoids cusps and
 * self-intersections when control points are unevenly spaced. A camera fly-path
 * is reparametrised by ARC LENGTH downstream (so perceived speed is uniform
 * regardless of knot spacing), and its waypoints are deliberately placed not to
 * double back — so the uniform form's simpler, allocation-free evaluation is the
 * better trade here. The arc-length pass is where even spacing is recovered.
 *
 * Standard uniform Catmull-Rom basis (tension ½):
 *
 *   p(t) = ½ · [ 2p1
 *               + (−p0 + p2)·t
 *               + (2p0 − 5p1 + 4p2 − p3)·t²
 *               + (−p0 + 3p1 − 3p2 + p3)·t³ ]
 *
 * Apply component-wise (call once per channel) to spline a multi-dimensional
 * pose through its waypoints.
 *
 * @param p0  Control point before the segment (sets the entry tangent).
 * @param p1  Segment start — returned at `t=0`.
 * @param p2  Segment end — returned at `t=1`.
 * @param p3  Control point after the segment (sets the exit tangent).
 * @param t   Segment-local parameter in `[0, 1]`.
 */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
