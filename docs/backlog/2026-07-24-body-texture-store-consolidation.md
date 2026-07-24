# Body-texture store consolidation

## The problem

Four body renderers each own their own copy of the same three concerns:
texture storage, format/colour-space selection, and placeholder fallback.
A change to any one of them (the fallback ladder, the linear-vs-sRGB
predicate, eviction on release) has to be applied three or four times in
parallel instead of once.

## Verified current state

- `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` owns
  `maps: Map<TextureKind, GPUTexture>` per body (line 123) plus a
  per-kind 1×1 `placeholderMaps` map (line 186), resolved in
  `buildBindGroup` as `res.maps.get(kind) ?? placeholderMaps.get(kind)!`
  (line 305).
- `src/services/gpu/renderers/bodies/earthRenderer.ts` owns Earth's five
  maps as five separate mutable `let` bindings (`texture`,
  `materialTexture`, `nightTexture`, `normalTexture`, `cloudTexture`,
  lines 330-346), with its own placeholder factory `createPlaceholder`
  (line 309) and its own `setMap` (line 479).
- `src/services/gpu/renderers/bodies/ringRenderer.ts` owns a single
  `let texture` (line 123) swapped by `setTexture` (line 229).
  `cloudShellRenderer.ts` is a fourth instance of the same shape
  (`setTexture`, line 264).
- All four re-derive format/colour-space selection independently:
  `texturedBodyRenderer` from `KIND_CFG`, `earthRenderer` from
  `isLinearTextureKind`, and the two single-texture renderers hardcode
  `rgba8unorm-srgb` since they only ever hold one sRGB map.

## Consequence

Surfaced concretely by the boot load-priority feature (see
[`docs/grill-sessions/boot-load-priority-2026-07-24.md`](../grill-sessions/boot-load-priority-2026-07-24.md)):
its per-body placeholder resolver change (`texturedBodyRenderer`
placeholder mechanism → per-body atlas tile, one of the three prep
refactors identified there) has to land three times to cover
`texturedBodyRenderer`, `earthRenderer`, and the ring/cloud-shell pair.
The refactor-ground checkpoint for that feature decided the three prep
refactors proceed as parallel per-renderer changes, and spun this
consolidation out here rather than scoping it into the same prep — prep
is bounded to exactly the delta the feature needs, and this is
substantially larger than that delta.

## The commit-side routing is a second instance of the same split

Which renderer receives a body's texture is dispatched by a hand-written
`bodyId === 'earth'` branch, now in two places: `commitBodyTexture`
(`src/services/engine/wiring/bodyTextureSlotRegistry.ts:88-116`, three
arms — Earth, the shared textured bodies, ring ids) and the atlas
commit's placeholder fan-out
(`src/services/loading/slots/bodyTextureAtlasSlot.ts`, two arms). A
second body earning its own renderer, or Earth gaining a placeholder
consumer the way it gained `cloudShellRenderer`, means editing both.

The un-braided shape is a sink table keyed by body id —
`Record<BodyTextureId, sink>` with one row per body, `setMap` and
`setPlaceholderMap` as two operations on the row — which is the same
table the store below wants anyway. Fold it into that design rather
than dispatching it separately.

## Proposed fix

Extract a shared body-texture store the renderers use for map storage
and placeholder resolution, so the fallback ladder and format selection
have one home instead of three or four. Needs a design pass: whether the
store is per-renderer-instance or shared across all bodies, how it
generalizes `texturedBodyRenderer`'s multi-kind map from `earthRenderer`'s
five-map and the single-texture renderers' one-map shapes, and how it
interacts with the boot-load-priority atlas-tile placeholder work landing
in parallel.
