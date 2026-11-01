# A per-body slab declaration on `LayerBody`

**Readiness:** `needs-design`. Needs a consented `LayerBody` contract addition.

## Problem

Which bodies draw in a `'body'` slab is spelled twice: once as the rows a Layer's `slabs` (or
`bodySlabRowOf`, for a hostless craft) produces, and once as a hand-kept roster in core. A body added
to a Layer must also land in that core roster, or NEAR0 draws it a second time as a resolved sphere.

## Current state

- `near0SphereBodies` (`src/services/engine/frame/near0SphereBodies.ts:13`) drops every resolved body in
  `bodySlabRosterIds` from NEAR0's spheres, so a body that draws on a slab is not drawn twice.
- `bodySlabRosterIds` (`src/services/engine/frame/bodySlabRosterIds.ts`) builds that set from
  `SCENE_PLANETS` and the frame's present mesh bodies. It is static on purpose: deriving it from
  `state.slabRows` would let any Layer's slab row, whatever sits at its anchor, suppress a NEAR0 sphere.
- The body Layer declares its Earth and planet rows in `src/layers/body/present/bodySlabRows.ts`;
  the roster and those rows are two lists that must agree.

## Idea

A body declares its own slab on `LayerBody`; the roster is then the fold of those declarations, and
the rows come from the same fold. `near0SphereBodies` follows without a second list.

## Caveat: the Sgr A* lens anchor

blackHoles' row is anchored on a place, not a body (`blackHoleAnchorId`, a `PlaceId`: the Galactic
Centre, `src/layers/blackHoles/present/blackHoleSlabRow.ts`), and its `hosts` line is `lens`, not a body
draw. A roster derived from `slabRows` anchors would catch it; the declaration must stay per body, and
the lens row must remain a Layer `slabs` row with no body behind it.

J13 in the [layer-migration survey](2026-10-29-layer-migration-leftovers.md) refines this: the roster to replace is `bodySlabRosterIds` (`SCENE_PLANETS` + mesh bodies), ~35 LOC.
