/**
 * meanAnomalyAtJ2000 — convert Gillessen et al. 2017's pericentre epoch `Tp`
 * (a fractional year) into `OrbitalElements.meanAnomalyRad` at J2000.
 *
 * `M = 2π(2000.0 − Tp)/P` is signed by which side of J2000 the tabulated
 * pericentre falls on — most S-stars in the table have `Tp` AFTER 2000, so
 * the raw value is negative. JS's `%` keeps the sign of the dividend, so a
 * bare `raw % 2π` would leave those negative; `((raw % τ) + τ) % τ` (the
 * same non-negative-modulo idiom `lerpAngleShortest` uses) folds any signed
 * multiple of the period — not just the nearest one — into `[0, 2π)`, since
 * nothing here guarantees `|2000 − Tp| < P`.
 */
const TAU = 2 * Math.PI;

export function meanAnomalyAtJ2000(periapsisEpochYr: number, periodYr: number): number {
  const raw = (TAU * (2000.0 - periapsisEpochYr)) / periodYr;
  return ((raw % TAU) + TAU) % TAU;
}
