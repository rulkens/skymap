# Layer composition (d), PR-C — the galaxy-side un-braids

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(d): rulings **D10, D11, D12** and prep item **P7**, with §4.7 (source rows), the joints-table rows
"Source codes through the Layer", "The companion relation", "The pick-camera uniform", "Famous meta's
dual home", the **PR packaging** table (PR-C row) and the "Backlog consumption" paragraph. D1's
`Sources` parameter is as 04b shipped it (`Layer.d.ts:28-31,43`; `defineLayer.ts:16`); D3's drift
edge is as 04a shipped it (`reevaluateDemand.ts:99-113`), which is what lets a companion ride its
parent's request.

Plan 04c of the layer-composition sequence; follows plan 04b
([`completed/2026-09-15-layer-composition-04b-contract-empty-tuple.md`](completed/2026-09-15-layer-composition-04b-contract-empty-tuple.md)).
Third of the four stacked PRs §9(d) D14 packages (d) into: PR-A (shipped, #703), PR-B (shipped,
#711), **PR-C (this plan)**, PR-D (the Layer itself).

Branch: `worktree-layer-composition-04c` (off `a4e7fe9b1`). One PR, 6 tasks, every commit green.
Gate (spec PR-C row): the suite, plus a pick spot-check on structure rings and the Milky Way. **No
perf gate**: the spec assigns PR-C none, and the one per-frame change is the pick-camera upload
shrinking — the structure ring pick writes 80 bytes instead of 192, the Milky Way pick 96 instead
of 192, both on the pick path only (one upload per pick, never per frame). Nothing new runs per
frame; the demand loop walks the same row count with the same predicates.

Tasks are grouped by file locality for the lean protocol's serial dispatches: **1–3** (sources and
the demand table), **4–5** (the two pick renderers and their shaders), **6** (the famous-meta
store). No task depends on a later one; 2 depends on 1, 3 on 2, 5 on 4 only through the shared
`pickUniformBytesOf` comment edits.

## Goal

Every galaxy source is declared once, in an entry module that already lives at its PR-D path; the
demand table derives its galaxy rows from those entries, and "the famous meta rides the famous
catalog" is one field core expands. The structure and Milky Way pick paths stop importing the
galaxy renderer's 192-byte uniform image and read the 80-byte core camera prefix every world-space
renderer already shares. Famous-galaxy meta lives on the galaxy store, set when its slot settles,
and every engine-side reader reads it there.

Behaviour-neutral, with two named exceptions. User-visible: the Milky Way's minimum pick size
stops tracking the galaxy size slider (D12's ruled change — a data constant equal to today's
default-slider value, so at the default slider nothing moves). Not user-visible: the famous point
slot's debug-panel label reads `famousGalaxy-points` instead of `famous-points` (Ruling 3).

## Architecture

- **One declaration per source (D11).** The nine galaxy entry modules move from `src/data/sources/`
  to `src/layers/galaxyCatalog/sources/` and absorb the four facts
  `GALAXY_CATALOG_SOURCE_REGISTRY` (`galaxyCatalogSourceRegistry.ts:32-74`) and the `ASSET_WIRING`
  point rows (`assetWiring.ts:222-241`) hold beside them today: `category`, the fetcher **kind**,
  and the fetch `priority`. `GALAXY_CATALOG_SOURCE_ROWS`, a `readonly [code, entry]` tuple in the
  `Sources` shape 04b declared, is the Layer's future `sources` field and today's only authority:
  `SOURCE_REGISTRY` becomes the 24 unformed entries plus `sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS)`,
  `GALAXY_CATALOG_SOURCES` (the code list every consumer iterates) and `GalaxyCatalogId` derive from
  the tuple, the slot-mint loop iterates the codes and reads the entry through `SOURCE_REGISTRY`,
  and `ASSET_WIRING` maps one point row per entry. The companion relation becomes `companionOf` on
  the famous-meta row; `expandCompanionRows` — core, pure, run once where the table is built —
  derives its demand (parent not idle), priority (parent + 1) and request (the parent's, so 04a's
  drift edge reloads it on a tier swap).
- **The shared pick camera is the 80-byte prefix (D12).** `cameraUniforms.ts:64-85` and
  `lib/camera.wesl:77-82` are that prefix already, and the structure ring vertex stage declares
  nothing else (`structureMarker/io.wesl:35-39`). `pickRing` takes `(viewProj, viewportPx)` and
  writes the prefix the way `draw` does (`structureMarkerRenderer.ts:523-527`); its pick buffer
  shrinks to `CAMERA_UNIFORM_BYTES`. The Milky Way pick gets its own 96-byte struct — the prefix
  plus `camPosWorld` and `pxPerRad`, the two facts its billboard sizing reads
  (`milkyWay/pick/vertex.wesl:60-63`) — and its minimum size moves into the static `@group(2)`
  uniform as a data constant. `pickUniformBytesOf` keeps exactly one reader,
  `galaxyPointSpritesPass.ts:98`, galaxy code that leaves core in PR-D with the helper.
- **Famous meta on the galaxy store (D10).** `GalaxyStore` gains `famousMeta` + `setFamousMeta`;
  the sidecar slot's subscriber writes it on `ready` and resets it to `[]` on `error`, beside the
  redux dispatch it makes today. The six engine-side readers read the store, and
  `EngineState.famousGalaxiesMeta`, `PassState`'s entry and `ResolveDeps.famousGalaxiesMeta` go
  (`ResolveDeps.catalogs` becomes the store view that carries it). The redux copy stays — see
  Finding row 9 and Ruling 4.

## Global Constraints

Binding on every task, from CLAUDE.md and the spec:

- **One symbol per file** in `src/utils/` and `src/@types/`; filename = the exported symbol;
  `src/@types/` is one TYPE per file. Deep relative imports, no barrels. `type` aliases, never
  `interface`.
- **Frame files (`src/services/engine/frame/**`, incl. `timing/`and`passes/`) declare only their
own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.\*\*
- **Comment budget** per [`comments.md`](../conventions/comments.md): module header ≤ 5 lines,
  comment lines ≤ half the code lines; no cross-file line citations in code comments. Every file
  this PR edits with a 30–90-line header (`galaxyCatalogSourceRegistry.ts`, `assetWiring.ts`,
  `AssetWiringRow.d.ts`, `milkyWayPickRenderer.ts`, `milkyWay/pick/io.wesl`, `famousGalaxiesMetaSlot.ts`,
  `MilkyWayPickRenderer.d.ts`, `StructureMarkerRenderer.d.ts`) comes under budget in the task that
  edits it; deleted prose is not re-homed.
- **Tests** are judged by [`testing.md`](../conventions/testing.md): no registry restatements, no
  runtime type tests. The three tests this plan adds each fail on a real bug named in the task.
- **`src/data/` never imports `services/`; `src/utils/` never imports `services/`.** The entry
  modules keep importing only `src/data/source.ts` and types — the invariant Ruling 1 rests on.
- **Every file move/rename goes through `npm run move-files -- <from> <to>`** (`--dry` first), never
  `git mv`; afterwards grep for the old path in `.wesl` `package::` imports and string literals
  (none expected: no shader imports a TS path, and no string literal names these files).
- **The import-boundary ratchet** (`tests/conventions/layerImportBoundary.test.ts`) keeps its one
  inbound row and its empty outbound list. No task adds a row (Ruling 1).
- Commit after every task.

## Findings at HEAD `a4e7fe9b1`

Verified in this worktree while writing the plan; the spec's line references predate #703 and #711.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                                                                                                                               | What it means                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Sources` IS threaded: `Layer.sources?: Sources` with the `readonly (readonly [SourceType, SourceEntry])[]` bound, `defineLayer` takes it `const`. `ComposedSources<Layers>` exists, type-only, no consumer (04b Ruling 8).                                                                                                                                                                                                                      | `Layer.d.ts:28-31,43`, `defineLayer.ts:16`, `ComposedSources.d.ts`                                                                                                                                                  | The tuple this plan mints is already the right shape for PR-D's `sources:` field; `ComposedSources` is untouched here.                                                                                                                                                               |
| 2   | The ratchet sweeps `src/services/engine/**` and `src/state/**` inbound (type-only imports count) and `src/layers/**` outbound; `src/data/**`, `src/@types/**`, `src/utils/**` are outside both sweeps.                                                                                                                                                                                                                                           | `layerImportBoundary.test.ts:79-114`                                                                                                                                                                                | Ruling 1: the tuple is reached through `src/data/sources.ts`; wiring never imports `src/layers/`.                                                                                                                                                                                    |
| 3   | `GALAXY_CATALOG_SOURCES` (UI/draw order: Synthetic, Famous, 2MRS, SDSS, GLADE, Milliquas, DesiDeep, DesiWedge, DesiSgw) has fourteen importers and its order is load-bearing for `catalogStore`'s back-to-front draw iteration; `GALAXY_CATALOG_SOURCE_REGISTRY` (enum order) has three: the mint loop, the two derived lists, and their tests. The brief's suggested tuple name `GALAXY_CATALOG_SOURCES` is therefore taken.                    | `sources.ts:213-223`, `catalogStore.ts:38,117-125`, `wireSlots.ts:110-112`, `galaxyCatalogSourceRegistry.ts:83-89`                                                                                                  | The tuple is `GALAXY_CATALOG_SOURCE_ROWS` in `GALAXY_CATALOG_SOURCES`' order; the code list derives from it, so one order survives and `catalogStore.test.ts:169-190` pins it unchanged. The enum-order test (`galaxyCatalogSourceRegistry.test.ts:123-138`) dies with the registry. |
| 4   | The registry's `fetcher` is a FUNCTION reference; `galaxyCatalogFetcher` imports `data/tierTargets` → `data/sources`.                                                                                                                                                                                                                                                                                                                            | `galaxyCatalogSourceRegistry.ts:19-20,33-73`, `galaxyCatalogFetcher.ts:42`                                                                                                                                          | An entry cannot hold the function without a `data → services` edge and a module-init cycle through `sources.ts`; the entry holds a KIND, the mint helper maps kind → function (Task 2).                                                                                              |
| 5   | `shortName` equals `id` for eight of nine sources; only Famous differs (`famous` vs `famousGalaxy`). Slot names `${shortName}-points` key `deps.allSlots` and the debug panel; nothing else reads them.                                                                                                                                                                                                                                          | `galaxyCatalogSourceRegistry.ts:33-73,104`, `installLoadProgress.ts:43-91`; `sources/*.ts:7`                                                                                                                        | Ruling 3: `shortName` is not absorbed; `id` names the slot.                                                                                                                                                                                                                          |
| 6   | The Synthetic point row demands on `ctx.request('syntheticFallback')`, not the settings toggle; every other point row demands on `settings.galaxyCatalogs.items[id].enabled`. D6 replaces the request flag with a slot-state predicate in PR-D.                                                                                                                                                                                                  | `assetWiring.ts:79-91,231-241`, `createSyntheticFallback.ts:158`                                                                                                                                                    | The derived row branches on `entry.category === 'synthetic'` (Ruling 2); PR-D changes the branch's body, not its existence.                                                                                                                                                          |
| 7   | The structure ring vertex stage declares `Uniforms { cam: CameraUniforms }` — 80 bytes, nothing else; the renderer's pick buffer is 192 bytes only because `pickRing` uploads the whole `pickUniformBytesOf` image. The Milky Way pick vertex reads `cam`, `pointSizePx`, `camPosWorld`, `pxPerRad` through a 112-byte prefix mirror of the points struct.                                                                                       | `structureMarker/io.wesl:35-39`, `structureMarkerRenderer.ts:354-366`, `milkyWay/pick/io.wesl:67-75`, `vertex.wesl:53-63`                                                                                           | The spec's "WESL struct sizes match the 80-byte prefix" check passes for structures with no shader edit; the Milky Way needs its own struct (Task 5).                                                                                                                                |
| 8   | The Milky Way floor is `u.pointSizePx` = `settings.galaxyCatalogs.sizePx + PICK_PADDING_PX`; at the default slider that is `2.5 + 4 = 6.5` px.                                                                                                                                                                                                                                                                                                   | `pickUniformBytesOf.ts:65`, `defaults.ts:35`, `pickPaddingPx.ts:15`                                                                                                                                                 | `MILKY_WAY_PICK_MIN_SIZE_PX = DEFAULT_POINT_SIZE_PX + PICK_PADDING_PX` reproduces today's default-slider bytes exactly; only a moved slider observes the change.                                                                                                                     |
| 9   | Shell readers of the famous meta: exactly one, `CommandPaletteContainer` via `selectFamousGalaxiesMeta`; no hook, no other component, no saga selects it (sagas read it through `ResolveDeps`, engine-side). The redux copy is written only by the sidecar slot.                                                                                                                                                                                 | `CommandPaletteContainer.tsx:32,48,53`, `selectors.ts:70-71`, `engineSlice.ts:117-121`, `famousGalaxiesMetaSlot.ts:44,50`; tests `engineSlice.test.ts:43`                                                           | Ruling 4: the redux copy (`engineFamousGalaxiesMetaReported`, `engine.meta.famousGalaxies`, `selectFamousGalaxiesMeta`) stays until PR-D publishes the `famousMeta` fact — the shell has no other channel, and "a deletion rides the PR that lands its replacement".                 |
| 10  | Engine-side readers of `state.famousGalaxiesMeta` / `ResolveDeps.famousGalaxiesMeta`: `engine.ts:415` (resolveDeps), `runFrame.ts:231,262`, `produceFamousGalaxyLabels.ts:181`, `diskRadiusRingPass.ts:79`, `galaxyCatalogSelectionRow.ts:40,48,75-76,148`. The subsystem INPUT fields named `famousGalaxiesMeta` (`HiResFamousSubsystem.d.ts:36`, `TexturedDiskSubsystem.d.ts:32`) are values `runFrame` passes, not reads of the engine state. | as listed                                                                                                                                                                                                           | Task 6 re-points the six; the subsystem input names are untouched.                                                                                                                                                                                                                   |
| 11  | About eleven test fixtures build a `ResolveDeps` with `famousGalaxiesMeta`; the label-producer test writes the `EngineState` getter through a cast.                                                                                                                                                                                                                                                                                              | `createTestStore.ts:61-66`, `hoverPickDriver.test.ts:90-95`, `coreSelectionRows.test.ts:7`, `composeSelectionRows.test.ts:68-86`, `tests/state/**` (Task 6 lists them), `produceFamousGalaxyLabels.test.ts:130-138` | Fixture sweep, no new assertion.                                                                                                                                                                                                                                                     |
| 12  | Backlog A (`2026-06-29-source-registry-factory.md`) is UNCHANGED since filing — 04a did not rewrite it; B, C and the meta-getters item are at `BACKLOG.md:42,58,57`, A at `:41`.                                                                                                                                                                                                                                                                 | `docs/BACKLOG.md:41-58`, the four detail files                                                                                                                                                                      | Task 3 deletes B and C and rewrites A to its star + volume remainder; Task 6 rewrites the meta-getters item to its star twin.                                                                                                                                                        |
| 13  | `GalaxyCatalogSourceConfig.d.ts` declares TWO types (`GalaxyCatalogSourceCategory` and the config) — a pre-existing one-type-per-file offender that dies with the registry.                                                                                                                                                                                                                                                                      | `GalaxyCatalogSourceConfig.d.ts:20,28`                                                                                                                                                                              | The category type gets its own file (Task 2).                                                                                                                                                                                                                                        |
| 14  | `tests/data/sources/` holds only `sgrAStar.test.ts` and `sStarSource.test.ts`; no galaxy entry has a mirror test.                                                                                                                                                                                                                                                                                                                                | `tests/data/sources/`                                                                                                                                                                                               | The nine moves drag nothing in `tests/`.                                                                                                                                                                                                                                             |
| 15  | No `companions` array exists anywhere in `src/` — P7's deletion list names one, but it left with `loadCompanionAssets` in PR-A (#703).                                                                                                                                                                                                                                                                                                           | `rg -n "\bcompanions\b" src` → prose only                                                                                                                                                                           | Nothing to delete; the companion relation's three homes today are the famous-meta row's `demand`, `req` and `priority` (`assetWiring.ts:249-255`), which Task 3 collapses.                                                                                                           |

## Rulings

Made at plan time against the code above. Do not re-open during execution; a reviewer who disagrees
escalates to the user.

**Ruling 1 — the tuple lives with its entries, and core reaches it only through `src/data/sources.ts`.
No ratchet exemption.** `GALAXY_CATALOG_SOURCE_ROWS` sits at
`src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts`, its PR-D home, so PR-D's `layer.ts`
references it instead of moving it. `src/data/sources.ts` — outside both ratchet sweeps, and the
file that must import the tuple anyway to assemble `SOURCE_REGISTRY` — is the ONE importer outside
`src/layers/`. Core wiring (`wireSlots`, `assetWiring`, `createSyntheticFallback`) needs only the
codes and the entries, which it already reads as `GALAXY_CATALOG_SOURCES` and `SOURCE_REGISTRY[code]`
from `data/sources`; both stay exported there, the first now derived from the tuple. Cost: a
`data → layers` edge, safe only while the entry modules stay leaves (they import `data/source.ts`
and types, nothing else — Finding row 4 is why the fetcher is a kind). PR-D must re-home the composed
`SOURCE_REGISTRY` outside `src/data/` when it takes `composeSources(APP_COMPOSITION.layers)`: that
import pulls the Layer's renderers, which import `data/sources` (a module-init cycle) and are
`services/` (which `data/` may not import). Recorded under Deferred. The alternative — an allow-list
row for `services/engine/wiring/assetWiring` and `phases/wireSlots` — would name a debt PR-D pays
anyway, at the price of two rows in a ratchet meant to shrink; not taken.

**Ruling 2 — one derived row per entry, Synthetic included, with the demand branching on
`category`.** `pointRow(entry)` demands on the settings toggle for `survey` and `curated` entries
and on `ctx.request('syntheticFallback')` for the `synthetic` one. The alternative — derive eight
and keep a hand row for Synthetic — is the same branch spelled as a `filter` plus a second row
shape, and it would leave Synthetic's priority (5) as the only rank not on an entry. `category`
already exists to answer "is this the fallback" for the synthetic gate; a second reader of the same
discriminant with the same meaning is not a new axis. PR-D replaces the request flag with a
slot-state predicate (D6) inside the same branch.

**Ruling 3 — `shortName` is not absorbed; `id` names the slot.** Eight of nine `shortName`s equal
`id` (Finding row 5). The slot name becomes `${entry.id}-points` and the upload log line uses
`galaxyCatalogIdOf(source)`; the one observable difference is the famous point slot's debug-panel
label (`famousGalaxy-points`). The spec lists "short name" among the absorbed facts; the user may
veto, at the cost of one `shortName` field on nine entries and a revert of the slot-name line.

**Ruling 4 — the redux copy of the famous meta survives PR-C.** Finding row 9: the command palette
is the shell's only reader and has no other channel until PR-D's `famousMeta` fact. P7's deletion
list names `engineFamousGalaxiesMetaReported` and `engine.meta.famousGalaxies`, but §9(d)'s own
packaging rule ("a deletion rides the PR that lands its replacement") and D10's last sentence ("#522
kept the redux copy because the shell had no other channel, and D6 is that channel") place them in
PR-D. For one PR the sidecar slot writes two homes; Task 6 records the seam in the spec's §14.

**Ruling 5 — `composeSources(layers)` lands in PR-D with its first consumer; its fold ships here as
`sourceRecordOf(rows)`.** Over `layers: []` the composed record is `{}`, so a `composeSources` in
PR-C would be an unconsumed function with a test that restates `Object.fromEntries` — 04b's Ruling
8 declined the same invention for the type. What PR-C needs is the fold from a rows tuple to a
code-keyed record, consumed by `SOURCE_REGISTRY`; PR-D's `composeSources` is
`sourceRecordOf(layers.flatMap((l) => l.sources ?? []))`, one line. Named in the reply as the P7
sentence not honoured verbatim.

**Ruling 6 — the companion fold is a pre-expansion, not a loop branch.** `expandCompanionRows`
turns each `{ key, factory, companionOf }` row into a full `AssetWiringRow` once, where `ASSET_WIRING`
is built. `reevaluateDemand`, `buildSlotsFromRegistry`, `buildDemandCtx` and the debug panel keep
seeing plain rows; the table that is read is the table that runs. A parent that is itself a
companion, or absent, throws at module init — a chain would otherwise surface as a `TypeError` in a
demand predicate, swallowed by the per-row guard, starving one asset silently.

**Ruling 7 — the Milky Way's minimum pick size rides the static `@group(2)` uniform.** It is a
scene constant like the centre and the radius already there; the 32-byte struct has room at byte 20. The per-pick `@group(0)` struct is then exactly the prefix plus the two camera facts the sizing
reads: 96 bytes. The spec does not say which group carries the constant.

## File structure

**Moved** (Task 1, via `npm run move-files`)

```
src/data/sources/{synthetic,sdss,twomrs,glade,famous-galaxy,milliquas,desiDeep,desiWedge,desiSgw}.ts
  → src/layers/galaxyCatalog/sources/<same basename>.ts
src/services/engine/wiring/galaxyCatalogSourceRegistry.ts → src/services/engine/wiring/wireGalaxyCatalogSourceSlot.ts   (Task 2; drags its test)
```

**Created**

```
src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts     GALAXY_CATALOG_SOURCE_ROWS, the [code, entry] tuple in draw order
src/@types/data/SourceRecordOf.d.ts                              { [R in Rows[number] as R[0]]: R[1] }
src/utils/data/sourceRecordOf.ts                                 Object.fromEntries + the cast §4.7 calls unavoidable
src/@types/data/galaxyCatalog/GalaxyCatalogSourceCategory.d.ts   'survey' | 'curated' | 'synthetic' (out of GalaxyCatalogSourceConfig.d.ts)
src/@types/data/galaxyCatalog/GalaxyCatalogFetcherKind.d.ts      'catalog' | 'synthetic'
src/@types/loading/CompanionAssetRow.d.ts                        { key, factory, companionOf }
src/utils/loading/expandCompanionRows.ts                         the fold (Ruling 6)
src/data/milkyWay/milkyWayPickMinSizePx.ts                       MILKY_WAY_PICK_MIN_SIZE_PX
tests/utils/loading/expandCompanionRows.test.ts
tests/services/loading/slots/famousGalaxiesMetaSlot.test.ts
```

**Modified**

```
src/data/sources.ts                                              UNFORMED_SOURCE_REGISTRY + the fold; GALAXY_CATALOG_SOURCES derived
src/@types/data/galaxyCatalog/GalaxyCatalogId.d.ts               derived from the tuple
src/@types/data/galaxyCatalog/GalaxyCatalogSourceEntry.d.ts      +category, +fetcher, +priority
src/layers/galaxyCatalog/sources/*.ts (nine)                     the three absorbed fields
src/services/engine/wiring/wireGalaxyCatalogSourceSlot.ts        takes the entry; kind → fetcher map; −registry, −derived lists
src/services/engine/phases/wireSlots.ts                          mints over GALAXY_CATALOG_SOURCES
src/services/engine/wiring/createSyntheticFallback.ts            derives its two lists locally
src/services/engine/wiring/assetWiring.ts                        derived point rows; companion row; expandCompanionRows
src/services/engine/wiring/galaxyCatalogRequest.ts               header line
src/@types/loading/AssetWiringRow.d.ts                           header under budget; the companion cross-reference
src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts   pickRing(viewProj, viewportPx); 80-byte pick buffer; −UNIFORM_BYTES import
src/@types/rendering/StructureMarkerRenderer.d.ts
src/services/engine/frame/passes/structureMarkersPass.ts         −pickUniformBytesOf
src/services/gpu/renderers/milkyWay/milkyWayPickRenderer.ts      own 96-byte struct; minSizePx in @group(2); −UNIFORM_BYTES import
src/@types/rendering/MilkyWayPickRenderer.d.ts
src/services/gpu/shaders/milkyWay/pick/{io,vertex}.wesl          the two structs
src/services/engine/frame/passes/milkyWayPass.ts                 −pickUniformBytesOf
src/services/engine/helpers/pickUniformBytesOf.ts, src/data/pickPaddingPx.ts, src/@types/engine/state/EnginePickingState.d.ts   comments naming the two ex-readers
src/@types/engine/data/GalaxyStore.d.ts, src/services/engine/data/createGalaxyStore.ts   +famousMeta, +setFamousMeta
src/services/loading/slots/famousGalaxiesMetaSlot.ts             writes the store beside the dispatch
src/@types/engine/state/EngineState.d.ts, src/@types/engine/frame/PassState.d.ts, src/@types/engine/ResolveDeps.d.ts
src/services/engine/engine.ts                                    −getter, −selector import; catalogs: state.data.galaxies
src/services/engine/frame/runFrame.ts, presentation/produceFamousGalaxyLabels.ts, frame/passes/diskRadiusRingPass.ts, selection/galaxyCatalogSelectionRow.ts, wiring/wireStructureProjection.ts
tests/… (per task)
docs/BACKLOG.md:41,42,57,58; docs/backlog/2026-06-29-source-registry-factory.md; docs/backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md
docs/DATA.md:57; docs/superpowers/specs/2026-09-09-layer-composition-design.md §14 (two rows)
```

**Deleted**

```
src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts
docs/backlog/2026-08-20-point-source-double-registration.md      (B)
docs/backlog/2026-07-24-companion-asset-relation-three-homes.md   (C)
```

---

## Task 1 — the nine entry modules move; the tuple; the registry folds

**Files:** the nine moves above (`npm run move-files`); `src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts`,
`src/@types/data/SourceRecordOf.d.ts`, `src/utils/data/sourceRecordOf.ts` (new);
`src/data/sources.ts:60-97,134-168,202-223`, `src/@types/data/galaxyCatalog/GalaxyCatalogId.d.ts:1-11`,
`docs/DATA.md:57` (modify).

**Produces:**

```ts
// src/layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts — the Layer's future `sources`
// field (Layer.d.ts's `Sources` bound), in today's GALAXY_CATALOG_SOURCES order: draw order for
// catalogStore's back-to-front iteration, UI order for the panel.
export const GALAXY_CATALOG_SOURCE_ROWS = [
  [Source.Synthetic, SYNTHETIC_ENTRY],
  [Source.FamousGalaxy, FAMOUS_GALAXY_ENTRY],
  [Source.TwoMRS, TWOMRS_ENTRY],
  [Source.SDSS, SDSS_ENTRY],
  [Source.Glade, GLADE_ENTRY],
  [Source.Milliquas, MILLIQUAS_ENTRY],
  [Source.DesiDeep, DESI_DEEP_ENTRY],
  [Source.DesiWedge, DESI_WEDGE_ENTRY],
  [Source.DesiSgw, DESI_SGW_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];

// src/@types/data/SourceRecordOf.d.ts
export type SourceRecordOf<Rows extends readonly (readonly [SourceType, SourceEntry])[]> = {
  readonly [R in Rows[number] as R[0]]: R[1];
};

// src/utils/data/sourceRecordOf.ts — Object.fromEntries widens keys to string, so the type comes
// from the tuple (spec §4.7); PR-D's composeSources(layers) is this over the layers' flatMap.
export function sourceRecordOf<const Rows extends readonly (readonly [SourceType, SourceEntry])[]>(
  rows: Rows,
): SourceRecordOf<Rows>;

// src/data/sources.ts
const UNFORMED_SOURCE_REGISTRY = {
  /* the 24 non-galaxy keys, unchanged */
} as const;
export const SOURCE_REGISTRY = {
  ...UNFORMED_SOURCE_REGISTRY,
  ...sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS),
} as const satisfies Readonly<Record<SourceType, SourceEntry>>;
// Element type narrowed from `SourceType` to the tuple's code union, so `SOURCE_REGISTRY[code]`
// narrows to a galaxy entry at every iterating site (Tasks 2 and 3 read `.category`/`.priority`).
export const GALAXY_CATALOG_SOURCES: readonly (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][0][] =
  GALAXY_CATALOG_SOURCE_ROWS.map(([code]) => code);

// src/@types/data/galaxyCatalog/GalaxyCatalogId.d.ts
export type GalaxyCatalogId = (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][1]['id'];
```

**Behaviour:** `SOURCE_REGISTRY[Source.SDSS]` still narrows to `SDSS_ENTRY`'s literal type (the
mapped type keeps each pair's `[1]`), so `GalaxyCatalogSourceType.d.ts`'s `Extract` and every
`SOURCE_REGISTRY[code]` narrowing site are unchanged. `GALAXY_CATALOG_SOURCES` keeps its order and
its fourteen importers (a narrower element type is assignable everywhere `readonly SourceType[]`
was; the two `as GalaxyCatalogSourceType` casts at `galaxyCatalogSelectionRow.ts:112,125` become
no-ops — drop them); the comment at `sources.ts:204-212` reduces to one line ("explicit tuple,
so a new enum code is not promoted into the UI or the mask by accident") and moves to the rows
file. `sources.ts`'s 58-line header comes under budget: the ten-kind catalogue of `type` values
belongs to `SourceEntry.d.ts`, which already carries it. `GALAXY_CATALOG_SOURCE_ROWS` is a value
tuple, not a barrel: it re-exports nothing. `docs/DATA.md:57` names the galaxy entries' new folder.

- [ ] `npm run move-files -- --dry` then for real, one invocation per file or one `--manifest`;
      then `rg -n "data/sources/(synthetic|sdss|twomrs|glade|famous-galaxy|milliquas|desiDeep|desiWedge|desiSgw)" src tests tools docs` shows only prose hits, and `rg -n "package::" src --glob '*.wesl' | rg sources` is empty.
- [ ] No new test: the registry's totality and id-uniqueness are `tsc` (`satisfies`) and
      `tests/data/sources.test.ts:12-20`; `catalogStore.test.ts:169-190` pins the derived order.
- [ ] `npm run typecheck:fast`; `npm test -- sources catalogStore layerImportBoundary oneSymbolPerFile filenameMatchesExport` green. Commit.

## Task 2 — entries absorb the wiring registry; the mint loop iterates the codes

**Files:** `src/@types/data/galaxyCatalog/GalaxyCatalogSourceEntry.d.ts:15-99`,
`src/layers/galaxyCatalog/sources/*.ts` (nine), `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`
→ `wireGalaxyCatalogSourceSlot.ts` (move-files; edits at old `:1-9,32-89,97-104,137-139`),
`src/services/engine/phases/wireSlots.ts:78-81,105-112`, `src/services/engine/wiring/createSyntheticFallback.ts:55-61,82-84,90`
(modify); `src/@types/data/galaxyCatalog/GalaxyCatalogSourceCategory.d.ts`,
`src/@types/data/galaxyCatalog/GalaxyCatalogFetcherKind.d.ts` (new); `src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts`
(delete); tests `tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts` (dragged by the
move; edits at `:1-32,52-58,123-138,147-157`), `tests/services/engine/wiring/createSyntheticFallback.test.ts:26,210,269`,
`tests/services/engine/wiring/engineSliceDispatches.test.ts:35,449`, `tests/services/engine/phases/wireSlots.test.ts:200-215`.

**Produces:**

```ts
// GalaxyCatalogSourceEntry — three fields added; every existing field unchanged.
readonly category: GalaxyCatalogSourceCategory;   // survey ×7 · curated: Famous · synthetic: Synthetic
readonly fetcher: GalaxyCatalogFetcherKind;       // 'synthetic' for Synthetic, 'catalog' otherwise
readonly priority: number;                        // the ASSET_WIRING ranks, verbatim: Synthetic 5, Famous 20,
                                                  // TwoMRS 40, SDSS 60, Milliquas 61, Glade 62, DesiDeep 63,
                                                  // DesiSgw 64, DesiWedge 65

// src/services/engine/wiring/wireGalaxyCatalogSourceSlot.ts
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  entry: GalaxyCatalogSourceEntry,
  deps: WirePointSourceDeps,
): void;
```

**Behaviour:** the mint helper reads `entry.code`, `entry.id`, `entry.fetcher` and maps the kind
through a module-private `{ catalog: galaxyCatalogFetcher, synthetic: syntheticPointFetcher }`
(Finding row 4 is why the entry cannot hold the function). Slot name `${entry.id}-points`; the
log line at old `:137-139` uses `galaxyCatalogIdOf(e.source)` and `SHORT_NAME_BY_SOURCE` goes
(Ruling 3). `GALAXY_CATALOG_SOURCE_REGISTRY`, `GALAXY_CATALOG_POINT_SOURCES` and
`TIER_FETCHED_POINT_SOURCES` are deleted; `wireSlots.ts:110-112` becomes
`for (const code of GALAXY_CATALOG_SOURCES) wireGalaxyCatalogSourceSlot(state, SOURCE_REGISTRY[code], { cb })`;
`createSyntheticFallback.ts` derives its two lists as module constants from `GALAXY_CATALOG_SOURCES`
filtered on `SOURCE_REGISTRY[code].category` (`'survey'` for the gate set, `!== 'synthetic'` for
the subscribed set) — its only consumer, so they are private to it. The rank rationale at
`assetWiring.ts:197-207` is Task 3's; the module header of the renamed file drops to ≤ 5 lines
(the "one row HERE and one point row THERE" sentence is exactly what this PR ends).

Tests: the `derives GALAXY_CATALOG_POINT_SOURCES…` case (`:123-138`) dies with its subject (a
registry restatement in enum order). The `wireGalaxyCatalogSourceSlot` describes pass
`SOURCE_REGISTRY[Source.SDSS]` / `[Source.Glade]` instead of a `GalaxyCatalogSourceConfig` literal;
`:157` expects `'sdss-points'` unchanged. The three tests that iterate `GALAXY_CATALOG_POINT_SOURCES`
build the same list inline (`GALAXY_CATALOG_SOURCES.filter((c) => SOURCE_REGISTRY[c].category === 'survey')`)
— a fixture, not an assertion. `wireSlots.test.ts:200-215`'s `importOriginal` mock reduces to
stubbing `wireGalaxyCatalogSourceSlot`.

- [ ] `npm run move-files -- src/services/engine/wiring/galaxyCatalogSourceRegistry.ts src/services/engine/wiring/wireGalaxyCatalogSourceSlot.ts`
      (`--dry` first); confirm the test moved to `tests/services/engine/wiring/wireGalaxyCatalogSourceSlot.test.ts`;
      sweep `tests/` for the old basename in `vi.mock` string paths (`wireSlots.test.ts:211`,
      `createSyntheticFallback.test.ts`, `engineSliceDispatches.test.ts`) — ts-morph does not rewrite
      string literals.
- [ ] No new test: three literal fields per entry are a registry restatement; the kind → fetcher map
      is total by its record type.
- [ ] `npm run typecheck:fast`; `npm test -- wireGalaxyCatalogSourceSlot createSyntheticFallback engineSliceDispatches wireSlots` green. Commit.

## Task 3 — derived point rows and `companionOf`; backlog B, C consumed, A rewritten

**Files:** `src/@types/loading/CompanionAssetRow.d.ts`, `src/utils/loading/expandCompanionRows.ts`,
`tests/utils/loading/expandCompanionRows.test.ts` (new); `src/services/engine/wiring/assetWiring.ts:1-10,68-91,197-255`,
`src/@types/loading/AssetWiringRow.d.ts:1-84`, `src/services/engine/wiring/galaxyCatalogRequest.ts:7`
(modify); `docs/backlog/2026-08-20-point-source-double-registration.md`,
`docs/backlog/2026-07-24-companion-asset-relation-three-homes.md`, `docs/BACKLOG.md:42,58` (delete);
`docs/backlog/2026-06-29-source-registry-factory.md`, `docs/BACKLOG.md:41` (rewrite).

**Produces:**

```ts
// src/@types/loading/CompanionAssetRow.d.ts — an asset that loads whenever its parent does, with
// the parent's request, one rank behind it. Expanded once by `expandCompanionRows`.
export type CompanionAssetRow<T = unknown, R = unknown> = {
  key: AssetKey;
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  companionOf: AssetKey;
};

// src/utils/loading/expandCompanionRows.ts (Ruling 6)
export function expandCompanionRows(
  rows: readonly (AssetWiringRow | CompanionAssetRow)[],
): readonly AssetWiringRow[];
// A companion becomes { key, factory, req: parent.req,
//   demand: (ctx) => ctx.slotState(parent.key) !== 'idle', priority: parent.priority + 1 };
// own rows pass through by identity; a missing parent, or a parent that is itself a companion, throws.

// src/services/engine/wiring/assetWiring.ts
function pointRow(entry: GalaxyCatalogSourceEntry): AssetWiringRow; // key: entry.code, built: 'external',
//   req: (tier) => galaxyCatalogRequest(entry.code, tier), priority: entry.priority,
//   demand: entry.category === 'synthetic' ? ctx.request('syntheticFallback')
//                                          : ctx.settings.galaxyCatalogs.items[entry.id]?.enabled === true
export const ASSET_WIRING: readonly AssetWiringRow[] = expandCompanionRows([
  /* bodyTextureAtlas, unchanged */
  ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(SOURCE_REGISTRY[code])),
  {
    key: 'famousGalaxiesMeta',
    factory: (deps) => createFamousGalaxiesMetaSlot(deps.state, deps.cb),
    companionOf: Source.FamousGalaxy,
  },
  /* every other row unchanged */
]);
```

**Behaviour:** the eight hand-written `pointRow(...)` lines and the Synthetic literal
(`assetWiring.ts:222-241`) become one `map`; `entry.id` is already `GalaxyCatalogId`, so the cast at
`:82` goes. The famous-meta row (`:243-255`) keeps its factory and loses its `req`, `demand` and
`priority`, which the fold derives — the values are identical to today's (`galaxyCatalogRequest(Source.FamousGalaxy, tier)`,
`slotState(Source.FamousGalaxy) !== 'idle'`, 21). The rank rationale (`:197-207`) shrinks to the
one landmine that survives derivation — distinct 60–65 ranks because `popHighestPriority` breaks
ties by array order and would fetch GLADE before Milliquas — and moves to the rows file beside the
numbers it explains (≤ 4 lines; the rows file stays under half). `AssetWiringRow.d.ts`'s 84-line
header comes under budget; its "Externally-built slots" section shrinks to the one sentence the
`built` field's own docblock does not already carry. The D11 forward references at
`assetWiring.ts:247-248` and `galaxyCatalogRequest.ts:7` are deleted, not updated.

- [ ] Test (`expandCompanionRows.test.ts`) `a companion derives req, demand and priority from its parent` —
      parent `{ key: 'filaments', req: (t) => ({ small: t === 'small' }), demand: () => true, priority: 20 }`,
      companion `{ key: 'pgcAlias', companionOf: 'filaments' }`; assert `req('small')` deep-equals
      `{ small: true }` (not identity — the parent's function is reused), `demand` is true for a ctx
      whose `slotState('filaments')` is `'loading'` and false for `'idle'`, `priority === 21`, `built`
      undefined. Real bug it catches: a derivation off the wrong key or the wrong rank arithmetic,
      which the end-to-end `assetWiring.test.ts:116-123,313-319` cases would also catch but only for
      the one companion the table has.
- [ ] Test `a companion whose parent is absent or is itself a companion throws at expansion` — two
      inputs, both `toThrow`.
- [ ] `demandTable.test.ts:396-418`'s boot set and `assetWiring.test.ts:104-123,313-319` run
      unchanged and green: the derived rows reproduce today's table exactly.
- [ ] Delete B and C (index lines `BACKLOG.md:42,58` and both detail files). Rewrite A's detail file
      to its remainder — the star-catalog and volume families still hand-wire slot + row + UI per
      source (`assetWiring.ts`'s `starCatalogRow`, the four volume rows, `slots/*Slot.ts`) — and
      its index line at `:41` to match; drop the galaxy sentences and the `add-data-source` remark's
      galaxy half.
- [ ] `npm run typecheck:fast`; `npm test -- expandCompanionRows assetWiring demandTable buildSlotsFromRegistry` green. Commit.

## Task 4 — structure ring picking reads the 80-byte prefix

**review: yes** — a TS↔WGSL contract: the buffer this task shrinks is bound to a shader struct.

**Files:** `src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts:66-69,354-366,584-618`,
`src/@types/rendering/StructureMarkerRenderer.d.ts:46-72`, `src/services/engine/frame/passes/structureMarkersPass.ts:29,64-76`
(modify); `tests/services/gpu/renderers/structureMarker/structureMarkerRenderer.test.ts:128-200` (modify).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Produces:**

```ts
// StructureMarkerRenderer
pickRing(passEncoder: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
```

**Behaviour:** `pickRing` writes the prefix into its own `pickCameraBuffer` exactly as `draw`
writes `uniformBuffer` (`:523-527`: a fresh `Float32Array(CAMERA_UNIFORM_BYTES / 4)` through
`writeCameraPrefix`, pads zero by construction); the buffer is created at `CAMERA_UNIFORM_BYTES`
(`:357-361`), and the `UNIFORM_BYTES` import (`:69`) with the comment at `:354-356` go. The ring
vertex stage already declares only `cam: CameraUniforms` (Finding row 7): no `.wesl` edit.
`structureMarkersPass.drawPick` calls `pickRing(pass, view.vp, view.viewportPx)` and drops the
`pickUniformBytesOf` import; the stale-pose rule (never the draw-time buffer) stays in the
`.d.ts` in one sentence.

Byte table, `@group(0)` on the ring-pick pipeline (`structureMarker/io.wesl` `Uniforms` =
`lib/camera.wesl` `CameraUniforms`):

| bytes  | field          | type        | written by                       |
| ------ | -------------- | ----------- | -------------------------------- |
| 0..63  | cam.viewProj   | mat4x4<f32> | `writeCameraPrefix` floats 0..15 |
| 64..71 | cam.viewportPx | vec2<f32>   | floats 16..17                    |
| 72..79 | cam.\_pad0/1   | f32 ×2      | zero-init, never written         |

Total 80 — `CAMERA_UNIFORM_BYTES`.

- [ ] Adapt `pickRing uploads the caller's pick camera to its own buffer and binds it at slot 0`
      (`:129-200`): call `pickRing(pass, viewProj, [1920, 1080])` with a distinct 16-float `viewProj`;
      assert the `structure-marker-pick-camera` buffer was created with `size: CAMERA_UNIFORM_BYTES`,
      that `writeBuffer` hit that buffer with an 80-byte `Float32Array` whose `[0..15]` equal
      `viewProj` and `[16], [17]` equal the viewport, and — the surviving regression pin — never the
      draw-time `structure-marker-uniforms` buffer.
- [ ] `npm run typecheck:fast`; `npm test -- structureMarkerRenderer passes frameFilePurity` green. Commit.

## Task 5 — the Milky Way pick gets its own struct and a fixed minimum size

**review: yes** — TS↔WGSL contract on two structs, plus a `.wesl` edit.

**Files:** `src/services/gpu/shaders/milkyWay/pick/io.wesl:1-99`, `src/services/gpu/shaders/milkyWay/pick/vertex.wesl:1-49,56-63`,
`src/services/gpu/renderers/milkyWay/milkyWayPickRenderer.ts:1-65,159-200,210-232`,
`src/@types/rendering/MilkyWayPickRenderer.d.ts`, `src/services/engine/frame/passes/milkyWayPass.ts:51,133-152`,
`src/services/engine/helpers/pickUniformBytesOf.ts:1-31`, `src/data/pickPaddingPx.ts:1-12`,
`src/@types/engine/state/EnginePickingState.d.ts:16-19` (modify); `src/data/milkyWay/milkyWayPickMinSizePx.ts`
(new); `tests/services/gpu/shaders/milkyWayPickUniformParity.test.ts` (rewrite),
`tests/services/gpu/renderers/milkyWay/milkyWayPickRenderer.test.ts:66-72,79-105,112-140` (modify).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Produces:**

```ts
// src/data/milkyWay/milkyWayPickMinSizePx.ts — the padded floor every pick point gets at the
// default slider; a constant, so the Milky Way's hit target no longer follows the galaxy size knob.
export const MILKY_WAY_PICK_MIN_SIZE_PX = DEFAULT_POINT_SIZE_PX + PICK_PADDING_PX; // 6.5

// MilkyWayPickRenderer — the camera facts the vertex stage reads, by value; the renderer packs.
pickMilkyWay(
  pass: GPURenderPassEncoder,
  viewProj: Float32Array,
  viewportPx: Vec2,
  camPosWorld: Readonly<Vec3>,
  pxPerRad: number,
): void;
```

```wgsl
// milkyWay/pick/io.wesl — no longer a mirror of the points image.
struct Uniforms {            // @group(0), 96 bytes
  cam: CameraUniforms,
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};
struct MilkyWayPickUniforms { // @group(2), 32 bytes, static
  centerWorld: vec3<f32>,
  sourceCode: u32,
  radiusMpc: f32,
  minSizePx: f32,
};
```

Byte tables:

`@group(0)` `Uniforms` — packed per pick by the renderer, `MILKY_WAY_PICK_CAMERA_BYTES = 96`:

| bytes  | field       | type           | source                                    |
| ------ | ----------- | -------------- | ----------------------------------------- |
| 0..79  | cam         | CameraUniforms | `writeCameraPrefix(viewProj, viewportPx)` |
| 80..91 | camPosWorld | vec3<f32>      | `view.camPos` (floats 20..22)             |
| 92..95 | pxPerRad    | f32            | `ctx.drawPxPerRad` (float 23)             |

96 = 6 × 16; `vec3` at 80 is 16-aligned, so no pad precedes it and `pxPerRad` fills the slot.

`@group(2)` `MilkyWayPickUniforms` — written once at construction, `MW_PICK_UNIFORM_BYTES = 32` unchanged:

| bytes  | field       | type      | source                       |
| ------ | ----------- | --------- | ---------------------------- |
| 0..11  | centerWorld | vec3<f32> | `MILKY_WAY_CENTER_WORLD`     |
| 12..15 | sourceCode  | u32       | `Source.MilkyWay`            |
| 16..19 | radiusMpc   | f32       | `MILKY_WAY_RADIUS_MPC`       |
| 20..23 | minSizePx   | f32       | `MILKY_WAY_PICK_MIN_SIZE_PX` |
| 24..31 | pad         |           | zero                         |

**Behaviour:** `vertex.wesl:63` becomes `max(mw.minSizePx, apparentPxRadius)`; `:60-62` read
`u.camPosWorld` / `u.pxPerRad` from the new struct unchanged. The renderer's `cameraUniformBuffer`
is sized `MILKY_WAY_PICK_CAMERA_BYTES` (a module constant beside `MW_PICK_UNIFORM_BYTES`) and
`pickMilkyWay` packs the 96 bytes into a per-call `Float32Array` (the prefix via
`writeCameraPrefix`, then floats 20..23) before `writeBuffer`. `milkyWayPass.drawPick` calls
`pickMilkyWay(pass, view.vp, view.viewportPx, view.camPos, ctx.drawPxPerRad)` — the same four
values `pickUniformBytesOf` read from `view` and `ctx` — and drops the helper import; the
`MILKY_WAY_PICK_MIN_DISTANCE_MPC` gate is untouched (purity row stays 1). The `UNIFORM_BYTES`
import (`:48`) goes. `io.wesl`'s 99-line header and the renderer's 38-line header come under
budget; the ex-reader sentences in `pickUniformBytesOf.ts`, `pickPaddingPx.ts:10-11` and
`EnginePickingState.d.ts:17-19` are corrected (the helper now has one reader, the point-sprites
pass; the padding has one TS home and one WESL reader, `structureMarker/ringPick`'s apron).

**Deliberate behaviour change:** with the galaxy size slider moved off 2.5 px, the Milky Way's
minimum hit target no longer moves with it. At the default slider the packed floor is the same
6.5 px as before, so the DoD spot-check compares slider positions, not builds.

- [ ] Rewrite `milkyWayPickUniformParity.test.ts` against the new authorities. WESL side as today
      (`layoutWgslStruct` over `io.wesl`'s `Uniforms` with `CameraUniforms` from `lib/camera.wesl`,
      plus `MilkyWayPickUniforms`); TS side observed from the renderer under the stub device the
      sibling test already builds (`milkyWayPickRenderer.test.ts:79-90`), calling `pickMilkyWay` with
      sentinel values and reading the captured `writeBuffer` payload. Cases:
      `Uniforms is the 80-byte CameraUniforms prefix, then camPosWorld at 80 and pxPerRad at 92, 96 bytes total`
      (WESL offsets + size); `pickMilkyWay uploads the prefix, camPosWorld and pxPerRad where the WESL
  struct reads them, and nothing longer` (sentinel `viewportPx.x`, three `camPosWorld` lanes and
      `pxPerRad` found at the WESL offsets; `byteLength === 96`);
      `MilkyWayPickUniforms places minSizePx at byte 20 in a 32-byte struct`. Real bug class: a
      reordered field or a dropped pad on either side — invisible to both compilers, a silent
      mis-sized hit target on hardware.
- [ ] Extend `writes the FULLY STATIC uniform once at construction…` (`:79-105`) with
      `f32[5] === MILKY_WAY_PICK_MIN_SIZE_PX`; adapt `pickMilkyWay self-binds @group(0)…` (`:112-140`)
      to the new signature (one 96-byte upload to the renderer's own camera buffer; slots 0, 1, 2
      bound); `:71` passes real arguments instead of `new ArrayBuffer(176)`.
- [ ] The WESL compile is proven on hardware by the DoD's Milky Way pick spot-check (the dev shader
      logger names `milkyWayPick.vertex` on a compile error); the implementer does not attest it.
- [ ] `npm run typecheck:fast`; `npm test -- milkyWayPickUniformParity milkyWayPickRenderer milkyWayPass frameFilePurity` green. Commit.

## Task 6 — famous meta on the galaxy store; the engine-side copies go

**review: yes** — `ResolveDeps` is the saga context bag seven sagas read, and the test-store
landmine (`createTestStore.ts` is NOT inert) is on the file list.

**Files:** `src/@types/engine/data/GalaxyStore.d.ts:20-29`, `src/services/engine/data/createGalaxyStore.ts:19-35`,
`src/services/loading/slots/famousGalaxiesMetaSlot.ts:1-55`, `src/@types/engine/state/EngineState.d.ts:22,34-35`,
`src/@types/engine/frame/PassState.d.ts:18`, `src/@types/engine/ResolveDeps.d.ts:1-17`,
`src/services/engine/engine.ts:57,160-162,410-416`, `src/services/engine/selection/galaxyCatalogSelectionRow.ts:19,34-48,74-82,143-149`,
`src/services/engine/frame/runFrame.ts:231,262`, `src/services/engine/presentation/produceFamousGalaxyLabels.ts:1-8,181`,
`src/services/engine/frame/passes/diskRadiusRingPass.ts:79`, `src/services/engine/wiring/wireStructureProjection.ts:16-20`
(modify); `tests/services/loading/slots/famousGalaxiesMetaSlot.test.ts` (new); fixtures
`tests/support/createTestStore.ts:61-66`, `tests/services/engine/interaction/hoverPickDriver.test.ts:90-95`,
`tests/services/engine/selection/coreSelectionRows.test.ts:7`, `tests/services/engine/selection/composeSelectionRows.test.ts:68-86`,
`tests/services/engine/presentation/produceFamousGalaxyLabels.test.ts:130-138,414`,
`tests/services/engine/frame/runFrame.test.ts:240`, `tests/state/selection/watchFocusTweenSaga.test.ts:61`,
`tests/state/tour/visitBeatSaga.test.ts:206`, `tests/state/tour/clipFociReady.test.ts:41-67`,
`tests/state/tour/webShowcaseDive.integration.test.ts:98-110`, `tests/services/engine/animation/resolveClipFoci.test.ts:328`
(modify; sweep `rg -n "famousGalaxiesMeta" tests` for any the list misses — ts-morph does not
rename object-literal keys in fixtures); `docs/backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md`,
`docs/BACKLOG.md:57` (rewrite); spec §14 (two rows).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Produces:**

```ts
// GalaxyStore — `[]` until the sidecar settles; `[]` again after a failed fetch (fail-soft).
readonly famousMeta: readonly FamousGalaxyMetaEntry[];
setFamousMeta(meta: readonly FamousGalaxyMetaEntry[]): void;

// ResolveDeps — the store view the galaxy row closes over; `famousGalaxiesMeta` is gone.
readonly catalogs: Pick<GalaxyStore, 'get' | 'famousMeta'>;
```

**Behaviour:** `createFamousGalaxiesMetaSlot(state, cb)` — `_state` becomes `state` — writes
`state.data.galaxies.setFamousMeta(s.value.meta)` on `ready` and `setFamousMeta([])` on `error`,
in the subscriber that already dispatches the redux action on both transitions; the dispatch stays
(Ruling 4). The store holds the payload's array by reference (the reducer's spread is what keeps
the redux copy out of immer's freeze; the store needs no copy). `engine.ts`'s `resolveDeps` passes
`catalogs: state.data.galaxies` (the store satisfies the `Pick` structurally; the getter at
`:160-162` and the `selectFamousGalaxiesMeta` import at `:57` go). `galaxyCatalogSelectionRow`'s
`Deps` narrows to `Pick<ResolveDeps, 'catalogs'>` and reads `d.catalogs.famousMeta` at the four
sites. `runFrame.ts:231,262`, `produceFamousGalaxyLabels.ts:181` (`galaxies.famousMeta` — the
local is already in scope) and `diskRadiusRingPass.ts:79` read `state.data.galaxies.famousMeta`.
`EngineState.famousGalaxiesMeta` (and its `FamousGalaxyMetaEntry` import) and `PassState`'s
`'famousGalaxiesMeta'` member go. Fixtures: every `ResolveDeps` literal moves its meta under
`catalogs: { get, famousMeta }`; the label-producer test replaces its cast write with
`state.data.galaxies.setFamousMeta(...)` and `:414` reads the store. The stale prose at
`wireStructureProjection.ts:16-20` and `famousGalaxiesMetaSlot.ts`'s 25-line header shrink to the
fact that survives (the store is the engine-side home; the slice copy is the palette's until PR-D).

- [ ] Test (`famousGalaxiesMetaSlot.test.ts`) `a settled fetch writes the payload onto
state.data.galaxies.famousMeta` — a `state` with `createEngineData()`, a store stub with a
      `dispatch` spy, the fetcher mocked to resolve `{ meta: [one entry] }`; after `slot.load(...)`
      settles, `state.data.galaxies.famousMeta` is that array and `dispatch` was called once with
      `engineFamousGalaxiesMetaReported`. Real bug: the store write missing or on the wrong
      transition would be masked by the redux path until PR-D deletes it.
- [ ] Test `a failed fetch resets the store to []` — fetcher rejects; the store was pre-seeded with
      one entry via `setFamousMeta`; afterwards `famousMeta` deep-equals `[]`.
- [ ] `rg -n "famousGalaxiesMeta" src` shows only the asset key/slot (`AssetKey.d.ts`,
      `EngineAssetSlots.d.ts`, `assetWiring.ts`, `wireSlots.ts` header), the fetcher/slot files, the
      subsystem INPUT fields (`HiResFamousSubsystem.d.ts`, `TexturedDiskSubsystem.d.ts`, their
      implementations) and `extractGalaxyRow.ts`'s parameter.
- [ ] Rewrite the meta-getters backlog detail to its star twin (the famous-stars sidecar is read
      only through `selectFamousStarsMeta` today; its engine-side home is the body store when (e)
      needs one) and `BACKLOG.md:57` to match.
- [ ] Spec §14 gains two rows in the table's voice: (1) P7 lists `engineFamousGalaxiesMetaReported`
      and `engine.meta.famousGalaxies` among PR-C's deletions — they ride PR-D with the `famousMeta`
      fact (Ruling 4, Finding row 9); (2) P7's `composeSources` lands in PR-D with its first
      consumer; PR-C ships the fold as `sourceRecordOf` (Ruling 5).
- [ ] `npm run typecheck:fast`; `npm test -- famousGalaxiesMetaSlot galaxyCatalogSelectionRow composeSelectionRows coreSelectionRows produceFamousGalaxyLabels runFrame hoverPickDriver watchFocusTweenSaga visitBeatSaga clipFociReady webShowcaseDive resolveClipFoci createTestStore` green. Commit.

---

## Definition of Done

**Deliverable inventory**

- [ ] The nine galaxy entry modules exist under `src/layers/galaxyCatalog/sources/` and nowhere
      else; `GALAXY_CATALOG_SOURCE_ROWS` is exported from `galaxyCatalogSourceRows.ts` and is the
      only place the nine are listed; `SOURCE_REGISTRY` is `{ ...UNFORMED_SOURCE_REGISTRY, ...sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS) }`;
      `GALAXY_CATALOG_SOURCES` and `GalaxyCatalogId` derive from the tuple.
- [ ] `GalaxyCatalogSourceEntry` carries `category`, `fetcher` (a kind) and `priority`;
      `GALAXY_CATALOG_SOURCE_REGISTRY`, `GALAXY_CATALOG_POINT_SOURCES`, `TIER_FETCHED_POINT_SOURCES`,
      `GalaxyCatalogSourceConfig` and `galaxyCatalogSourceRegistry.ts` do not exist;
      `wireGalaxyCatalogSourceSlot.ts` does and takes an entry.
- [ ] `ASSET_WIRING` is `expandCompanionRows([...])` with one `pointRow(entry)` per
      `GALAXY_CATALOG_SOURCES` code and a famous-meta row that declares only `key`, `factory`,
      `companionOf`; `CompanionAssetRow` and `expandCompanionRows` exist with their test.
- [ ] `structureMarkerRenderer.pickRing(pass, viewProj, viewportPx)` uploads 80 bytes to a
      `CAMERA_UNIFORM_BYTES` buffer; `milkyWayPickRenderer.pickMilkyWay(pass, viewProj, viewportPx, camPosWorld, pxPerRad)`
      uploads 96; `milkyWay/pick/io.wesl` declares the two structs of Task 5's tables;
      `MILKY_WAY_PICK_MIN_SIZE_PX` exists in `src/data/milkyWay/`; `pickUniformBytesOf` has exactly
      one importer (`galaxyPointSpritesPass.ts`); no file outside `src/services/gpu/renderers/galaxyCatalog/`
      imports `galaxyPointVertexLayout`'s `UNIFORM_BYTES`.
- [ ] `GalaxyStore.famousMeta` / `setFamousMeta` exist; `EngineState.famousGalaxiesMeta`,
      `PassState`'s member and `ResolveDeps.famousGalaxiesMeta` do not; `ResolveDeps.catalogs` is
      `Pick<GalaxyStore, 'get' | 'famousMeta'>`; `engineFamousGalaxiesMetaReported`,
      `engine.meta.famousGalaxies` and `selectFamousGalaxiesMeta` still exist and the palette still
      reads the last.
- [ ] `tests/conventions/layerImportBoundary.test.ts` is byte-identical to `a4e7fe9b1`;
      `frameFilePurity.test.ts` unchanged.
- [ ] Backlog B and C are gone (index lines and detail files); A and the meta-getters item are
      rewritten to their remainders; spec §14 carries the two PR-C rows.

**Named observable behaviours** (the spec's PR-C gate: a pick spot-check on structures and the
Milky Way; user-attested on the branch's dev server with `/link-data`)

- [ ] Hover and click a cluster ring (Virgo, from ~30 Mpc out): the ring highlights and selects; a
      supercluster and a void ring likewise.
- [ ] Click the Milky Way from the cosmological scale (≥ 0.03 Mpc, where its pick is enabled): it
      selects. Then set Settings › Galaxies › size to its maximum and fly to ~200 Mpc from the
      galactic centre, where the disc's apparent radius is under 6.5 px: the Milky Way's hit target
      stays the same small dot it was at the default slider (galaxy dots' targets do grow); at the
      default slider both builds behave identically.
- [ ] With the famous catalog visible, swap the tier (small ↔ medium): after the re-commit the
      famous thumbnails and name labels are back, the InfoCard for M87 shows its description (store
      path), and Cmd+K still lists famous galaxies (redux path). DebugPanel › assets:
      `famousGalaxiesMeta` starts right after `famousGalaxy-points`, never before it.
- [ ] DevTools offline (or block `*.bin`): the synthetic fallback cloud still appears (the derived
      Synthetic row's `request` demand survived the map).

**The deferral boundary** — see "Deferred". No `defineLayer` call exists for galaxies; no file
under `src/layers/galaxyCatalog/` other than `settings/` and `sources/`; no renderer, subsystem or
pass moves; `state.layers` is still `[]`.

## Deferred

**PR-D (the Layer):**

- `composeSources(layers)` and the composed `SOURCE_REGISTRY`'s move out of `src/data/` (Ruling 1's
  cycle: `compositions/app` → the Layer → renderers → `data/sources`; and `data/` may not import
  `services/`). `GalaxyCatalogId` / `GalaxyCatalogSourceType` to `src/layers/galaxyCatalog/types/`
  once their swept importers (`assetWiring.ts`, `state/settings/selectors.ts`) leave core.
- `assets(runtime)` taking over the derived point rows and the companion row;
  `wireGalaxyCatalogSourceSlot` and its kind → fetcher map into `create`; the Synthetic branch's
  body (`ctx.request` → a point-slot-state predicate, D6).
- `pickUniformBytesOf`, `packGalaxyPointUniforms`' 192-byte image and `galaxyPointVertexLayout`'s
  `UNIFORM_BYTES` re-export into the Layer (the one remaining reader is `frame/passes/galaxyPointSpritesPass.ts`,
  which cannot import `src/layers/`).
- The `famousMeta` fact published from the sidecar slot's commit, and with it the deletions Ruling
  4 keeps: `engineFamousGalaxiesMetaReported`, `engine.meta.famousGalaxies`,
  `CoreEngineSliceState.meta.famousGalaxies`, `selectFamousGalaxiesMeta`, and
  `CommandPaletteContainer`'s re-point to `state.engine.galaxyCatalog.famousMeta`.
- `ResolveDeps.catalogs` itself (with the core galaxy selection row); `ResolveDeps` dies in (e).

**(e):** the famous-stars sidecar's engine-side home (the meta-getters item's remainder).

**Adjacent, unruled** (not planned; ask the user, per the adjacent-findings rule):

- `watchSelectionRowsSaga` / `getStructuresForCategory` are cited in comments
  (`structureMarkerRenderer.ts:142,554`, `ringPick.wesl:94`) but defined nowhere.
- The `FADE_ROW` obituary comment at `watchFadesSaga.ts:6`.
- `utils/network/fetchGalaxyBitmap.ts` importing `GALAXY_ATLAS_SLOT_SIDE` from a subsystem (spec
  §9(d) adjacent findings).
- `instancedQuadRenderer.ts:101` declares a second `UNIFORM_BYTES = 96` under the same name as the
  points image's; a reader of `galaxyCatalog/*` grepping the constant finds two.

## Backlog consumption

Task 3 deletes `docs/backlog/2026-08-20-point-source-double-registration.md` (B) and
`docs/backlog/2026-07-24-companion-asset-relation-three-homes.md` (C) with their index lines
(`BACKLOG.md:42,58`) and rewrites `docs/backlog/2026-06-29-source-registry-factory.md` (A) and
`BACKLOG.md:41` to the star + volume remainder. Task 6 rewrites
`docs/backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md` and `BACKLOG.md:57` to the
star twin. Nothing else on the backlog is started by this PR.
