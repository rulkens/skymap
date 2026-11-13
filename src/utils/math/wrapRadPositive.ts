/** The angle wrapped to [0, 2π): JS `%` keeps the dividend's sign, so fold it twice. */
export function wrapRadPositive(rad: number): number {
  const TAU = Math.PI * 2;
  return ((rad % TAU) + TAU) % TAU;
}
