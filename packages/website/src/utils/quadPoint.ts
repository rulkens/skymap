/** The quadratic Bézier from `p0` to `p2` bent toward `p1`, as a function of t in 0..1. */
export function quadPoint(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): (t: number) => readonly [number, number] {
  return (t) => {
    const a = (1 - t) ** 2;
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
  };
}
