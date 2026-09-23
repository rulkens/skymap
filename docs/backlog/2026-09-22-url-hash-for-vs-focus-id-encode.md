# `URL_HASH_FOR` duplicates `SelectionKindRow.focusId.encode`

`needs-verification`. Surfaced during the `blackHoles` Layer ground
preparation while reading the selection/URL contracts the new Layer's
`SelectionKindRow` will need to fill in.

## What is true today

- `src/services/url/urlHashFor.ts`'s `URL_HASH_FOR` is a
  `Record<FocusableTargetType, (t: FocusableTarget) => string | null>` — one
  row per focusable kind, each encoding that kind's `FocusableTarget` into the
  `#focus=<id>` URL body.
- `src/@types/engine/layer/SelectionKindRow.d.ts`'s `focusId.encode(ref):
  string | null` does the same job over the `SelectionRef` side of the same
  kinds, and is already populated for five of today's six rows
  (`src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow.ts`,
  `src/layers/starCatalog/present/starCatalogSelectionRow.ts`,
  `src/services/engine/selection/{body,milkyWay,structure}SelectionRow.ts`).
- The galaxy arm on each side reaches the same codec
  (`selectionToFocusId`/`focusUrl.ts`) independently — two call sites for one
  answer, one keyed on `FocusableTarget`, the other on `SelectionRef`.

## The question to verify before spec'ing anything

`FocusableTarget` (InfoCard/hover state) and `SelectionRef` (store selection)
are different shapes for the same identity per kind — is a `FocusableTarget`
always mechanically derivable from its `SelectionRef` (or vice versa) for
every arm, such that `URL_HASH_FOR` could call `focusId.encode` through that
mapping instead of re-deriving the id string itself? If yes, this is a real
duplication to collapse — one encoder per kind, not two. If the two shapes
diverge for some arm (a `FocusableTarget` carrying data no `SelectionRef`
has, or the reverse), the duplication is load-bearing and this item should be
closed as "verified, not a bug." Check both directions on all six arms,
including `zoneOfAvoidance` (no `focusId` row at all — `URL_HASH_FOR` returns
null for it, consistent) before designing a merge.
