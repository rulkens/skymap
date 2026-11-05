/**
 * An SVG path that passes through every point in order as one smooth curve
 * (a Catmull-Rom spline written as cubic Béziers). `tension` 0 gives straight
 * segments; about 0.5 is a relaxed line.
 */
export function smoothPath(points: readonly (readonly [number, number])[], tension = 0.5): string {
  if (points.length === 0) return '';
  const at = (i: number) => points[Math.min(Math.max(i, 0), points.length - 1)]!;
  const n = (v: number) => Number(v.toFixed(2));
  let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = tension / 3;
    d +=
      ` C${n(p1[0] + (p2[0] - p0[0]) * k)} ${n(p1[1] + (p2[1] - p0[1]) * k)}` +
      ` ${n(p2[0] - (p3[0] - p1[0]) * k)} ${n(p2[1] - (p3[1] - p1[1]) * k)}` +
      ` ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}
