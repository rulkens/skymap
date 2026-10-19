# The clock pushes one history entry per time action, including every scrub pointermove

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`hashParamSources.ts:198`'s `t` row triggers on every `time/*` action; its docblock (`:38-43`) says the slice "carries no hot stream". `ExhibitTimelineContainer.tsx:65` dispatches `setSimDays` on every pointermove from `TimelineTrack.tsx:83-86`. `watchHashWriteSaga.ts:119` picks push unless an arrival or hash navigation armed replace, and `debounce(0)` cannot merge separate pointer tasks (`:66-68`). In manual mode `pause`/`resume`/`setRate` re-anchor and push too. `hashHistoryIntegrity.test.ts` has no clock-stream case.

## Direction

A clock-only diff writes with replace, or `t` publishes on gesture end. Add the clock-stream case to the integrity test first; fix the docblock's premise.
