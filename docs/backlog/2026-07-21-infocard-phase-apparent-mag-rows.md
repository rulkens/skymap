# InfoCard live phase + apparent-magnitude rows for bodies

**Surfaced:** 2026-07-21, scoped out of the time-control surface plan
(PR #472; final branch review finding 2).

## Context

The time-control feature publishes a throttled `TimeReport`
(`state.engine.timeReport`) that carries `simDays` and
`focusedBodyDistanceMpc`. The InfoCard's body detail card renders a live
Distance row from it. The spec's surface section also named phase and
apparent magnitude as time-dependent rows; those need per-body ephemeris
quantities the pub does not carry (phase angle from the sun-body-observer
geometry; apparent magnitude from distance + phase + albedo model), so they
were disclosed as partial delivery rather than grown into the pub mid-plan.

Related open question (radar finding, PR #472 description): `TimeReport.simDays`
currently has no reader — growing the pub for phase rows would either justify
it or supersede it.

## The work

Grow the engine time pub (or a sibling per-focus pub) with phase angle and
apparent magnitude for the focused body, derived from the frame snapshot at
publish time; add the two presentational rows to `BodyDetailCard` behind the
existing memo'd container. Cheap once the geometry helpers exist; the moon
phases especially are a natural InfoCard row ("waxing gibbous, 78% lit").
