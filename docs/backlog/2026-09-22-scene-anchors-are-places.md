# `SCENE_ANCHORS`/`AnchorBody` is the place table, filed under a body name

`needs-design`. Surfaced during the `blackHoles` Layer ground preparation
(`2026-09-22-black-holes-layer-design.md` §2.2), which added `PlaceId` and
the first non-body row (`GALACTIC_CENTRE_ANCHOR`) to a table whose name and
folder still say "body".

## What is true today

- `src/data/bodies/sceneAnchors.ts` exports `SCENE_ANCHORS: readonly
  AnchorBody[]` — "roots of the focus graph: positions stated outright, not
  derived from `OrbitalElements`". It holds the seeded star map, the Sun's own
  row, and now `GALACTIC_CENTRE_ANCHOR` (a `PlaceId`, not a `BodyId`) plus
  `SGR_A_STAR_ALIAS`, a body row that aliases the place's own `positionMpc` by
  reference.
- `src/@types/scene/AnchorBody.d.ts`'s `id` is a bare `string` — it was never
  typed as `BodyId`, so nothing in the type forced this file to be
  body-only. The mixing was possible from the start; the black-hole prep is
  the first row to actually exploit it.
- The file lives under `data/bodies/`, alongside `sceneStars.ts`, `sceneSun.ts`
  and the maker functions — a folder whose name is a real claim ("this data is
  about bodies") that a `PlaceId` row now contradicts.

## The question

Is `SCENE_ANCHORS` a body table that a place is borrowing space in until
`galactic-centre` gets a real home, or is it actually the **place anchor
table**, general over `BodyId | PlaceId`, that happens to have started with
only bodies in it? If the latter, it wants a name and location that says so
(`data/places/sceneAnchors.ts`? folded into `data/places/` entirely?) and
`AnchorBody.id` wants retyping to the union rather than `string`. If the
former, the `blackHoles` PR 2 should be the one to give `galactic-centre` its
own small table instead of borrowing this one, and `SGR_A_STAR_ALIAS` is a
temporary wart to delete in the same PR (its own comment already says so).

Not blocking PR 2: `galacticCenter.ts`, `bodyRegions.ts` and
`scaleFadeBands.ts` all read `GALACTIC_CENTRE_ANCHOR` directly, not through
`SCENE_ANCHORS`, so the answer here doesn't gate anything already landed.
