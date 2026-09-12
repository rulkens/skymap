/**
 * goldenSig — the precision both golden traces record at. Rounding the live
 * value and the fixture the same way is what lets the comparison be an exact
 * `toBe` instead of a tolerance nobody can justify.
 */

export function goldenSig(x: number): number {
  return Number(x.toPrecision(12));
}
