# Rename `famousMeta` → `famousGalaxiesMeta`

The star sidecar is `famousStarsMeta`; the galaxy one is just `famousMeta`. Two
curated sources of the same shape, named as if only one of them has a subject.
`famousGalaxiesMeta` makes the pair read as a pair.

## Scope: symbols **and** the data file

Symbols:

| Now                                        | After                          |
| ------------------------------------------ | ------------------------------ |
| `AssetKey 'famousMeta'`                    | `'famousGalaxiesMeta'`         |
| `famousMetaSlot.ts`                        | `famousGalaxiesMetaSlot.ts`    |
| `famousMetaFetcher.ts`                     | `famousGalaxiesMetaFetcher.ts` |
| `useFamousMeta`                            | `useFamousGalaxiesMeta`        |
| `GalaxyStore.famousMeta` / `setFamousMeta` | `…famousGalaxiesMeta` / `set…` |
| `FamousMetaEntry`, `UseFamousMetaReturn`   | `FamousGalaxiesMeta…`          |
| the `EngineAssetSlots` field               | ditto                          |

Data file: `famous_meta.json` → `famous_galaxies_meta.json`, written by
`tools/famous/buildFamous.ts` and uploaded by `tools/deploy/syncR2.ts`.

Measured blast radius: **55 `src/` + 48 `tests/` + 2 `tools/` files**, plus 82
docs files.

## Deploy order is load-bearing

1. Rebuild the sidecar **in the main checkout** — a worktree's `public/data` is a
   symlink to main's, so a rebuild there writes into main.
2. Sync R2 so **both** names exist.
3. Deploy the code.
4. Drop the old R2 object.

A missing sidecar is fail-soft — the InfoCard and CommandPalette lose their text
rather than crashing — so a mis-ordered deploy degrades rather than breaks. It
still ships a visibly emptier InfoCard, so the order is worth keeping.

## Mechanics

File moves go through `npm run move-files` (ts-morph rewrites imports). It does
**not** rewrite string literals, and `'famousMeta'` (the `AssetKey`) and
`'famous_meta.json'` (the filename) are both string literals. Grep for each after
moving; the `AssetKey` union will catch the first at compile time, the second will
not.

## Sequencing

Branch off `main` **after** the body-sources-bear-labels PR merges. The two collide
in `assetWiring.ts`, `AssetKey.d.ts`, `EngineAssetSlots.d.ts`, `engine.ts`,
`createBodyStore.ts` and `wireSlots.test.ts`.
