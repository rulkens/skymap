# Kepler solver has no hyperbolic branch, blocks Voyager

Surfaced while designing mesh bodies (whale/petunias): see
[the design spec](../superpowers/specs/2026-09-10-mesh-bodies-design.md), which
names Voyager as a future body on the same presentation arm (real mesh,
different position driver).

## What's there today

`eccentricAnomalyFromMean` (`src/utils/orbit/eccentricAnomalyFromMean.ts:26`)
solves `M = E − e·sin(E)` for the eccentric anomaly by Newton's method, and
its own docblock states the domain: `eccentricity` in `[0, 1)`, circular at
`e = 0`. `keplerianPositionMpc` (`src/utils/orbit/keplerianPositionMpc.ts`)
calls it unconditionally for every `ORBITAL_ELEMENTS` row. Every body on main
today is bound (`e < 1`), so the domain has never been exercised outside it.

## Why it's not done now

No hyperbolic body exists yet, and the hyperbolic form is a different
equation (`M = e·sinh(H) − H`, solved for `H` instead of `E`), not a small
patch to the existing Newton iteration: it needs its own convergence
analysis and its own position-from-anomaly conversion. Building it
speculatively, with nothing to verify it against, is exactly the kind of
work the project's convention asks to defer until a real consumer exists.

## The trigger

Voyager 1/2 (or any other body on an escape trajectory) landing as a scene
body. Voyager is explicitly named as a future consumer of the mesh-body
presentation arm in the mesh-bodies design spec, but its POSITION driver is
out of scope there; this is that follow-on.

## Shape of the fix

A hyperbolic counterpart to `eccentricAnomalyFromMean` (solve for `H`, own
Newton iteration, its own convergence bound since `e > 1` changes the
derivative's sign structure), and a hyperbolic counterpart to
`keplerianPositionMpc`'s anomaly-to-position step. `propagateElements`
(`src/utils/orbit/propagateElements.ts`) picks the branch by `e < 1` vs
`e > 1` at the row itself, the same way `moonRatesFromSiderealPeriods` exists
as a sibling to `moonRatesFromPeriods` rather than a special case inside it.

## Files involved

- `src/utils/orbit/eccentricAnomalyFromMean.ts`
- `src/utils/orbit/keplerianPositionMpc.ts`
- `src/utils/orbit/propagateElements.ts`
- `src/data/bodies/orbitalElements.ts`
