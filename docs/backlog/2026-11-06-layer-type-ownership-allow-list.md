# Empty the Layer type-ownership allow-list (move-only PR)

**Area:** engine / types · **Readiness:** ready

`tests/conventions/layerImportBoundary.test.ts`'s type-ownership sweep (owner ruling ZNbd,
2026-11-06) says a `src/@types/` file that only one Layer imports belongs in that Layer's own
`@types/`. At the selection-kind-facts landing, 48 files break the rule. They are listed in the
test's `LAYER_OWNED_TYPES_ALLOWED`, one row each, `'<key>': '<layer>'`.

Empty the list in one move-only PR: `npm run move-files -- src/<key>.d.ts
src/layers/<layer>/@types/<Name>.d.ts` per row. Delete each row in the same change. The sweep
fails on a stale row, so the list cannot fall out of step with the tree. Then grep the old
paths in `packages/website/src/data/*Facts.ts`, which move-files does not rewrite.
