# Layer composition (d), PR-D first half — the `galaxyCatalog` Layer forms

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(d): the ideal-shape sketch (`src/layers/galaxyCatalog/` tree), rulings **D1, D2, D4, D6 (the
`EngineData` sentence), D7, D8, D9, D10, D11, D12, D13**, the joints-table rows "Per-frame prelude",
"Liveness and readiness", "Settings-driven subsystem effects", "Bootstrap phase for Layers",
"Swap-format rebuild", the **PR packaging** table (PR-D row), the "PR-D also folds the hi-res famous
pair" paragraph and "Open at plan time" (the `biasCorrection` check); §12 (shaders stay put); §14's
last three rows.

Plan 04d of the layer-composition sequence; follows plan 04c
([`completed/2026-09-15-layer-composition-04c-galaxy-side-unbraids.md`](completed/2026-09-15-layer-composition-04c-galaxy-side-unbraids.md)).
PR-D is split in two by user ruling (2026-09-15): **04d (this plan) — the Layer forms, engine side:**
everything a pass, fade, label, asset row or selection row reaches through a closure over the
runtime. **04e (next plan) — the shell channel and the reference engine:** the facts bag beyond the
one fact this plan is forced to publish (Ruling 6), the remaining `EngineHandle` sub-handles,
`useAliasIndex` / `useStructureMemberCount` / `engineHandleRef`, `RequestKey` + `ctx.request`,
`galaxiesOnly.ts`, the §15 docs, the deletion audit.

Branch: `worktree-layer-composition-04d` (off `55a3bd33e`, #722). One PR, **7 tasks**, every commit
`npm run typecheck:fast` + targeted tests green; `tsc` and the suite at the gate. Gate (spec PR-D
row, halved): the suite, `npm run build`, the three ratchets, a user visual pass (the checks under
Definition of Done) and paired `npm run perf` A-B-A-B on `full-survey`, `milky-way` and
`solar-system` — the per-frame work moves from `runFrame`'s prelude and `CONTENT_PASSES` into a
Layer's `frame` and `passes` closures, so the A-B must show the move is free. **Deletion audit
deferred to 04e's `/feature-done`** (user ruling: audit once at the feature).

Dispatches (serial, Sonnet unless tagged; group by file locality): **D1 = Tasks 1–2** (core joints
over the empty tuple, then the pure moves), **D2 = Tasks 3–4** (the runtime — the one large wiring
commit — then the present/ rows that restore labels, picking and fades; Opus), **D3 = Tasks 5–6**
(the frame reconcile, the settings clusters), **D4 = Task 7** (the sweep). Edges: 3 needs 1 and 2;
4 restores what 3 deletes on the core side, so they share a dispatch; 5 needs 3; 6 needs 3 (the
runtime's `frame` reads `state.settings.bias`, which 6 re-homes without changing its path); 7 last.
**Tasks 3 and 4 land as one commit**: 4 restores exactly what 3 deletes, so splitting them buys a
`tsc`-green commit that is not a true state, and costs a reviewer (and any bisect) a rule to carry.

## Goal

`APP_COMPOSITION.layers` is `[galaxyCatalogLayer]`. Every galaxy-family object core built by hand —
seven renderers, the atlas and disk subsystems, the disk-planner walk, the hi-res famous pair, bias
correction, nine point slots plus the famous-meta and pgc-alias sidecars, the synthetic row's arming
predicate, four passes, two fade rows, one label producer, one selection row, the per-frame prelude and
its liveness terms, the bias reconcile — is built in one `create(deps)`, reached through closures
over one runtime object, and torn down in one `destroy(runtime)`. Core keeps no galaxy field:
`EngineGpuHandles`, `EngineSubsystemHandles`, `EngineAssetSlots`, `EngineData`, `GPU_HANDLE_ROWS`,
`ASSET_WIRING`, `FADE_LAYERS`, `CONTENT_PASSES`, `coreSelectionRows` and `ResolveDeps` lose their
galaxy members; `watchBiasBakeSaga` and `ReconcileEffects.bakeBias` die with the reconcile that
replaces them; `createSyntheticFallback.ts` and `catalogLoaded` die outright (Rulings 13, 14).

Behaviour-neutral, with one named exception the spec rules (D9): the disk-radius ring keys its
pipeline by the canvas format at draw instead of being rebuilt by core's swap-format walk — the same
frames draw. Two shell channels change shape without changing behaviour: the command palette reads
the famous meta from the Layer's fact (`state.engine.galaxyCatalog.famousMeta`) instead of
`engine.meta.famousGalaxies` (Ruling 6), and the debug panel's provenance section reads
`…galaxyCatalog.provenanceCounts` instead of `engine.provenanceCounts` (Ruling 12). One pulse is
deleted rather than moved: `catalogLoaded`'s three takers switch to `engineSourceCountReported`,
which every one of them already takes or filters the same way (Ruling 14).

## Architecture

- **Core composes every contribution kind before the first Layer lands (Task 1).** 04c wired
  `selection` and `frame` (`instantiateLayer.ts:24-28`, `runFrame.ts:204-206`); `passes`, `assets`,
  `fades` and `labels` are declared on the contract but reach nothing. `LayerInstance` grows the four
  lists (not `runtime` — Ruling 5), and `createLayers` assembles `state.passes`, `state.assetRows`,
  `state.fadeRows` and `state.layerSlots` from `[...core, ...layers]`, in tuple order after core:
  one `expandCompanionRows` fold over the whole row list (Ruling 10) and one key-disjointness assert
  over the slot keys, next to the selection-row assert 04c put there.
  Consumers stop reading the module constants: `renderFrame`, `startLoop`, the `pickProgram` row and
  the demand loop read the composed lists; the fade sync and seed walk `state.fadeRows`; label
  producers register on `cosmoLabelDirector` inside `createLayers`. Over `[]` every composed list
  equals its constant, so Task 1 is `tsc`-proven neutral.
- **The runtime is the family's data store and handle bag (Task 3).** `GalaxyCatalogRuntime` holds
  what `state.gpu.*`, `state.subsystems.*`, `state.assetSlots.*` and `state.data.galaxies` hold
  today, as plain fields; `catalogs` is a `Map<SourceType, GalaxyCatalog>` (the `GalaxyStore` wrapper
  dissolves, D6). `create` builds in today's order (point renderer → bias subsystem attached to it;
  atlas → textured/procedural planners → walk; pick renderer over `deps.focusUniform`; slots last),
  which is exactly the order `initGpu` + `wireSlots` + `wireImpostorSubsystems` run today. `destroy`
  runs `engine.ts:533-552,576-578` in that order, on the runtime.
- **The hi-res pair lives in its slot (Task 3).** `EngineSubsystemHandles.hiResFamous` /
  `.hiResFamousTexture` were a mirror of `slot.committed()`; `frame` reads the slot and `destroy`
  destroys `committed()` subsystem-before-texture, then the slot. The lifecycle point the spec
  schedules: `commit` needs the previous pair after the hand-over, and reads it from
  `slot.committed()` — `AssetSlot.ts:195` awaits `commit` before the `committed` dispatch at `:212`
  writes the new value, so inside `commit` the slot still holds the previous pair (Ruling 4).
- **The shell keeps its two read paths for one PR (Ruling 5, the bridge).** `handle.sources.getCloud`
  / `.getCloudObjIds` and `handle.selection.loadAliases` read the galaxy runtime through a structural
  type in `src/@types/`, parked on one nullable `EngineState` field that `createLayers` writes —
  never by importing `src/layers/`, and never on `LayerInstance`. The famous meta and the provenance
  tally cannot ride the bridge — the slot that writes them moves into the Layer, and a Layer file may
  not dispatch a `src/state` action (outbound ratchet) — so they are the two facts (Rulings 6, 12).
- **Settings clusters travel as one tuple (Task 6).** `bias` and `thumbnails` become fragments
  beside `galaxyCatalogs`, exported together as the Layer's `settings` tuple; `settingsSlice` imports
  that one tuple where it imported the one fragment, so the import-boundary row stays at its number.

## Global Constraints

Binding on every task, from CLAUDE.md, the brief and the spec:

- **One symbol per file** in `src/utils/` and `src/@types/`; the Layer's `types/` folder is that
  convention's home inside the Layer (one type per file there too). `type` aliases, never
  `interface`. No barrels; deep relative imports. `layer.ts` exports the one Layer object.
- **Frame files (`src/services/engine/frame/**`, incl. `timing/`and`passes/`) declare only their
own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts`only ever
shrinks.** The Layer's`passes/`files keep the same discipline (one export, the pass) even though
the sweep does not reach`src/layers/`.
- **Named byte offsets and sizes stay named constants** (`UNIFORM_BYTES`, `SLOTS_PER_GALAXY_POINT`,
  `HI_RES_LAYER_COUNT`, …): a move never inlines a number.
- **No handles, no tier hook, no query rows; `deps` = creation-time objects only (D7); the shell reads
  only the store (D6)** — Ruling 5's bridge is the one recorded exception, deleted in 04e.
- **Shaders stay in `src/services/gpu/shaders/`** (§12). A moved renderer keeps its `?static` import
  pointing there; after every move, `rg -n "package::" src --glob '*.wesl'` and
  `rg -n "shaders/" src/layers` confirm the specifiers.
- **Every file move goes through `npm run move-files -- <from> <to>`** (or `-- --manifest
<moves.json>`; `--dry` first), never `git mv`; then `rg` the old paths across `src tests tools
docs` — ts-morph rewrites import specifiers, not `vi.mock('…')` strings or prose.
- **The import-boundary ratchet** (`tests/conventions/layerImportBoundary.test.ts`): no file under
  `src/layers/` imports `src/state/` or `src/store/`; `src/services/engine/**` and `src/state/**`
  import `src/layers/` only through the one `settingsSlice` row, at its current count. A moved file
  that imports `src/state` today loses that import in the same task (Task 3 lists the two).
- **Comment budget** per [`comments.md`](../conventions/comments.md): header ≤ 5 lines, comment lines
  ≤ half the code lines. Every moved file whose header narrates the core wiring it just left
  (`wireGalaxyCatalogSourceSlot.ts`, `wireHiResFamousSlot.ts`, `wireImpostorSubsystems.ts`,
  `biasCorrectionSubsystem.ts:1-89`) comes under budget in the task that moves it; deleted prose is
  not re-homed, and `createSyntheticFallback.ts:1-90` is deleted with its file (Ruling 13).
- **Tests** are judged by [`testing.md`](../conventions/testing.md); moved tests move with
  `move-files`; the four new assertions each name the real bug they catch.
- Commit after every task, except that Tasks 3 and 4 share one (Task 2 may be two: the manifest move,
  then the import sweep). Every commit leaves the three ratchets green — no "expected red".

## Findings at HEAD `55a3bd33e`

Verified in this worktree; the inventory (`inventory-04d.md`) is the site list and is trusted over
the spec's line numbers.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                                                                             | What it means                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `LayerInstance` is `{ name, selection, frame, destroy }`; `instantiateLayer` never calls `passes`/`assets`/`fades`/`labels`. `runFrame.ts:204-206` already ORs every `frame` into liveness; `engine.ts:530` destroys instances in reverse.                                                                                                                                                                                                                                                | `LayerInstance.d.ts`, `instantiateLayer.ts:24-28`                                                 | Task 1 is a real gap, not a rename: without it a Layer's passes draw nothing.                                                                                                                                |
| 2   | `CONTENT_PASSES` is read at module init by `MAX_PROGRAM` (`timing/maxProgram.ts`), which feeds `timedSlots` / `passGroupKeys` / `timedSlotGroups`; at runtime by `renderFrame.ts:53`, `startLoop.ts:28-33`, the `pickProgram` row (`gpuHandleRegistry.ts:519`) and `passOverrides.allNames` (`engine.ts:612`). `expandFrameOrder.ts:42` resolves a name with `passes.find`.                                                                                                               | as listed                                                                                         | Runtime readers switch to `state.passes`; `allNames` derives from `FRAME_ORDER` (static names); the timing layout is Ruling 2.                                                                               |
| 3   | `FADE_LAYERS` has two readers, `syncVisibilityFades.ts:68,92` and `seedFades` (`fadeLayers.ts:230`, called from `wireSlots.ts:152`, after `createLayers`). `ASSET_WIRING` has one code reader, `wireSlots.ts:100` (`buildSlotsFromRegistry`), which is where the demand loop's rows and the debug rank map originate. Label producers register at `engine.ts:364-382`, before bootstrap.                                                                                                  | as listed                                                                                         | The composed lists have a small, known consumer set (Task 1).                                                                                                                                                |
| 4   | `slotFor.ts:57` reads `state.assetSlots.points.get(key)` for numeric keys; `installSlots.ts:65` writes `state.assetSlots[key]`; `createSyntheticFallback.ts:99,148` reads the points map; `installLoadProgress` enumerates `allSlots`.                                                                                                                                                                                                                                                    | as listed                                                                                         | The Layer's slots need one lookup path core already walks: `state.layerSlots` (Task 1), consulted by `slotFor` first and enumerated into `allSlots`.                                                         |
| 5   | `state.contentVersion` is bumped only by the galaxy commit (`wireGalaxyCatalogSourceSlot.ts:59`) and read only by `scheduleSkyCaptures.ts:67,98`.                                                                                                                                                                                                                                                                                                                                         | as listed                                                                                         | Ruling 3: the bump moves into core's `reportSourceCount` closure; no new dep field.                                                                                                                          |
| 6   | `SettingsPanel.tsx:46` already renders `layer.ui`; `LayerUiSection = ComponentType`. But `GalaxiesSectionContainer` imports `src/state` selectors and store hooks, and `settingsSlice` → `APP_SETTINGS_FRAGMENTS` → `APP_COMPOSITION` → `layer.ts` is a runtime chain, so a `layer.ts` that imports the container closes a module-init cycle through the store.                                                                                                                           | `SettingsPanel.tsx:46`, `appSettingsFragments.ts:41-44`, `initialSettings.ts`, `settingsSlice.ts` | Ruling 8: `ui` is not declared in 04d; the panel keeps its hand-written Galaxies child.                                                                                                                      |
| 7   | Five store writes ride into `src/layers/` with the Task 2 moves: `engineFamousGalaxiesMetaReported` (`famousGalaxiesMetaSlot.ts:11,27,31`), `engineSourceCountReported` and `engineProvenanceCountsReported` (`wireGalaxyCatalogSourceSlot.ts:85,88`, both in `slot.subscribe`), `catalogLoaded` (`:63`, in `commit`, via `dispatchCatalogLoaded` — its only caller) and `engineStatusChanged` ×2 (`createSyntheticFallback.ts:121,152`). Only the source count has a `deps` field today. | verified at `a1056cbbf`                                                                           | Each is ruled, none discovered mid-dispatch: fact (Ruling 6), dep (Ruling 3), fact (Ruling 12), deleted (Ruling 14), core's (Ruling 13).                                                                     |
| 8   | `GalaxyCatalogId` has twelve importers, five of them under the inbound sweep (`state/settings/selectors.ts`, `services/animation/*`, `frame/deriveSourceMasks.ts` via `GALAXY_CATALOG_SOURCES`, `@types/animation/FadeId.d.ts`); `GalaxyCatalogRegistryEntry` / `GalaxyCatalogSourceType` likewise. `SOURCE_REGISTRY` has 74 importers, ten under `src/data/`, read at module init.                                                                                                       | `rg -l "GalaxyCatalogId'" src`, `rg -l "SOURCE_REGISTRY\b" src/data`                              | Ruling 1: the id types stay in `src/@types/data/galaxyCatalog/` (moving them adds ratchet rows) and the composed `SOURCE_REGISTRY` stays in `src/data/sources.ts`, built from the leaf tuple as 04c left it. |
| 9   | `biasCorrection`'s readers are `engine.ts:254,533`, `initGpu.ts:93` (attach), `makeReconcileEffects.ts:22` (`bakeBias`) and the subsystem itself; nothing reads it before the GPU exists.                                                                                                                                                                                                                                                                                                 | `rg -n "biasCorrection\b" src`                                                                    | The spec's open check passes: it moves to `create` whole.                                                                                                                                                    |
| 10  | `wireHiResFamousSlot.ts:51-62` destroys the previous pair from the mirror after `bindHiResArray` + `setHiResFamous`; `engine.ts:537-552` explains the atlas → planner → texture order.                                                                                                                                                                                                                                                                                                    | as listed                                                                                         | Ruling 4 schedules the read of the previous pair.                                                                                                                                                            |
| 11  | `RequestKey` is `'paletteOpened' \| 'syntheticFallback'`; `engine.ts:498` raises the first, `createSyntheticFallback.ts:166` the second; `DemandCtx.request` is read by the two rows only (`assetWiring.ts:96,347`).                                                                                                                                                                                                                                                                      | as listed                                                                                         | Ruling 13: `'syntheticFallback'` dies here (the Synthetic row's `demand` reads the slots), `'paletteOpened'` survives to 04e with `ctx.request`.                                                             |
| 12  | `utils/network/fetchGalaxyBitmap.ts` imports `GALAXY_ATLAS_SLOT_SIDE` from `subsystems/galaxyAtlasSubsystem.ts`.                                                                                                                                                                                                                                                                                                                                                                          | spec adjacent finding                                                                             | Once the subsystem is under `src/layers/`, that is a `utils → layers` edge; the constant moves to `src/data/` in Task 2.                                                                                     |
| 13  | `catalogLoaded`'s three takers: `resolveFocusRefDeferring.ts:22` and `watchSelectionRowsSaga.ts:77` already `take([catalogLoaded, engineSourceCountReported, …])`; `watchTierSaga.ts:78` takes `catalogLoaded` filtered by `a.payload.source`, a field `engineSourceCountReported` carries too. `tools/mcpm-workbench`'s `catalogLoaded` is its own action.                                                                                                                               | verified at `a1056cbbf`                                                                           | Ruling 14: the action is deletable, not movable — two takers need no edit, the third needs a one-line predicate swap.                                                                                        |
| 14  | `engineSourceCountReported` has three dispatchers: `starCatalogSlot.ts:69`, `engine.ts:139` (the famous-star seed) and the galaxy slot. `createLayers`'s `reportSourceCount` closure (`:42`) has no caller yet.                                                                                                                                                                                                                                                                           | verified at `a1056cbbf`                                                                           | Ruling 3's fork closes: the galaxy Layer is the closure's only caller, so nothing folded into it reaches the star paths.                                                                                     |
| 15  | `appSettingsFragments.ts` is `[...UNFORMED_SETTINGS_FRAGMENTS, ...settingsOf(APP_COMPOSITION.layers)]` and `UNFORMED_SETTINGS_FRAGMENTS[0]` is `galaxyCatalogsSettingsFragment`; `settingsSlice.ts` runs `assertUniqueFragmentReducerKeys` at module init.                                                                                                                                                                                                                                | verified at `a1056cbbf`                                                                           | Ruling 15: the moment the Layer declares `settings`, the fragment is counted twice and the store throws at import — in Task 3, the largest commit.                                                           |
| 16  | Nothing under `src/layers/` dispatches, or touches `deps.store`, today (`rg -n "dispatch\(\|\.store\b" src/layers` is empty), and `LayerCoreDeps.store` exists for settings reads.                                                                                                                                                                                                                                                                                                        | verified at `a1056cbbf`                                                                           | Ruling 17's ratchet row starts at zero and can only stay there; the import ban alone does not stop a Layer minting its own action and dispatching through `deps.store`.                                      |

## Rulings

Made at plan time against the code above. Do not re-open during execution; a reviewer who disagrees
escalates to the user. Rulings 1, 6 and 8 are user-accepted as written; Rulings 2, 3, 4, 5, 10 and 12
through 17 were decided (or, for 5, 7 and 10, changed) at revision time after a design-time
`entanglement-radar` pass over this plan — the parts of Ruling 7 that no longer hold are marked in
place rather than rewritten away. No "verify at dispatch" fork remains on a ruling.

**Ruling 1 — `SOURCE_REGISTRY` is not re-homed and `composeSources(layers)` is not minted in 04d;
`GalaxyCatalogId` / `GalaxyCatalogRegistryEntry` / `GalaxyCatalogSourceType` stay in
`src/@types/data/galaxyCatalog/`.** Finding 8: ten `src/data/` modules read galaxy entries at module
init, and `src/data/` may not import `services/` (§12). A registry composed from `APP_COMPOSITION`
would sit on the chain `data → compositions/app → layer.ts → render/* → data/sources`, a module-init
cycle whose first `tsc`-invisible symptom is a TDZ throw at boot. The leaf edge 04c's Ruling 1
accepted (`data/sources.ts` → `layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts`, a file that
imports only `data/source.ts` and types) is the safe shape, and `layer.ts` declares
`sources: GALAXY_CATALOG_SOURCE_ROWS` from the same file — one authority, two readers. With no
composed registry there is no consumer for `composeSources`, and 04c's Ruling 5 declines unconsumed
functions. The id types cannot leave `src/@types/` while `state/settings/selectors.ts` and the
`services/animation` rows import them (ratchet rows would grow). Cost if wrong: the brief's "re-home
so the ratchet needs no exemption" sentence is not honoured; the ratchet is green regardless because
`src/data/` is outside both sweeps. Recorded under Deferred for 04e or a later un-braid that first
moves the ten data readers.

**Ruling 2 — the timing layout is built from authored names; `CONTENT_PASSES` stops being a timing
input.** `MAX_PROGRAM` sizes the GPU timing slots at module init (Finding 2) and cannot see Layer
closures. Verified at `a1056cbbf`: `expandFrameOrder`'s `resolve()` matches passes by `pass.name`
alone, and every consumer downstream of `MAX_PROGRAM` reads only `contentPass.name`
(`timedSlotRowsOf.ts` → `passTimingSlotName(contentPass.name, …)`, `plainPassGroupKeys.ts` →
`map.set(contentPass.name, groupKey)`). So `MAX_PROGRAM` expands over name-only stubs derived from
`FRAME_ORDER`'s render steps, and `CONTENT_PASSES` is no longer read by `timing/` at all — which is
also more faithful than today, since `draws()` drops a render step whose roster is empty and a
_maximal_ program should be built from the authored names regardless of what a composition
contributes. The rule this states, and the answer to "why may `FRAME_ORDER` name a Layer's pass":
**pass names are authored (`FRAME_ORDER`), pass implementations are composed (`state.passes`),
`checkFrameOrder` ties them.** `CONTENT_PASSES` shrinks to core's passes; the four galaxy names stay
in `FRAME_ORDER` and resolve against `state.passes` per frame. No `state.timing` field is minted; a
`createLayers`-time timing layout (the branch this ruling closes) would re-braid the timing layout to
the runtime composition, which is the thing to avoid.

**Ruling 3 — `reportSourceCount` is core's "a source's catalog landed" pulse, and everything core
does on that pulse lives in its closure.** Today that is the `engineSourceCountReported` dispatch;
04d adds the `contentVersion` bump (Finding 5: the galaxy commit is its only writer, and a source
count landing IS a content change for the sky capture that reads the version) and the boot-status
echo (Ruling 13). No fork at dispatch: Finding 14 shows `starCatalogSlot.ts:69` and `engine.ts:139`
dispatch the action directly, so the closure's only caller is the galaxy Layer and neither addition
reaches a star path. The name stays `reportSourceCount` (spec D6, and the three sagas that `take` the
action read it as the bare pulse); the Layer reports one fact and core decides what it means, which
is the direction that keeps sky-capture and splash knowledge out of `src/layers/`.

**Ruling 4 — the previous hi-res pair is read from `slot.committed()` inside `commit`, before the
slot swaps.** Verified at `a1056cbbf`: `AssetSlot.ts:195` awaits `commit(value, signal)` and only
then dispatches `{ kind: 'committed' }` at `:212`, with `lastReady` assigned on the resulting `ready`
state (`:113`). So `committed()` inside `commit` IS the previous pair: no signature change, no
generic change in `services/loading`. Reason: the mirror fields exist only to answer this one
question, and the answer belongs to the slot that already holds both values. The residue is a
cross-file presumption — the Layer's hi-res commit is correct only because of that ordering inside
`AssetSlot.ts` — so Task 3's re-pointed `wireHiResFamousSlot.test.ts` assertion **is** the pin for
it, and says so in its title, for the reader of a later `AssetSlot` refactor.

**Ruling 5 — the bridge is `GalaxyCatalogBridge`, a structural type in `src/@types/engine/layer/`,
parked on one nullable `EngineState` field.** `state.galaxyBridge: GalaxyCatalogBridge | null` is
written once in `createLayers` — from the instance whose Layer declared it, by the same name check,
with the one cast — and `handle.sources.getCloud` / `.getCloudObjIds` / `handle.selection.loadAliases`
read `catalogs` and `pgcAlias` off it. `GalaxyCatalogRuntime` extends `GalaxyCatalogBridge` so `tsc`
pins the shape from the Layer side. `services/engine/**` imports nothing under `src/layers/`. 04e
deletes the field, the type and the two sub-handles — a one-line diff `tsc` finds. **Not**
`LayerInstance.runtime`: a `runtime: unknown` hole with a "04e deletes it" comment sits on the
durable artifact of this whole sequence, and is what every later Layer author would copy. The cast is
identical either way; only its lifetime and blast radius differ. Its real failure is silent — a
rename, a reordered tuple or a composition without the Layer yields `null`, indistinguishable from
"the cloud has not loaded yet" — so Task 3's assertion is that the bridge is non-null once a Layer
declaring it is composed, not the `extends` relation `tsc` already checks. Reason: the shell's three readers (`useAliasIndex`,
`useStructureMemberCount`, the palette) have no facts channel until 04e, and the alternative — leaving
the galaxy store in core for one PR — keeps `EngineData.galaxies` and every `state.data.galaxies`
reader alive, which is most of what this PR deletes.

**Ruling 6 — the famous meta is a published fact; the redux copy dies here.** Finding 7: the
slot that writes the meta moves into the Layer and may not dispatch `engineFamousGalaxiesMetaReported`.
The spec's D10 already names the replacement: `facts: { famousMeta: [] }`, `deps.publish({ famousMeta })`
at commit and `[]` on error (a copy — immer freezes store state). `CommandPaletteContainer` reads
`state.engine.galaxyCatalog.famousMeta`; `engineFamousGalaxiesMetaReported`,
`CoreEngineSliceState.meta.famousGalaxies` and `selectFamousGalaxiesMeta` are deleted with their
tests (`engineSlice.test.ts:43`). `aliasIndex` (its builder stays in the shell) and
`structureMemberCount` (a frame reconcile that does not exist yet) stay 04e's; `provenanceCounts` is
04d's — see Ruling 12, which corrects this ruling's original "the other three". Cost: 04d touches the
shell's facts typing (Task 3 verifies whether the engine slice state already composes
`FactsOf<AppLayers>`; if not, it adds that composition the way `EngineSettingsState.d.ts` composes
`APP_SETTINGS_FRAGMENTS`).

**Ruling 7 — `RequestKey` shrinks to `'paletteOpened'`; the synthetic trigger leaves it.
_Mechanism superseded by Ruling 13._** As written, this ruling replaced the `EngineState` request
flag with a `runtime.syntheticArmed` flag set by the surviving subscription. That half no longer
holds: there is no flag and no gate object (Ruling 13). What survives, unchanged: `'syntheticFallback'`
leaves `RequestKey`, and `pgcAlias` keeps `ctx.request('paletteOpened')` until 04e deletes
`ctx.request` with `loadAliases` (the demand flip to `ui.paletteOpen` rides the hook that raises the
key, per P5).

**Ruling 8 — `ui` is not declared in 04d (D13 waits for 04e).** Finding 6: `layer.ts` importing
`GalaxiesSectionContainer` closes `settingsSlice → APP_SETTINGS_FRAGMENTS → APP_COMPOSITION →
layer.ts → container → store hooks → settingsSlice`. The mechanism 04b shipped is fine; the cycle is
in what the container imports. 04e resolves it (a `src/compositions/appUi.ts` that lists the sections
without `layer.ts` importing components is the obvious shape) and moves `GalaxiesSection(+Container)`
then. The panel keeps rendering the child by hand; nothing user-visible changes.

**Ruling 9 — the disk-radius ring owns its format (D9).** The ring renderer keys its pipeline by the
format it is asked to draw into and rebuilds lazily on the first draw after a change; the pass
passes the current canvas format from the frame context (the implementer verifies at dispatch where
`applySwapFormat` publishes the format the `rebuildOnSwapFormat` walk reads, and reads the same
value). `rebuildOnSwapFormat: true` leaves with the ring's `GPU_HANDLE_ROWS` row; core's seven-row
walk is untouched (spec: adjacent).

**Ruling 10 — companion expansion runs once, in `createLayers`, over the whole list.** (This reverses
the ruling's first form, "per Layer", which the design-time radar showed buys an invariant instead of
saving work.) `expandCompanionRows` is a pure whole-list fold and is correct only over a list holding
both halves of every relation; folding per Layer makes "no companion relation crosses a Layer" a rule
enforced by nothing but a throw that names the wrong cause, and puts a processing-state claim
("already expanded") into `LayerInstance.assets`. So: `assetWiring.ts:206` drops its own
`expandCompanionRows` call and exports the authored rows; `Layer.assets(runtime)` returns authored
rows too (`readonly (AssetWiringRow | CompanionAssetRow)[]`); `createLayers` sets
`state.assetRows = expandCompanionRows([...ASSET_WIRING, ...layers.flatMap((l) => l.assets)])`. Every
code reader of the expanded rows already becomes a `state.assetRows` reader in Task 1, so the export
keeps its name.

**Ruling 11 — no new types move to the Layer's `types/` except `GalaxyCatalogRuntime`.** The eight
galaxy-family files under `src/@types/loading/` and the renderer/subsystem `.d.ts` files keep
importers outside the Layer (the shell hook, the bridge) or are consumed only through the runtime;
moving them is a diff with no reader benefit. Deletion beats addition; a relocation is neither.

**Ruling 12 — `provenanceCounts` is 04d's second published fact.** Finding 7: its sole dispatcher in
`src/` is the galaxy slot's `subscribe`, which moves into the Layer in Task 3, so the deferral is not
available — what forces publication is where the _publisher_ lives, not which shell reader wants it.
`facts: { famousMeta: [], provenanceCounts: {} }`; the runtime keeps the per-source tally as a plain
field and publishes a copy of the whole map beside each `reportSourceCount` (the same beat as today's
second dispatch). `engineProvenanceCountsReported` and `CoreEngineSliceState.provenanceCounts` are
deleted; `selectProvenanceCounts` (`state/engine/selectors.ts:52`) re-points at
`state.engine.galaxyCatalog.provenanceCounts`, and its one reader,
`GalaxyProvenanceSectionContainer.tsx:25`, needs no edit.

**Ruling 13 — the synthetic gate dissolves: the arming policy becomes a pure predicate over the
runtime's slots, the boot-status echo goes home to core, and `createSyntheticFallback.ts` is
deleted.**
_Superseded 2026-09-16: the synthetic catalog is deleted wholesale (user ruling); no arming predicate exists._ The file's own header states why it had to be imperative: `DemandCtx` exposes only the
`LoadStateKind` discriminant, so it can see neither a ready catalog's `count` nor
`galaxyPointRenderer.totalCount()`. **Both reasons die with this move** — the Synthetic row's
`demand` is a closure over the runtime, which owns `points` (every slot's `ready` value, hence its
`count`, hence its `FormatVersionError`) and `pointRenderer` (hence the total). This is exactly the
shape spec D6 rules ("the synthetic fallback [demands] on the point slots' states instead"). So:
`demand: () => syntheticShouldArm(runtime)`, one pure predicate in one file, carrying today's whole
policy (survey-category sources only, `count > 0` is the only success, a disabled catalog counts as
settled, a `FormatVersionError` suppresses). It deletes the `syntheticArmed` flag, the `syntheticGate`
handle, `RequestKey`'s `'syntheticFallback'`, the once-only-arm invariant (no subscription, nothing
to double-attach) and most of that module header. The two `engineStatusChanged` dispatches are the
second job jammed into the file — core's boot-status channel (`useSplash`, `watchFocusTweenSaga`,
`wireSlots`, `installFormatVersionAlert` all speak it), not galaxy knowledge — and go home to core's
catalog-landed pulse (Ruling 3): `reportSourceCount(source, count)` dispatches
`engineStatusChanged({ kind: 'ready', count: <sum of the counts reported so far, per source>, source })`
when `count > 0`. That sum is `galaxyPointRenderer.totalCount()` by construction (per-source
last-reported count, summed, replaced on a tier swap) with the Layer's caller being its only one
(Finding 14). Nothing remains of the file, so it is deleted rather than moved in Task 2.

**Ruling 14 — `catalogLoaded` is deleted; `engineSourceCountReported` is the one catalog-landed
pulse.** Finding 13: `dispatchCatalogLoaded`'s only caller is the galaxy commit, which moves into the
Layer, and D6 keeps `reportSourceCount` precisely "because three sagas already `take` that one action
as the generic catalog-landed pulse". Two of the three (`resolveFocusRefDeferring.ts:22`,
`watchSelectionRowsSaga.ts:77`) already take both and need no edit; the third
(`watchTierSaga.ts:78`) swaps its one `take` predicate to `engineSourceCountReported.match(a) &&
a.payload.source === source`. Deleting beats re-homing: a Layer-dispatched second pulse for the same
event is a `deps` field and an action nobody needs. Schedule note: the count pulse fires from
`slot.subscribe` on `ready`, one beat after today's in-`commit` `catalogLoaded`, so every taker sees
it strictly later than the upload it waits for — later is the safe direction for the tier saga's
re-anchor, which resolves refs against the new cloud. `tests/state/tier/watchTierSaga.test.ts`'s
re-anchor case is the pin for the equivalence (it fails if the pulse's `source` payload or its timing
does not re-anchor); `watchSelectionRowsSaga.test.ts`, `watchRequestFocusSaga.test.ts`,
`captureGalaxyFocusIds.test.ts` and `engineSliceDispatches.test.ts` are fixture updates. Deleted:
`src/state/catalog/catalogLoaded.ts`, `src/services/engine/wiring/dispatchCatalogLoaded.ts` and the
prose naming them (`SelectionState.d.ts:11`, the three saga headers, `requestFocus.ts:5`,
`captureGalaxyFocusIds.ts:8,24,48`). `tools/mcpm-workbench`'s same-named action is unrelated.

**Ruling 15 — a settings fragment lives in `UNFORMED_SETTINGS_FRAGMENTS` or in a Layer's `settings`
tuple, never both.** Finding 15: `APP_SETTINGS_FRAGMENTS` folds the two lists, and
`settingsSlice.ts` runs `assertUniqueFragmentReducerKeys` at module init, so the commit that gives
the Layer a `settings` tuple containing `galaxyCatalogsSettingsFragment` must also remove it from
`UNFORMED_SETTINGS_FRAGMENTS` — one line each way, in Task 3, where the Layer first declares
`settings`. The bug this avoids is a hard boot throw (and a red store suite) surfacing as an opaque
duplicate-reducer-key error inside the PR's largest commit, where it reads like the module-init cycle
Ruling 1 warns about. The rule generalises to every later Layer in the sequence; P1's note that the
parallel authority "collapses when the first Layer lands" is this collapse.

**Ruling 16 — the store's module graph reaches the renderer graph, and that is safe because the
import ratchet forbids the return edge.** From Task 3, `settingsSlice → APP_SETTINGS_FRAGMENTS →
APP_COMPOSITION → layer.ts → create.ts` pulls seven renderers, six subsystems, the `?worker` bake
modules and every `?static` WGSL import into any module graph that reaches the store. `APP_COMPOSITION`
stops being pure data, and `app.ts`'s header says so. It stays a module-level literal and `layer.ts`
imports `create` statically: the alternatives (a settings-only descriptor list beside the Layer, or
thunked layers) either re-create the parallel authority Ruling 15 just collapsed, or need a dynamic
import to help at all. What makes the edge acyclic is structural, not luck: `layerImportBoundary`
forbids every file under `src/layers/` from importing `src/state/` or `src/store/`, so the renderer
graph cannot reach back. Ruling 8's cycle is the exception that proves it — the container it would
import lives under `src/components/`, outside the ratchet. Task 3 verifies the one gap the ratchet
does not cover (a `src/services/**` or `src/data/**` module reachable from `create.ts` that imports
the store) and runs `npm test -- settings initialSettings store` before the wiring lands, so a TDZ
throw or a worker-loader gap surfaces in minutes rather than after a 24-file move.

**Ruling 17 — no file under `src/layers/` dispatches.** The import ban is not the whole rule:
`LayerCoreDeps.store` is handed to every Layer, so a Layer could mint its own `createAction` and
dispatch it — the improvisation the ratchet's own error message suggests, and the largest unruled
contract change available to an implementer under time pressure. `layerImportBoundary.test.ts` gains
a row asserting no file under `src/layers/` contains a `.dispatch(` call. Finding 16: it starts at
zero, and 04d keeps it there — every store write in this PR is a `deps` field, a fact, or deleted.

## File structure

**Created**

```
src/layers/galaxyCatalog/layer.ts                                  defineLayer({ name: 'galaxyCatalog', settings, sources, facts, create, destroy, passes, assets, fades, labels, selection, frame })
src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts             the runtime (extends GalaxyCatalogBridge)
src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts               { famousMeta, provenanceCounts } — Rulings 6, 12
src/layers/galaxyCatalog/settings/galaxyCatalogLayerSettings.ts    [galaxyCatalogsSettingsFragment, biasSettingsFragment, thumbnailsSettingsFragment] as const
src/layers/galaxyCatalog/settings/biasSettings.ts                  the `bias` cluster fragment (out of CoreSettingsState)
src/layers/galaxyCatalog/settings/thumbnailsSettings.ts            the `thumbnails` cluster fragment
src/layers/galaxyCatalog/create.ts                                 create(deps): GalaxyCatalogRuntime
src/layers/galaxyCatalog/destroy.ts                                destroy(runtime)
src/layers/galaxyCatalog/frame.ts                                  frame(runtime) — prelude, liveness, bias reconcile
src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts            assets(runtime)
src/layers/galaxyCatalog/load/syntheticShouldArm.ts                the arming predicate (Ruling 13)
src/layers/galaxyCatalog/present/galaxyCatalogFadeRows.ts          fades(runtime)
src/@types/engine/layer/GalaxyCatalogBridge.d.ts                   { catalogs, pgcAlias } — Ruling 5, dies in 04e
src/data/galaxyCatalog/galaxyAtlasSlotSide.ts                      GALAXY_ATLAS_SLOT_SIDE (Finding 12)
tests/services/engine/phases/createLayers.composition.test.ts      Task 1's composition assertion
tests/services/engine/phases/createLayers.sourcePulse.test.ts      Task 1's catalog-landed-pulse assertion
tests/layers/galaxyCatalog/load/syntheticShouldArm.test.ts         Task 3's policy assertion
tests/layers/galaxyCatalog/frame.biasReconcile.test.ts             Task 5's one assertion
```

**Moved** (Task 2, one `--manifest`; tests follow automatically, `vi.mock` strings swept by hand)

```
src/services/gpu/renderers/galaxyCatalog/{catalogStore,galaxyPointRenderer,galaxyPickRenderer,texturedDiskRenderer,proceduralDiskRenderer,instancedQuadRenderer,galaxyPointVertexLayout}.ts
                                                                → src/layers/galaxyCatalog/render/<same>.ts
src/services/gpu/renderers/devTools/diskRadiusRing.ts           → src/layers/galaxyCatalog/render/diskRadiusRing.ts
src/utils/gpu/packGalaxyPointUniforms.ts                        → src/layers/galaxyCatalog/render/packGalaxyPointUniforms.ts
src/services/engine/helpers/pickUniformBytesOf.ts               → src/layers/galaxyCatalog/render/pickUniformBytesOf.ts
src/services/engine/subsystems/{galaxyAtlasSubsystem,texturedDiskSubsystem,proceduralDiskSubsystem,diskPlannerWalk,hiResFamousSubsystem,biasCorrectionSubsystem}.ts
                                                                → src/layers/galaxyCatalog/subsystems/<same>.ts
src/services/biasCorrection/galaxyCatalogConstants.ts           → src/layers/galaxyCatalog/subsystems/galaxyCatalogConstants.ts   (the dir is then empty; delete it)
src/services/engine/bake/computeSchechterRatios.worker.ts, computeAngularWeights.worker.ts, and the pure modules they import that have no other reader
                                                                → src/layers/galaxyCatalog/subsystems/bake/<same>   (verify at dispatch: `rg -l "engine/bake/" src tools`; a module `tools/` imports stays — spec adjacent)
src/services/engine/frame/passes/{galaxyPointSpritesPass,proceduralDisksPass,texturedDisksPass,diskRadiusRingPass}.ts
                                                                → src/layers/galaxyCatalog/passes/<same>.ts
src/services/engine/wiring/{wireHiResFamousSlot,wireImpostorSubsystems,galaxyCatalogRequest}.ts
src/services/loading/slots/pgcAliasSlot.ts
src/services/loading/fetchers/{galaxyCatalogFetcher,syntheticPointFetcher,famousGalaxiesMetaFetcher,pgcAliasFetcher}.ts
                                                                → src/layers/galaxyCatalog/load/<same>.ts
IN TASK 3, with their dispatches (Finding 7), not here:
src/services/engine/wiring/wireGalaxyCatalogSourceSlot.ts, src/services/loading/slots/famousGalaxiesMetaSlot.ts
                                                                → src/layers/galaxyCatalog/load/<same>.ts
NOT MOVED AT ALL: src/services/engine/wiring/createSyntheticFallback.ts + dispatchCatalogLoaded.ts   (deleted in Task 3 — Rulings 13, 14)
src/services/engine/presentation/produceFamousGalaxyLabels.ts   → src/layers/galaxyCatalog/present/produceFamousGalaxyLabels.ts
src/services/engine/helpers/extractGalaxyRow.ts                 → src/layers/galaxyCatalog/present/extractGalaxyRow.ts
src/services/engine/selection/galaxyCatalogSelectionRow.ts      → src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow.ts
```

Not moved, on purpose: `src/utils/galaxy/*` (spec: an ISM-generator folder wearing the wrong name),
`src/utils/galaxy/buildAliasIndex.ts` and `src/hooks/useAliasIndex.ts` (04e, with the `aliasIndex`
fact), `src/services/loading/awaitSlotReady.ts` (generic), `src/data/galaxyCatalog/*` (shared wire
format), `src/@types/loading/*` and the renderer/subsystem `.d.ts` files (Ruling 11),
`src/components/**` (Ruling 8), `src/state/selection/captureGalaxyFocusIds.ts` (state, reads
`src/@types` only).

**Modified** — per task below. **Deleted** — per task; the headline list is under Definition of Done.

---

## Task 1 — core composes passes, assets, fades and labels from every Layer (empty tuple)

**review: yes** — the frame program and the GPU timing layout (renderer landmine area); the
composition's silent-drop bug class is invisible to `tsc`.

**Files:** `src/@types/engine/layer/LayerInstance.d.ts`, `src/@types/engine/state/EngineState.d.ts`,
`src/services/engine/layer/instantiateLayer.ts`, `src/services/engine/phases/createLayers.ts`,
`src/services/engine/engine.ts` (`state` literal seeds; `passOverrides.allNames` at `:612`;
`contentVersion` seed stays), `src/services/engine/frame/renderFrame.ts:53`,
`src/services/engine/phases/startLoop.ts:28-33`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts:519`,
`src/services/engine/frame/timing/maxProgram.ts` (Ruling 2), `src/services/engine/wiring/syncVisibilityFades.ts:68,92`,
`src/services/engine/wiring/fadeLayers.ts:230` (`seedFades`), `src/services/engine/wiring/slotFor.ts`,
`src/services/engine/wiring/assetWiring.ts:206` (drops its own `expandCompanionRows` call, Ruling 10),
`src/services/engine/phases/wireSlots.ts:100` and the `installLoadProgress` enumeration (verify at
dispatch: `installLoadProgress.ts:43-91` is where `allSlots` is filled), the demand loop's row source
(verify at dispatch: follow `buildSlotsFromRegistry`'s return into `reevaluateDemand`'s row argument
and the debug `assetPriorities` map), `tests/conventions/layerImportBoundary.test.ts` (Ruling 17's
no-dispatch row), `tests/services/engine/phases/createLayers.composition.test.ts` and
`createLayers.sourcePulse.test.ts` (new), `tests/services/engine/phases/createLayers.test.ts`
(fixture: the stub instance gains the four lists).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own
symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Produces:**

```ts
// src/@types/engine/layer/LayerInstance.d.ts
export type LayerInstance = {
  readonly name: string;
  readonly passes: readonly ContentPass[];
  readonly assets: readonly (AssetWiringRow | CompanionAssetRow)[];  // authored rows; core folds once (Ruling 10)
  readonly fades: readonly FadeLayer<unknown>[];
  readonly labels: readonly Label2DProducer[];
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: ReadyFrameContext, state: PassState) => boolean) | null;
  destroy(): void;
};

// EngineState — four composed lists, seeded to the core constants in engine.ts, replaced in createLayers
passes: readonly ContentPass[];            // [...CONTENT_PASSES, ...layers.flatMap((l) => l.passes)]
assetRows: readonly AssetWiringRow[];      // expandCompanionRows([...ASSET_WIRING, ...layers.flatMap((l) => l.assets)])
fadeRows: readonly FadeLayer<unknown>[];   // [...FADE_LAYERS, ...layers.flatMap((l) => l.fades)]
layerSlots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;  // every Layer row's factory, called once
// and, added in Task 3 where its type is minted (Ruling 5), written in createLayers, gone in 04e:
galaxyBridge: GalaxyCatalogBridge | null;
```

**Behaviour:** `createLayers` builds the four lists in tuple order after core — `assetRows` through
one `expandCompanionRows` fold over core's authored rows plus every Layer's (Ruling 10) — calls each
Layer asset row's `factory` once (a Layer row's factory returns the runtime-owned slot; `SlotDeps` is
still passed for signature parity) into `layerSlots`, asserts the Layer slot keys are disjoint from
core's `assetSlots` keys (three lines, beside 04c's `assertSelectionRowsDisjoint`: two maps answer
"the slot for key K", so a duplicate would be shadowed by `slotFor`'s ordering instead of reported —
`'famousGalaxiesMeta'` stays an `AssetKey` member while its slot moves, which is exactly the shape
that makes a stale core entry survivable-but-wrong), and registers each Layer's label producers on
`state.subsystems.cosmoLabelDirector` (the COSMO slab is the only director a Layer needs in (d); the
NEAR0 director stays core's). `slotFor` consults `state.layerSlots` before its core branches;
`installLoadProgress` enumerates `layerSlots` into `allSlots`; the demand loop and the rank map walk
`state.assetRows`; `renderFrame`, `startLoop.checkFrameOrder` and the `pickProgram` row read
`state.passes`; `syncVisibilityFades` and `seedFades` walk `state.fadeRows`. `passOverrides.allNames`
and `MAX_PROGRAM` both derive from `FRAME_ORDER`'s render steps (static names; today's volume-target
filter unchanged), so neither the handle literal nor the GPU timing layout depends on the pass list
(Ruling 2). `reportSourceCount`'s core closure becomes the catalog-landed pulse (Ruling 3): the
`engineSourceCountReported` dispatch, `state.contentVersion += 1`, and — when `count > 0` — the
`engineStatusChanged({ kind: 'ready', count, source })` echo over its own per-source tally
(Ruling 13). Over `layers: []` every list equals its constant, the closure still has no caller, and
nothing observable changes.

- [ ] Test (`createLayers.composition.test.ts`) `createLayers composes a Layer's passes, assets, fades
and labels after core's, in tuple order` — a stub composition of two Layers whose hooks return
      one distinctly named pass / row / fade / producer each; assert `state.passes` is
      `[...CONTENT_PASSES, a, b]` by name, `state.fadeRows` ends with the two fade keys in order,
      `state.layerSlots` holds both asset keys mapped to the objects the factories returned, and the
      cosmo director's `registerProducer` stub saw both producer ids in order. Real bug it catches:
      a contribution kind wired for one Layer but not appended for the next, or a factory called
      per frame instead of once — neither fails `tsc` nor any existing test. Second case in the same
      file: two Layers minting the same slot key throw from `createLayers` (the shadow that the
      ordering in `slotFor` would otherwise hide).
- [ ] Test (`createLayers.sourcePulse.test.ts`) `reportSourceCount reports the count, bumps the
content version and echoes a running-total ready status` — call the closure for two sources with
      counts 3 and 4 and a third with 0; assert the three `engineSourceCountReported` payloads, that
      `state.contentVersion` advanced once per call, and that the dispatched statuses carry 3 then 7,
      with none for the zero. Real bug it catches: the status echo dropped or made per-source in the move
      out of `createSyntheticFallback` — the splash never leaves "loading", and no suite today sees it.
- [ ] No test for the consumer switches: `renderFrame`/`startLoop` are exercised by
      `runFrame.test.ts` and `startLoop`'s existing tests over the same constants.
- [ ] `npm run typecheck:fast`; `npm test -- createLayers runFrame startLoop syncVisibilityFades fadeLayers slotFor layerImportBoundary frameFilePurity timedSlots` green. Commit.

## Task 2 — the moves

**Files:** the **Moved** table above as one `moves.json` manifest; `src/data/galaxyCatalog/galaxyAtlasSlotSide.ts`
(new; `utils/network/fetchGalaxyBitmap.ts` and `galaxyAtlasSubsystem.ts` import it there);
`src/services/biasCorrection/` (delete the empty dir); `tests/**` `vi.mock('…')` string paths naming
any moved file (sweep with `rg -n "vi.mock\('.*(galaxyCatalog|Disk|hiResFamous|biasCorrection|syntheticFallback|famousGalaxiesMeta|pgcAlias|galaxyPointSprites|diskRadiusRing)" tests`).

No behaviour change and no wiring change: after this task every moved module is imported from its
new path by the same core files that imported it before. The one content edit is Finding 12's
constant. Header comments that narrate core wiring are cut in Task 3, where the wiring changes.

**The two files that dispatch today — `famousGalaxiesMetaSlot.ts` and `wireGalaxyCatalogSourceSlot.ts`
(Finding 7) — are NOT in this manifest.** They move in Task 3, by `move-files`, in the commit that
replaces their dispatches with `deps.publish` / `deps.reportSourceCount`. Moving them here would put
an outbound-ratchet violation in the tree between two dispatches, and a red ratchet that a reviewer
is taught to expect is a signal that has stopped working. Every commit in this PR leaves the three
ratchets green.

- [ ] `npm run move-files -- --manifest moves.json --dry`, read the report, then for real; confirm
      `tests/layers/galaxyCatalog/**` received every mirror test.
- [ ] `rg -n "services/gpu/renderers/galaxyCatalog|renderers/devTools/diskRadiusRing|engine/subsystems/(galaxyAtlas|texturedDisk|proceduralDisk|diskPlannerWalk|hiResFamous|biasCorrection)|services/biasCorrection|frame/passes/(galaxyPointSprites|proceduralDisks|texturedDisks|diskRadiusRing)|wiring/(wireHiResFamousSlot|wireImpostorSubsystems|galaxyCatalogRequest)|slots/pgcAliasSlot|fetchers/(galaxyCatalog|syntheticPoint|famousGalaxiesMeta|pgcAlias)Fetcher|presentation/produceFamousGalaxyLabels|helpers/(extractGalaxyRow|pickUniformBytesOf)|selection/galaxyCatalogSelectionRow|utils/gpu/packGalaxyPointUniforms" src tests tools docs`
      shows prose hits only (docs are 04e's); `rg -n "package::" src --glob '*.wesl' | rg -i galaxy` is empty;
      `rg -n "\?static" src/layers/galaxyCatalog/render` resolves to `src/services/gpu/shaders/…`.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog layerImportBoundary oneSymbolPerFile filenameMatchesExport frameFilePurity` green —
      all three ratchets included, and green: the two dispatching files stayed behind (above).
- [ ] Commit (two commits allowed: the manifest move, then the sweep).

## Task 3 — the runtime: `create`, `destroy`, `passes`, `assets`, the prelude in `frame`, the hi-res fold, the two facts

**review: yes** — Redux state (the facts, the deleted pulse), the slot lifecycle (Ruling 4), the
destroy order, and the `?worker` module graph; CI sees only the types.

**Files:** `src/layers/galaxyCatalog/{layer,create,destroy,frame}.ts`,
`src/layers/galaxyCatalog/types/{GalaxyCatalogRuntime,GalaxyCatalogFacts}.ts`,
`src/layers/galaxyCatalog/load/{galaxyCatalogAssetRows,syntheticShouldArm}.ts` (new);
the two Task-3 moves (`wireGalaxyCatalogSourceSlot.ts`, `famousGalaxiesMetaSlot.ts`, via
`move-files`, rewired in the same commit); every file under
`src/layers/galaxyCatalog/{render,subsystems,passes,load}/` (closures over the runtime; header cuts);
`src/@types/engine/layer/GalaxyCatalogBridge.d.ts` (new); `src/compositions/app.ts` (+ its header:
`layers` is no longer pure data, Ruling 16); `src/compositions/appSettingsFragments.ts` (the galaxy
fragment leaves `UNFORMED_SETTINGS_FRAGMENTS` in this commit — Ruling 15);
`src/services/engine/wiring/{createSyntheticFallback,dispatchCatalogLoaded}.ts` +
`src/state/catalog/catalogLoaded.ts` (delete, Rulings 13–14) and the three takers
(`resolveFocusRefDeferring.ts:22`, `watchSelectionRowsSaga.ts:77`, `watchTierSaga.ts:78`);
`src/services/engine/engine.ts:31,37,57,169-170,198-199,215,243-258,325,328,347,406-407,493-509,533-552,576-578,584-591`;
`src/services/engine/gpuHandles/gpuHandleRegistry.ts` (the five galaxy rows and their imports;
`pickProgram` stays); `src/services/engine/phases/initGpu.ts:93`; `src/services/engine/phases/wireSlots.ts:100-135`
(the galaxy mint loop, the impostor block, the hi-res mint, the synthetic gate) and its header;
`src/services/engine/wiring/assetWiring.ts:13,23-24,32,39,82-110,224-232,344,361+` (the eleven
galaxy rows and the companion row); `src/services/engine/frame/runFrame.ts:36,222-262`;
`src/services/engine/helpers/shouldKeepTicking.ts:47`; `src/@types/engine/handles/{EngineGpuHandles,EngineSubsystemHandles}.d.ts`,
`src/@types/engine/state/EngineAssetSlots.d.ts`, `src/@types/engine/data/{EngineData,GalaxyStore}.d.ts`,
`src/services/engine/data/createGalaxyStore.ts` (delete), `src/@types/engine/ResolveDeps.d.ts:1,7,15`
(`catalogs` goes; Task 4 re-points the row), `src/@types/loading/RequestKey.d.ts` (Ruling 7),
`src/state/engine/engineSlice.ts:117-121,198` (+ `engineProvenanceCountsReported`),
`src/@types/store/CoreEngineSliceState.d.ts:43`, `src/state/engine/selectors.ts:34,52,66-71`,
`src/components/containers/CommandPaletteContainer.tsx:16,30,48-53`, the engine-slice state type
(verify at dispatch, Ruling 6), `tests/**` mirrors of every file above (fixtures: `createTestStore.ts`,
`engine.destroyOrder.test.ts`, `engine.tier-swap-race.test.ts`, `hoverPickDriver.test.ts`,
`engineSlice.test.ts:43`, `runFrame.test.ts`, `shouldKeepTicking.test.ts`, `gpuHandleRegistry.test.ts`,
`initGpu.hdrCapabilityWiring.test.ts`, `assetWiring.test.ts`, `demandTable.test.ts`, `wireSlots.test.ts`,
`watchTierSaga.test.ts`, `watchSelectionRowsSaga.test.ts`, `watchRequestFocusSaga.test.ts`,
`captureGalaxyFocusIds.test.ts`, `engineSliceDispatches.test.ts`, `tests/layers/galaxyCatalog/**`).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own
symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only. The
Layer's `passes/*.ts` keep one export each.

**Produces:**

```ts
// src/@types/engine/layer/GalaxyCatalogBridge.d.ts — Ruling 5; the shell's two read paths for one PR
export type GalaxyCatalogBridge = {
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly pgcAlias: AssetSlot<PgcAliasMap, PgcAliasReq>; // verify at dispatch: the slot's req type name
};

// src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts — plain fields, mutable where a commit writes them
export type GalaxyCatalogRuntime = GalaxyCatalogBridge & {
  readonly catalogs: Map<SourceType, GalaxyCatalog>; // ex-GalaxyStore.catalogs
  famousMeta: readonly FamousGalaxyMetaEntry[]; // ex-GalaxyStore.famousMeta; also published
  readonly provenanceCounts: Map<SourceType, ProvenanceCounts>; // Ruling 12; published as a copy
  readonly points: ReadonlyMap<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  readonly famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq>;
  readonly hiResFamous: AssetSlot<HiResFamousPair, HiResFamousReq>;
  readonly pointRenderer: GalaxyPointRenderer;
  readonly pickRenderer: GalaxyPickRenderer;
  readonly texturedDiskRenderer: TexturedDiskRenderer;
  readonly proceduralDiskRenderer: ProceduralDiskRenderer;
  readonly diskRadiusRing: DiskRadiusRing;
  readonly galaxyAtlas: GalaxyAtlasSubsystem;
  readonly texturedDisks: TexturedDiskSubsystem;
  readonly proceduralDisks: ProceduralDiskSubsystem;
  readonly diskPlannerWalk: DiskPlannerWalk;
  readonly biasCorrection: BiasCorrectionSubsystem;
  biasLastApplied: BiasMode; // Task 5's reconcile
  // no synthetic flag and no gate handle: the Synthetic row's demand is a predicate (Ruling 13)
};

// src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts — Rulings 6, 12
export type GalaxyCatalogFacts = {
  readonly famousMeta: readonly FamousGalaxyMetaEntry[];
  readonly provenanceCounts: Partial<Record<SourceType, ProvenanceCounts>>;
};

// src/layers/galaxyCatalog/layer.ts
export const galaxyCatalogLayer = defineLayer({
  name: 'galaxyCatalog',
  settings: galaxyCatalogLayerSettings, // Task 6; until then [galaxyCatalogsSettingsFragment] as const,
  // which leaves UNFORMED_SETTINGS_FRAGMENTS in this same commit (Ruling 15)
  sources: GALAXY_CATALOG_SOURCE_ROWS,
  facts: { famousMeta: [], provenanceCounts: {} } as GalaxyCatalogFacts,
  create,
  destroy,
  passes,
  assets,
  fades,
  labels,
  selection,
  frame, // fades/labels/selection: Task 4; frame: prelude here, reconcile Task 5
});

// src/compositions/app.ts
export const APP_COMPOSITION = { layers: [galaxyCatalogLayer] as const, home: EARTH_HOME };
// verify at dispatch: EngineComposition<typeof APP_COMPOSITION.layers> still satisfies createEngine's parameter

// passes(runtime): the four passes, each a closure — `galaxyPointSpritesPass(runtime)`, etc.; names unchanged, FRAME_ORDER untouched
// assets(runtime): the authored rows, unexpanded — createLayers folds them with core's (Ruling 10):
//   [ ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, SOURCE_REGISTRY[code])),
//   { key: 'famousGalaxiesMeta', factory: () => runtime.famousGalaxiesMeta, companionOf: Source.FamousGalaxy },
//   { key: 'pgcAlias', factory: () => runtime.pgcAlias, demand: (ctx) => ctx.request('paletteOpened'), priority: <today's> },
//   { key: 'hiResFamous', factory: () => runtime.hiResFamous, req/demand/priority: today's assetWiring.ts:361+ row } ]
//   pointRow: today's derived row (04c Ruling 2) with the Synthetic branch's
//   demand = (ctx) => syntheticShouldArm(runtime, ctx.settings)

// src/layers/galaxyCatalog/load/syntheticShouldArm.ts — Ruling 13; today's policy as one pure read
export function syntheticShouldArm(
  runtime: GalaxyCatalogRuntime,
  settings: Readonly<EngineSettingsState>,
): boolean;
//   over runtime.points' live states: no survey slot errored with a FormatVersionError, every survey
//   slot settled (ready | error | disabled in `settings.galaxyCatalogs.items[id].enabled`, the same
//   intent bit the point rows' own demand reads), and none is ready with count > 0
```

**Behaviour:** `create(deps)` runs, in order: the point renderer (`deps.ctx`, `deps.fadeBgl`,
`deps.sourceBgl`), the bias subsystem constructed over it (no `attachRenderer` step: the renderer is
a constructor dep now; `getMode` reads `runtime.biasLastApplied`, `catalogs` reads
`runtime.catalogs`), the textured and procedural disk renderers, the ring, the pick renderer
(`deps.focusBgl`, `deps.focusUniform.bindGroup`, `SLAB_REVERSED_Z[COSMO]`), the atlas → planners →
walk cluster (`wireImpostorSubsystems`' body, returning the objects instead of assigning
`state.subsystems`), the nine point slots (`wireGalaxyCatalogSourceSlot`'s body: commit uploads to
`runtime.pointRenderer`, writes `runtime.catalogs` and `deps.fades`' per-item re-sync through the
registry it already receives; `subscribe` keeps its two writes at today's beat, now as
`deps.reportSourceCount(source, count)` and `deps.publish({ provenanceCounts })` over the runtime's
tally — Findings 7 and 13 map every call in `wireGalaxyCatalogSourceSlot.ts:57-90` to its home, so a
call with no home here is a STOP, not a new field), the famous-meta slot (commit writes
`runtime.famousMeta` and `deps.publish({ famousMeta: [...meta] })`; error writes and publishes `[]`),
the pgc-alias slot and the hi-res slot (`wireHiResFamousSlot`'s body over `deps.ctx.device` and
`runtime.texturedDiskRenderer`; `commit` per Ruling 4; `requestRender` = `deps.requestRender`). No
synthetic gate is created: the Synthetic row's `demand` is `syntheticShouldArm` (Ruling 13), and
`runFrame.ts:80` already calls `reevaluateDemand` every frame, so the arm needs no explicit nudge —
the gate's own `reevaluateDemand` call dies with it. `destroy(runtime)` is `engine.ts:533-552,576-578` verbatim on the
runtime, plus `runtime.hiResFamous.committed()`'s pair (subsystem before texture) and every slot's
`release()`/`destroy()` in the order the slot API requires (verify at dispatch), then the renderers.
`frame(runtime)` returns the closure that runs `runFrame.ts:222-262` (hi-res `runFrame` over
`runtime.hiResFamous.committed()?.subsystem`, then the shared walk) and returns
`runtime.texturedDisks.hasInFlightWork()` (the `shouldKeepTicking.ts:47` term); the bias compare is
Task 5. `engine.ts` seeds no galaxy field, constructs no bias subsystem, registers nothing galaxy, and its
`getCloud` / `getCloudObjIds` / `loadPgcAliasesFn` read `state.galaxyBridge` (Ruling 5; `null` before
`createLayers` → the same `undefined` / empty-map results the shell tolerates today).
`resolveDeps()` loses `catalogs`.

**Three core sites are deleted here and re-added on the Layer in Task 4**, in the same commit
(Tasks 3 and 4 land together — the split exists only to keep the reading order): the `famousLabels` registration (`engine.ts:372-375`; `produceFamousGalaxyLabels`
loses its `state.data.galaxies` read at `:166` and takes the runtime — its one caller is the Layer
from Task 4), the galaxy row in `coreSelectionRows.ts:7,18` (`galaxyCatalogSelectionRow` takes the
runtime; the `catalogs` read at `:40,48,75-76,148` re-points), and the two galaxy rows in
`fadeLayers.ts:99-106,148-157` (with the `GALAXY_CATALOG_IDS` import at `:18`). Nothing is
knowingly broken in the tree: the commit that deletes the three core sites adds them back on the
Layer. Both files that dispatch arrive here with their `src/state` imports already replaced — the
meta slot's by `deps.publish` (Rulings 6, 12), the source slot's by `deps.reportSourceCount` and
`deps.publish`, with `dispatchCatalogLoaded` deleted rather than re-homed (Ruling 14) — so
`layerImportBoundary` is green at this commit too. Module headers of the moved wiring files drop to
≤ 5 lines (the wiring they narrated is this task's diff), and `createSyntheticFallback.ts`'s header —
the longest of them, arguing for a mechanism this task deletes — goes with the file.

The 192-byte pick image (`pickUniformBytesOf`, `packGalaxyPointUniforms`, `UNIFORM_BYTES`) is now
private to `render/`; `src/services/gpu/lib/cameraUniforms.ts`, `src/data/pickPaddingPx.ts` and
`EnginePickingState.d.ts` keep only prose references (verify at dispatch; a code import there is a
STOP).

- [ ] Adapt `wireHiResFamousSlot.test.ts` (now under `tests/layers/galaxyCatalog/load/`): the
      existing "previous pair destroyed after hand-over, subsystem before texture" assertion is
      re-pointed at `slot.committed()` (Ruling 4) — the real bug is the mirror's removal leaving the
      previous pair alive (a leaked hi-res array texture per tier swap). Its title says it is also
      the pin for `AssetSlot`'s commit-before-`committed` ordering, so a later `AssetSlot` refactor
      reads the failure as its own rather than re-pointing the test.
- [ ] Test (`syntheticShouldArm.test.ts`) `the synthetic backstop arms only when every enabled survey
catalog settled without data` — over a fake `points` map: no arm while one survey slot is still
      loading; no arm when one is ready with `count > 0`; arm when the rest errored and a disabled
      catalog never transitioned; no arm when any survey slot's error is a `FormatVersionError`. Real
      bug it catches: the policy silently narrowed to the `LoadStateKind` discriminant during the
      move — an empty-but-ready catalog then suppresses the backstop, or a version mismatch papers
      over the alert `installFormatVersionAlert` is raising. This predicate replaces a 90-line module
      header's worth of prose, so it is the only place the policy is stated twice.
- [ ] Adapt `famousGalaxiesMetaSlot.test.ts`: `commit publishes a copy of the meta and error publishes []`
      — assert `publish` was called with an array that is not the payload's array by identity (immer
      freezes what the reducer stores; a shared reference freezes the runtime's copy too, and the
      next `setHiResFamous` fold would throw on write). Replaces the dispatch assertion.
- [ ] Fixture sweep, no new assertion: `createTestStore.ts`, `hoverPickDriver.test.ts`,
      `engine.destroyOrder.test.ts` (asserts the same order on the runtime), `engine.tier-swap-race.test.ts`,
      `runFrame.test.ts`, `shouldKeepTicking.test.ts:47`'s case dies with its term, `gpuHandleRegistry.test.ts`
      and `initGpu.hdrCapabilityWiring.test.ts` totality shrink by five rows, `assetWiring.test.ts` /
      `demandTable.test.ts` boot sets lose the galaxy keys, `wireSlots.test.ts` loses its galaxy stubs,
      `engineSlice.test.ts:43` dies with the reducer, the palette container test reads the fact,
      `createSyntheticFallback.test.ts` dies with the file (its policy cases move to the predicate's
      test above), and the four saga fixtures drop `catalogLoaded` — `watchTierSaga.test.ts`'s
      re-anchor case, re-pointed at the count pulse, is the pin for Ruling 14's equivalence.
- [ ] **First, before the wiring lands (Ruling 16):** with `layer.ts` declaring `settings` and the
      fragment removed from `UNFORMED_SETTINGS_FRAGMENTS` (Ruling 15), run
      `npm test -- settings initialSettings store` — this is where the store's new reach into the
      renderer graph shows as a TDZ throw or a worker-loader gap, and it costs minutes instead of a
      bisect over the whole commit. Also confirm no module reachable from `create.ts` imports
      `src/store/` or `src/state/` from outside `src/layers/` (the one edge the ratchet cannot see).
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog createLayers engine runFrame assetWiring demandTable wireSlots gpuHandleRegistry initGpu engineSlice CommandPalette watchTierSaga watchSelectionRows layerImportBoundary frameFilePurity` green.
      Boot the dev server (`/link-data`): the nine sources render, a tier swap re-commits, famous
      thumbnails and hi-res appear on approach, and the splash leaves "loading" (the status echo's
      new home). Commit.

## Task 4 — `fades`, `labels`, `selection` close over the runtime

**review: yes** — the deep-link resolver (Redux/saga area): a galaxy id arriving before
`createLayers` is claimed by no row until the Layer exists.

**Files:** `src/layers/galaxyCatalog/present/galaxyCatalogFadeRows.ts` (new),
`src/layers/galaxyCatalog/present/{produceFamousGalaxyLabels,galaxyCatalogSelectionRow,extractGalaxyRow}.ts`,
`src/layers/galaxyCatalog/layer.ts` (the three hooks); `src/services/engine/wiring/fadeLayers.ts`'s
`layer()` row helper — verify at dispatch: if it is module-local, extract it to
`src/utils/animation/fadeLayerRow.ts` (one symbol) so both callers share it; do not import
`wiring/fadeLayers.ts` from the Layer. The core-side deletions are Task 3's
(`engine.ts:372-375`, `coreSelectionRows.ts:7,18`, `fadeLayers.ts:18,99-106,148-157`); this task
restores the three behaviours from the Layer, in the same commit. Tests `fadeLayers.test.ts`, `coreSelectionRows.test.ts`,
`composeSelectionRows.test.ts:68-86`, `resolveFocusId`'s composed-resolver test, and the three moved
tests under `tests/layers/galaxyCatalog/present/`.

**Produces:**

```ts
// present/galaxyCatalogFadeRows.ts — the two rows of fadeLayers.ts:99-106,148-157, guard over the runtime
export function galaxyCatalogFadeRows(runtime: GalaxyCatalogRuntime): readonly FadeLayer<unknown>[];
//   'surveyLabel' unchanged; 'survey' guard: (_, id) => runtime.pointRenderer.hasCatalog(id)

// present/galaxyCatalogSelectionRow.ts — was (deps: ResolveDeps); catalogs/famousMeta now read the runtime
export function galaxyCatalogSelectionRow(
  runtime: GalaxyCatalogRuntime,
): SelectionKindRow<GalaxyRef>;

// present/produceFamousGalaxyLabels.ts — was reading state.data.galaxies (line 166)
export function produceFamousGalaxyLabels(
  runtime: GalaxyCatalogRuntime,
): Label2DProducer['produceLabels'];
// labels(runtime) → [{ id: 'famousLabels', produceLabels: produceFamousGalaxyLabels(runtime) }]
```

**Behaviour:** `layer.ts` declares `fades: galaxyCatalogFadeRows`, `labels`, `selection: (runtime) =>
[galaxyCatalogSelectionRow(runtime)]`. The fade keys (`survey`, `surveyLabel`) and the handle shapes are
unchanged, so `VisibilityLayerKey`, `visibilityLayerRows.ts` and the tour's visibility actions see
the same rows through `state.fadeRows`. The label producer's id is unchanged (the director keys by
id). `extractGalaxyRow` takes the meta from the runtime instead of an optional argument.

Deep links: `composeSelectionRows` resolves against `state.selectionKindRows`, which gains the galaxy
row only when `createLayers` runs. Verify at dispatch how the composed resolver treats an id no row
claims during the boot window (before `createLayers`): if it defers (as a claimed id with a null
`decode` does), nothing changes; if it resolves to "unknown" and drops the id, the focus-id gate must
wait for `state.layers` to be populated — the DoD's "deep link by pgc-/famous id" check is the pin,
and the reviewer reads `resolveFocusRefDeferring` against D6'2.

- [ ] Adapt the three moved tests to take a runtime fixture (a `Map` and an array) instead of a
      `ResolveDeps` / `EngineState` cast; no new assertion — the behaviours (claims, decode deferral,
      label placement) are the ones already pinned.
- [ ] `fadeLayers.test.ts`'s per-layer seed pins for the two galaxy keys move to the Layer's fade-row
      test file; `coreSelectionRows.test.ts` expects five rows.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog fadeLayers coreSelectionRows composeSelectionRows resolveFocus syncVisibilityFades` green, plus Task 3's list. One commit with Task 3.

## Task 5 — the bias reconcile in `frame`; the saga and the effect die

**review: yes** — Redux sagas and the reconcile seam (state landmines: "saga puts late").

**Files:** `src/layers/galaxyCatalog/frame.ts`, `tests/layers/galaxyCatalog/frame.biasReconcile.test.ts`
(new); `src/store/effects/watchBiasBakeSaga.ts` + `tests/store/effects/watchBiasBakeSaga.test.ts`
(delete); `src/store/rootSaga.ts:16,39`; `src/store/effects/ReconcileEffects.ts:17,32,37`;
`src/services/engine/wiring/makeReconcileEffects.ts:22` + `tests/services/engine/wiring/makeReconcileEffects.test.ts`
(the `bakeBias` case dies).

**Behaviour:** `frame(runtime)`'s closure compares `state.settings.bias.mode` with
`runtime.biasLastApplied` each frame; on a difference it sets `biasLastApplied` first, then calls
`runtime.biasCorrection.setMode(mode)` (the bake is async and may throw into a warning; a compare
that waits for the bake would re-fire every frame during it). `absMagLimit` reaches the subsystem the
way it does today (verify at dispatch: through `BiasCorrectionDeps` or the mode call). The saga, the
effect field and its `makeReconcileEffects` line go; `rootSaga` forks one saga fewer.

- [ ] Test `the frame hook re-bakes once per bias-mode change, not per frame` — drive the closure
      three frames at mode A, then two at mode B; assert `setMode` was called once, with B. Real bug:
      the compare written against the subsystem's own async `getMode` (which lags the bake) re-bakes
      every frame for the bake's duration — a ~200 ms worker job per frame, invisible to the suite.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog rootSaga makeReconcileEffects ReconcileEffects` green. Commit.

## Task 6 — `bias` and `thumbnails` become Layer settings clusters

**Files:** `src/layers/galaxyCatalog/settings/{biasSettings,thumbnailsSettings,galaxyCatalogLayerSettings}.ts`
(new), `src/layers/galaxyCatalog/layer.ts` (`settings: galaxyCatalogLayerSettings`);
`src/@types/settings/CoreSettingsState.d.ts:42-50`, `src/state/settings/coreInitialSettings.ts:72-78`,
`src/state/settings/settingsSlice.ts:22,34,95-105,245-246`; tests `tests/state/settings/settingsSlice.test.ts`
(the bias/thumbnails cases move to `tests/layers/galaxyCatalog/settings/`), `tests/conventions/layerImportBoundary.test.ts`
(unchanged — the row's number must hold).

**Produces:**

```ts
// settings/biasSettings.ts — the shape galaxyCatalogsSettings.ts:52 uses
export const biasSettingsFragment = {
  key: 'bias',
  initialState: { mode, absMagLimit },
  reducers: { setBiasMode, setBiasAbsMagLimit },
} as const;
export const thumbnailsSettingsFragment = {
  key: 'thumbnails',
  initialState: { enabled },
  reducers: { setThumbnailsEnabled },
} as const;
// settings/galaxyCatalogLayerSettings.ts
export const galaxyCatalogLayerSettings = [
  galaxyCatalogsSettingsFragment,
  biasSettingsFragment,
  thumbnailsSettingsFragment,
] as const;
```

**Behaviour:** state paths (`settings.bias.mode`, `settings.thumbnails.enabled`) and action creator
names are unchanged, so `GalaxiesSectionContainer`, `state/settings/selectors.ts`, the three passes
and the URL/persistence layer need no edit (verify at dispatch: `liftClusterReducers` keeps the
reducer key as the action creator name — `galaxyCatalogs`' lifted reducers are the precedent).
`settingsSlice.ts:22` imports `galaxyCatalogLayerSettings` instead of the one fragment and spreads
the tuple into `liftClusterReducers`; its inline `bias`/`thumbnails` reducers at `:95-105` go, as do
the two clusters in `CoreSettingsState` and `coreInitialSettings`. `APP_SETTINGS_FRAGMENTS` gains the
two fragments through `settingsOf` with no edit — `appSettingsFragments.ts` is untouched here, Task 3
having already removed the galaxy fragment from `UNFORMED_SETTINGS_FRAGMENTS` (Ruling 15). The
ratchet row for `settingsSlice` keeps its number, verified at `a1056cbbf`: `ENGINE_AND_STATE_ALLOWED`
is `{ 'state/settings/settingsSlice': 13 }` and counts import _specifiers_ resolving under
`src/layers/` — swapping one fragment import for the tuple import leaves thirteen.

- [ ] No new test: the fragment-uniqueness and seeded-keys tests already cover a derived tuple
      (P1); the moved reducer cases are fixtures, not new assertions.
- [ ] `npm run typecheck:fast`; `npm test -- settings layerImportBoundary initialSettings` green. Commit.

## Task 7 — the sweep: leftovers, ratchets, spec §14, backlog

**Files:** `src/services/engine/phases/wireSlots.ts:1-60` (header: no galaxy sentence survives),
`src/services/engine/engine.ts` (comments naming the deleted fields; the destroy block's ordering
comment at `:537-540` is gone with the block), `src/@types/engine/frame/PassState.d.ts` (header),
`src/@types/loading/AssetKey.d.ts:17` (the `'famousGalaxiesMeta'` member stays — it is a slot key —
confirm no dead members), `src/@types/loading/DemandCtx.d.ts:30` (the `request` doc names one key),
`docs/superpowers/specs/2026-09-09-layer-composition-design.md` §14 (four rows: Rulings 1, 6, 8 and
14 — each "spec said X / plan did Y / why"; 14 is the one deletion the spec did not schedule), `docs/BACKLOG.md` (no item is consumed here that
04c did not already; confirm with `rg -n "galaxy" docs/BACKLOG.md` and touch nothing unrelated).

- [ ] `rg -n "state\.data\.galaxies|GalaxyStore|subsystems\.(galaxyAtlas|texturedDisks|proceduralDisks|diskPlannerWalk|hiResFamous|biasCorrection)|gpu\.(galaxyPoint|galaxyPick|texturedDisk|proceduralDisk|diskRadiusRing)|assetSlots\.(points|famousGalaxiesMeta|pgcAlias|hiResFamous)|engineFamousGalaxiesMetaReported|engineProvenanceCountsReported|selectFamousGalaxiesMeta|watchBiasBakeSaga|bakeBias|syntheticFallback|catalogLoaded|dispatchCatalogLoaded'" src tests tools`
      is empty, except `tools/mcpm-workbench`'s own unrelated `catalogLoaded` (prose in `docs/` is 04e's).
- [ ] Ratchets: `layerImportBoundary.test.ts`'s two ALLOWED maps unchanged from `55a3bd33e`
      (`settingsSlice: 13`, `LAYERS_ALLOWED` empty), its only diff Ruling 17's no-dispatch sweep;
      `frameFilePurity.test.ts`'s
      allow-list unchanged (the four galaxy passes were never listed; their files left the sweep);
      `oneSymbolPerFile`, `filenameMatchesExport` green over `src/layers/galaxyCatalog/types/`.
- [ ] `npm run typecheck` (both projects, `tsc`), `npm run build`, `npm test` green. Commit.

---

## Definition of Done

**Deliverable inventory**

- [ ] `src/layers/galaxyCatalog/layer.ts` exports `galaxyCatalogLayer` via `defineLayer` with
      `name`, `settings` (three fragments, none of them still in `UNFORMED_SETTINGS_FRAGMENTS`),
      `sources` (the 04c tuple), `facts` (`{ famousMeta: [], provenanceCounts: {} }`),
      `create`, `destroy`, `passes`, `assets`, `fades`, `labels`, `selection`, `frame`; no `ui`
      (Ruling 8), no `targets`, no `sagas`. `APP_COMPOSITION.layers` is `[galaxyCatalogLayer]`.
- [ ] `LayerInstance` carries `passes`, `assets`, `fades`, `labels` — and no `runtime` (Ruling 5);
      `EngineState` carries `passes`, `assetRows` (folded once), `fadeRows`, `layerSlots` and the
      temporary `galaxyBridge`; `createLayers` composes them, asserts the slot keys disjoint and
      registers label producers. No file under `src/layers/` dispatches (Ruling 17's sweep).
- [ ] Core is galaxy-free: no galaxy member on `EngineGpuHandles`, `EngineSubsystemHandles`,
      `EngineAssetSlots`, `EngineData` (`galaxies` gone; `structures`, `bodies` stay), `GPU_HANDLE_ROWS`
      (five rows fewer; `pickProgram` keeps `constructPhase: 'wireInput'`), `ASSET_WIRING` (eleven rows
      fewer), `FADE_LAYERS` (two fewer), `CONTENT_PASSES` (four fewer; `FRAME_ORDER` unchanged),
      `coreSelectionRows` (five rows), `ResolveDeps` (no `catalogs`); `engine.ts` seeds, constructs,
      registers and destroys nothing galaxy; `initGpu.ts` has no `attachRenderer`; `wireSlots.ts` has
      no galaxy mint loop, impostor block, hi-res mint or synthetic gate.
- [ ] Deleted: `src/services/biasCorrection/`, `createGalaxyStore.ts`, `GalaxyStore.d.ts`,
      `watchBiasBakeSaga.ts` (+ test), `ReconcileEffects.bakeBias`, the `makeReconcileEffects` line, the
      `rootSaga` fork, `createSyntheticFallback.ts` (+ test), `dispatchCatalogLoaded.ts`,
      `src/state/catalog/catalogLoaded.ts`, `engineFamousGalaxiesMetaReported`,
      `engineProvenanceCountsReported`, `CoreEngineSliceState.meta.famousGalaxies` and
      `.provenanceCounts`, `selectFamousGalaxiesMeta`, `RequestKey`'s `'syntheticFallback'`,
      `EngineSubsystemHandles.hiResFamous` / `.hiResFamousTexture`, `rebuildOnSwapFormat` on the ring
      (the row itself is gone), and `assetWiring.ts`'s own `expandCompanionRows` call.
- [ ] Still present, by design (04e's): `EngineHandle.sources` / `.selection` (reading
      `GalaxyCatalogBridge`), `useAliasIndex`, `useStructureMemberCount`, `engineHandleRef`,
      `RequestKey` = `'paletteOpened'`, `ctx.request`, `GalaxiesSectionContainer` rendered by hand in
      `SettingsPanel.tsx`, `SOURCE_REGISTRY` in `src/data/sources.ts`, the id types in
      `src/@types/data/galaxyCatalog/`.
- [ ] Six new assertions exist (Task 1 ×2, Task 3 ×3, Task 5); every moved test lives under
      `tests/layers/galaxyCatalog/`.

**Named observable behaviours** (user-attested on the branch's dev server with `/link-data`;
f.lux off for the thumbnail check)

- [ ] Boot: the app reaches the Earth home with no console error; DebugPanel › assets lists the nine
      `<id>-points` slots, `famousGalaxiesMeta` right after `famousGalaxy-points`, `pgcAlias` idle,
      `hi-res-famous` — the same names as on `main`.
- [ ] Nine sources render: with every galaxy catalog enabled at 200 Mpc, the point cloud matches
      `main` by eye; toggling SDSS off fades it (the `survey` fade row); toggling Famous › Labels off
      fades the names (the `surveyLabel` row).
- [ ] Tier swap small ↔ medium: catalogs re-commit in place, no black frame; after the swap the
      famous thumbnails and the hi-res array are back (DebugPanel › assets: `hi-res-famous` ready
      once, not twice).
- [ ] Famous thumbnails + hi-res on approach: fly to M87 from 30 Mpc; the atlas quad appears, then the
      hi-res texture swaps in without a flicker (the `frame` order: hi-res before the shared walk).
- [ ] Bias mode change re-bakes: Settings › Galaxies › bias mode from `none` to the corrected mode;
      the cloud re-weights once within a second and the DevTools worker list shows one Schechter
      worker, not one per frame.
- [ ] Disk-radius ring overlay: DebugPanel's ring toggle draws the ring on the selected galaxy; then
      toggle HDR (the swap-format path) and the ring still draws (Ruling 9).
- [ ] Pick a galaxy: hover highlights, click selects, InfoCard shows the row (`extractGalaxyRow` over
      the runtime); pick a structure ring and the Milky Way — unchanged from 04c.
- [ ] Deep link by `pgc-` and by famous id: open `#focus=pgc-<n>` and `#focus=m87` in a fresh tab;
      both select once their catalog lands (Task 4's boot-window check).
- [ ] Cmd+K lists famous galaxies (the palette reads the fact) and PGC aliases resolve after the first
      open (`pgcAlias` demand raised through the bridge).
- [ ] DebugPanel › provenance shows per-source estimated counts as catalogs land (the second fact).
- [ ] Tier swap re-anchors a focused galaxy: focus a PGC galaxy, swap tiers, focus survives — the pin
      for `catalogLoaded`'s replacement pulse (Ruling 14) in the app, not just in the saga test.
- [ ] Synthetic fallback offline: block `*.bin` in DevTools and reload; the synthetic cloud appears
      once (Ruling 13's predicate — watch the network panel for a single synthetic fetch, not one per
      frame), and the loading bar/StatusBar report the counts as catalogs land (the status echo).
- [ ] Paired `npm run perf` A-B-A-B (`full-survey`, `milky-way`, `solar-system`) against `main`'s
      server: CPU frame time within noise; the four galaxy passes' GPU timings present under the same
      names.

**The deferral boundary** — see Deferred. Nothing under `src/components/` moves; no fact beyond
`famousMeta` and `provenanceCounts` is published; `EngineHandle` keeps `sources` and `selection`; no
`galaxiesOnly` composition exists; no docs under §15 are updated; the deletion audit is not run.

## Deferred

**04e (the shell channel and the reference engine):** the facts `aliasIndex`
(with `buildAliasIndex` into the Layer and PGC stored as a number) and `structureMemberCount` (a
frame reconcile over `runtime.catalogs`, keyed on the selected structure, the catalogs version and
the visible mask — spec D6); the deletions of `EngineHandle.sources` / `.selection`,
`GalaxyCatalogBridge` and `state.galaxyBridge`, `useAliasIndex`,
`useStructureMemberCount`, `engineHandleRef`, `RequestKey` + `ctx.request` + `state.requests` (the
`pgcAlias` demand flips to `ui.paletteOpen`); D13's `ui` with the module-cycle fix (Ruling 8) and
`GalaxiesSection(+Container)` into `ui/`; `galaxiesOnly.ts` + its `tools/` entry; §15 docs
(`add-data-source` skill, RENDERER.md, CLAUDE.md, DATA.md's galaxy folder line); the deletion audit.

**Later, unruled by this sequence:** `composeSources(layers)` and the composed `SOURCE_REGISTRY`'s
home (Ruling 1: needs the ten `src/data/` readers of galaxy entries to stop reading at module init
first); `GalaxyCatalogId` and friends into the Layer's `types/` (blocked by the `state` and
`animation` importers).

**Adjacent, unruled** (ask the user, per the adjacent-findings rule; not planned): the
`?worker` and `?static` imports now sit in the store's module graph through `APP_COMPOSITION` —
every store test evaluates the renderer modules; if that shows in suite time, the composition could
take Layers as thunks (Ruling 16 rules the correctness of the edge, not its suite cost).
`AssetWiringRow.factory` means "mint this slot" for a core row and "hand back the already-minted
slot" for a Layer row, with `SlotDeps` passed only for signature parity — a Layer row could carry its
slot as a value instead, which would also delete Task 1's "called once, not per frame" bug class.
`LayerCoreDeps.store` now exists only for settings reads (Ruling 17), so it could narrow to a
getter. `instancedQuadRenderer.ts:101`'s second `UNIFORM_BYTES = 96` (04c adjacent)
now lives beside the first inside one folder.
