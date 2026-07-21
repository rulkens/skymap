/**
 * CONST_J2000 — the J2000.0 epoch expressed as sim-days (a Julian-Date-like
 * scalar), the zero point the body clock measures from.
 *
 * The whole element table (`ORBITAL_ELEMENTS`) tabulates its mean anomalies at
 * J2000.0 = JD 2451545.0. `deriveBodyStates(simDays)` takes a sim-day scalar so
 * a clock can advance the scene; evaluating it at `CONST_J2000` is, by
 * definition, the epoch the elements were authored for — the "now" the static
 * scene has always shown.
 *
 * ### Data-layer placement
 *
 * This lives in `src/data/` beside the other authored scene constants
 * (`renderOrigin`, `scaleUnits`) rather than next to `deriveBodyStates` in the
 * services layer: it is a property of the element data's epoch, not of the
 * frame helper that reads it, so data-layer and feature code alike can name the
 * epoch without importing a services module (which would be an upward,
 * layer-crossing import).
 *
 * At prep the rate-less derive does not yet read `simDays` — every body is
 * evaluated at its tabulated J2000 mean elements regardless — so the exact value
 * here is not load-bearing until §3 rate propagation fills that seam. It is
 * authored now so the seam has a name.
 */

/** The J2000.0 epoch as a JD-like sim-day scalar (JD 2451545.0). */
export const CONST_J2000 = 2451545.0;
