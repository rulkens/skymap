# Empty the Layer type-ownership allow-list (move-only PR)

**Area:** engine / types · **Readiness:** ready

`tests/conventions/layerImportBoundary.test.ts`'s type-ownership sweep (owner ruling ZNbd,
2026-11-06) says a `src/@types/` file that only one Layer imports belongs in that Layer's own
`@types/`. At the selection-kind-facts landing, 27 files break the rule. They are listed in the
test's `LAYER_OWNED_TYPES_ALLOWED`, one row each, `'<key>': '<layer>'`.

Every row really can clear by a move. A `src/@types/` importer counts as core, so a type a core
type imports (a `*SourceEntry` the `SourceEntry` union names, say) is not a row. The one
exception is an importer that is itself a row: it counts as its own Layer, and the two files
move together (`FlowMode` with `FlowFieldDefaults`, `ColourTreatment` with `BodyTextureSpec`).

Empty the list in one move-only PR: `npm run move-files -- src/<key>.d.ts
src/layers/<layer>/@types/<Name>.d.ts` per row. Delete each row in the same change. The sweep
fails on a stale row, so the list cannot fall out of step with the tree. Then grep the old
paths in `packages/website/src/data/*Facts.ts`, which move-files does not rewrite.
