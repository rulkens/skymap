/**
 * minOf — minimum of a numeric array, returning `fallback` for an empty input.
 *
 * Walks the array by hand rather than `Math.min(...values)`: the argument
 * spread trips the engine's call-argument limit on the large catalog-sized
 * arrays this is used on. An empty array has no minimum, so the caller supplies
 * a `fallback` (e.g. a safe floor before a `log10`) rather than getting
 * `Infinity` back.
 */
export function minOf(values: readonly number[], fallback: number): number {
  let min = fallback;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (i === 0 || v < min) min = v;
  }
  return min;
}
