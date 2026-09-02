# InfoCard live phase + apparent-magnitude rows for bodies

**Surfaced:** 2026-07-21, scoped out of the time-control surface plan
(PR #472; final branch review finding 2).

## Context

The time-control feature publishes throttled per-focus distance
(`selectEngine(state).focusedBodyDistanceMpc`, via the `engineBodyDistanceReported`
pub) that the InfoCard's body detail card renders as a live Distance row.
`simDays` lives in the `time` slice (`state/time/timeSlice.ts`), not on this
pub. The spec's surface section also named phase and apparent magnitude as
time-dependent rows; those need per-body ephemeris quantities the pub does not
carry (phase angle from the sun-body-observer geometry; apparent magnitude
from distance + phase + albedo model), so they were disclosed as partial
delivery rather than grown into the pub mid-plan.

Related open question from the original radar finding (PR #472 description,
against the now-removed `TimeReport` pub): whether growing a pub for phase
rows is still the right shape, given `simDays` already lives on the `time`
slice's `anchor` and could be read from there directly instead.

## The work

Grow the engine time pub (or a sibling per-focus pub) with phase angle and
apparent magnitude for the focused body, derived from the frame snapshot at
publish time; add the two presentational rows to `BodyDetailCard` behind the
existing memo'd container. Cheap once the geometry helpers exist; the moon
phases especially are a natural InfoCard row ("waxing gibbous, 78% lit").
