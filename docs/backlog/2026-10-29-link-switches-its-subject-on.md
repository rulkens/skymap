# A link or search pick switches its subject's Layer on

**Readiness:** `needs-design`. Ruled 2026-10-29, during the Earth satellites (#956): a deep link or a
search pick whose subject a switched-off Layer hides turns that Layer on, for every kind, not only
satellites. Its own PR with a spec and a ground check. Ruled **no new `SelectionKindRow` member** for
it: find another seam.

## Problem

Satellites start off (#956). With them off, `#focus=satellite-25544` never loads the catalog,
because the asset row demands only while a class is shown (`satellitesAssetRows.ts:38`). The
arrival then gives up after `ARRIVAL_TIMEOUT_MS` and lands home (`src/state/arrival/arrivalSaga.ts:4`).
Search finds no satellites either, since the catalog never loads. Any other subject behind an off
switch has the same problem.

## What exists

- The write side: `setVisibilityActionsFor` (`src/utils/visibility/setVisibilityActionsFor.ts:18`)
  turns any visibility address on. The tour's `show` cue already uses it
  (`src/state/tour/computeSceneEntering.ts`).
- Core composes each Layer's `selection` rows (`Layer.d.ts:100`, `composeSelectionRows.ts:23`), so
  it can tell which Layer owns a kind. `hasSectionSwitch` (`src/utils/visibility/hasSectionSwitch.ts:6`)
  says whether a cluster has a master switch.

## Open

- Which seam maps a ref to the switch that hides it, without a `SelectionKindRow` member. A coarse
  answer from data core already holds: turn on the owning Layer's section switch. That misses a
  per-item switch, such as a debris link with Debris off.
- The trigger: one core watch on `select`/`focus` covers links, search, tours and the remote. Hover
  must never switch anything on.
- The deep-link case before anything has loaded: the switch must flip before the arrival waits on a
  catalog that only loads once the switch is on.
