/** A uniform random number from `low` up to `high`. */
export function randomBetween(low: number, high: number): number {
  return low + Math.random() * (high - low);
}
