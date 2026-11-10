# Clear the last two Layer type-ownership rows

**Area:** engine / types · **Readiness:** needs-design

`tests/conventions/layerImportBoundary.test.ts`'s type-ownership sweep (owner ruling ZNbd,
2026-11-06) says a `src/@types/` file that only one Layer imports belongs in that Layer's own
`@types/`. 25 of the 27 files moved. Two rows remain in `LAYER_OWNED_TYPES_ALLOWED`:
`BlackHoleId` (blackHoles) and `CosmicWebDensityFieldId` (cosmicWebDensity).

Both are derived from `APP_SOURCE_REGISTRY` (`Extract<AnyEntry, { type: ... }>['id']`), and a
Layer may not import `src/compositions/`, so a plain move fails the composition-import sweep.
Clearing them needs a design call: write the id union out by hand in the Layer (and pin it to
the registry with a test), or derive it in compositions and hand it to the Layer another way.
When both are gone, delete the constant and its stale-row branch from the test.
