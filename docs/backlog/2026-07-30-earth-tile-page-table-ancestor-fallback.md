# Earth tile page-table ancestor fallback is one level deep

`deferred`

## The problem

A page-table cell today either names a resident tile or reads all-zero, which
the fragment reads as "sample the whole-globe base texture" — see
`buildEarthPageTable`'s module header and `fragment.wesl`'s `A === 0` branch.
That is a fallback with exactly one rung: the specific tile, or the base.
Every surveyed virtual-texturing system instead resolves residency at sample
time by walking up to the **nearest resident coarser ancestor**, not
straight to the coarsest possible level.

## Verified current state

`planEarthTiles` only ever requests **leaves** of its refinement walk
(`src/utils/scene/planEarthTiles.ts:236`, `requests.push({ tile: { kind, z,
x, y }, screenPx })` inside the leaf branch) — a tile that gets refined
continues the walk to its four children without itself being requested or
fetched. So no intermediate level between the base and a deep leaf is ever
resident in the atlas; there is nothing for a "nearest coarser ancestor" walk
to find between them yet.

`buildEarthPageTable` already writes resident tiles in increasing `z`
(`src/utils/scene/buildEarthPageTable.ts:86`, `entries.sort((a, b) =>
a.tile.z - b.tile.z)`) so a finer resident tile overwrites its coarser
resident ancestor's cells — that part of the mechanism generalizes to
multiple levels already. What is missing is any resident tile **between**
the base and the requested leaf to overwrite in the first place, because
none is ever fetched.

This is invisible today because exactly one level is baked (z5): the walk
either resolves at the base (`zWin === baseLevel`) or at the single tile
level, so "skip straight to the base" and "walk up through the pyramid" are
the same behaviour. It stops being the same the moment Phase E bakes z3
through z7 (or deeper): a leaf several levels below the base could fail to
load while a nearer ancestor two or three levels up would have covered the
ground more accurately than the base.

## What the research found

van Waveren, _Software Virtual Textures_ (2012) §3.1, describes storing "a
mapping to the nearest resident coarser texture page" in the page table.
Gaia Sky's globe virtual texture loops up through levels in the fragment
shader to find one. Both assume some ancestor levels are resident
independent of what the finest requested leaf is.

## Directions to explore (design decides)

- Have the planner request ancestor tiles along the refinement path as well
  as leaves, so intermediate levels populate the atlas and the existing
  finest-resident-ancestor write order in `buildEarthPageTable` does the rest
  with no new lookup logic.
- Or keep leaf-only fetching and add an explicit per-cell walk-up in the
  fragment shader (van Waveren's and Gaia Sky's approach), reading a chain of
  candidate levels rather than one page-table lookup.
- Whichever shape, it wants a test with a resident set spanning three or more
  levels with gaps, asserting each cell names the nearest resident ancestor
  rather than jumping straight to the base.

## Related

`src/utils/scene/planEarthTiles.ts`,
`src/utils/scene/buildEarthPageTable.ts`,
`src/services/gpu/shaders/bodies/earth/fragment.wesl`.
`docs/superpowers/plans/2026-07-29-earth-surface-virtual-texture-a-to-d.md`
("What the research found", item 6).
