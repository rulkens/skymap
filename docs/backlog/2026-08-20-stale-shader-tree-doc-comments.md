# Stale shader-tree doc comments misclaim fullscreen-tri/upsample ownership

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):167,
§5 bug-suspects; also §4 item 2) and never filed. `ORPHAN` in the 2026-08-20
carry-forward audit — no BACKLOG.md line or backlog file existed for it.

## What it is

Two shader-tree doc comments describe a reality that has since drifted:

- `src/services/gpu/shaders/bloom/io.wesl`'s header
  (`bloom/io.wesl:1-9`) justifies keeping bloom's fullscreen-triangle vertex
  family-local by saying the shared implementation "is the TOOL's" — i.e.
  that no shared copy exists in the app, only in `galaxy-renderer`. That's no
  longer accurate: the app grew its own `lib/fullscreenTri.wesl` plus the
  `additiveUpsample` pipeline, so the premise for staying separate ("nothing
  to share against") is stale even if the family-locality _choice_ itself may
  still be the right call.
- `src/services/gpu/passes/additiveUpsample.ts:18-19` says "Two subsystems
  satisfy the contract today" (the CF4 scalar-volume raymarch and the Milky
  Way cloud's star aggregate). Zone-of-avoidance (#555) added a third:
  `zoneOfAvoidanceUpsample` now rides the same shared `additiveUpsample`
  factory (`initGpu.ts:401`, confirmed in
  [`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):124-131).
  The comment's "two" undercounts by one.

## Why it matters

Cleanup-severity, not a bug: nothing downstream reads these comments
programmatically. Left alone they'll keep misleading whoever next touches the
bloom/upsample shader family into re-deriving the sharing story from scratch,
or worse, "fixing" the wrong premise back into place — the doc says the shared
primitive doesn't exist in the app, so a future author might reintroduce the
duplication the audit already caught the app quietly outgrowing.

## Approach

Two independent one-line-ish fixes, no design needed:

1. `bloom/io.wesl`'s header: update the "why family-local" rationale to admit
   the app now has `lib/fullscreenTri.wesl` + `additiveUpsample`, and restate
   why bloom still doesn't ride them (if that's still the ruling) rather than
   implying no shared copy exists.
2. `additiveUpsample.ts:18-19`: "Two subsystems" → "Three subsystems", naming
   zone-of-avoidance's upsample alongside the CF4 volume raymarch and the
   Milky Way star aggregate.

Cheap check per the original audit: diff each comment's claim against current
imports/call sites before editing, in case a further subsystem joined since
this file was written.
