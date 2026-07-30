# Two label layers register fade handles nothing reads

`starCatalogLabel` and `bodyLabel` are full citizens of the fade system — a
`VisibilityLayerKey`, a `FADE_LAYERS` row, a `VISIBILITY_ACTION_ROW` factory, a
`FADE_ROW` entry in `watchFadesSaga`, and a clip address through
`fadeIdToVisibilityKey`. Nothing reads their opacity.

`foregroundLabelsLayer` computes its own caption target from the settings rows and
runs its own distance band, screen-space declutter and temporal envelope. It never
calls `resolveLayerOpacity`, which is the only production caller of
`fadeIdToVisibilityKey`. So both new arms are reachable only from tests.

## What works and what doesn't

- `hide(['bodyLabel'])` **works** — the intent path dispatches `setBodyLabelEnabled`,
  and the layer reads that settings row.
- `fade(['bodyLabel'], 0, 2)` **type-checks, registers, animates a controller, and
  changes zero pixels.**

Two authoring verbs on one key with different truth. That is the braid: caption
visibility is expressed in two places, and only one of them is wired.

## Why it wasn't just deleted

`tests/services/engine/wiring/fadeLayers.test.ts:42` asserts
`expectTypeOf<RowKeys>().toEqualTypeOf<VisibilityLayerKey>()` — the fade manifest and
the tour address space are pinned to the same set. Both keys are also live for
`VISIBILITY_ACTION_ROW` and for `LAYER_GROUPS.labels`, which the `'labels'` aggregate
fans out over. Removing the rows means unpicking that equality, not deleting four
lines.

## The two ways out

**Finish it.** Multiply the handle into the caption target — roughly six lines. The
precedent already sits ~40 lines below in the same file, where the constellation
caption path reads `opacityOf({ kind: 'constellations' })`. This makes clip opacity
work for body and star-map captions, which is what a tour author would expect from a
registered key.

**Or narrow the fade manifest** so it carries only layers with a real reader, and let
the tour address space be the wider set. That breaks the type-equality test on
purpose, and needs a story for what a clip cue on an unbacked key should do.

Finishing is the smaller change and the one that matches the docblocks' promise. The
comments now state the current situation honestly, so this is a correctness-of-design
item, not a lie shipping in the tree.
