# Layer composition review — 2026-09-09

Scope: every renderable data layer, the edit surface a new one incurs, and how far the
engine is from being assembled at build time from a chosen set of layers. Facts from six
read-only surveys over `src/`, `tools/`, `docs/`, and the agent memory; no code changed.

Companion maps: [`engine-composition-map.md`](engine-composition-map.md),
[`subsystem-sweep.md`](subsystem-sweep.md), [`decisions.md`](decisions.md), ADRs 0005/0006/0011.

## 1. Ask

1. Define a data layer in one place, as data.
2. One place where a layer plugs into the subsystems (settings, loading, rendering, UI, pick).
3. Build-time composition: a small engine with a chosen subset of layers, not the monolith.
   First consumers, in order: a galaxies-only reference engine (compile gate), then the
   scene workbench (LiDAR + splats) as the first real one.

## 2. Inventory

`SOURCE_REGISTRY` (`src/data/sources.ts` + `src/data/sources/*.ts`): 32 rows, codes 0–31,
append-only, ten `type` families.

| family (`type`) | rows                                                              | shared machinery per family                                                            |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `galaxyCatalog` | synthetic, sdss, 2mrs, glade, famousGalaxy, milliquas, desi×3 (9) | one fetcher, `assetSlots.points`, point/pick/disk renderers, `settings.galaxyCatalogs` |
| `starCatalog`   | gaiaStars (survey), famousStar (seeded)                           | one fetcher, `assetSlots.starCatalogs`, star renderers, `settings.starCatalogs`        |
| `structure`     | cluster, supercluster, void, group                                | one `.ccat` fetcher (3 of 4), marker renderer, `settings.structures`                   |
| `volume`        | cf4-density, mcpm, polyphorm-2mrs, mcpm-workbench, debug×3        | volume renderer, `settings.volumes`; **one hand-written asset row each**               |
| `body`          | planet, earth, sun, sgr-a-star, s-star                            | 14 body renderers, texture slots, `settings.bodies`                                    |
| singletons      | filament, flow, milkyWay, constellations, zoneOfAvoidance         | one renderer + one flat settings cluster each                                          |

Layers **outside** the registry: Edenhofer dust (built, deployed, no row/fetcher/renderer/
settings), atmosphere (rides `earth`), black holes (`BLACK_HOLES` keyed by body id), Earth
tile pyramid (own manifest, own versioning), fonts (fetched from app origin), PGC aliases
(fetcher/slot, no row), local-volume distance override (baked into `.bin` bytes),
`public/data/geo3d/` (orphan bake, unreferenced).

Registry-like tables beside `SOURCE_REGISTRY` (18 found): `ASSET_WIRING`,
`GALAXY_CATALOG_SOURCE_REGISTRY`, `GPU_HANDLE_ROWS`, `renderTargetRows`, `CONTENT_LAYERS`,
`FADE_LAYERS`, `SCALE_FADE_BANDS`, `STRUCTURE_MARKER_STYLES`, `RESOLVE_PICK`,
`PICK_SEEDS_BY_BODY_ID`, `LABEL_HOME_BY_SOURCE_TYPE`, `BLACK_HOLES`, `BODY_TEXTURE_REGISTRY`,
`FONTS`, `DEBUG_OVERLAY_ROWS`, `allowDataFile`, `RAW_DATA`, `DESI_PATCHES`.

## 3. What a new layer touches today

Two different tasks hide under "add a layer".

### 3a. New row in an existing family (e.g. a fifth survey, a fifth volume)

Registry-derived, no edit needed: id unions (`GalaxyCatalogId`, `StructureId`, …),
settings `items` seeding, `FADE_LAYERS` expansion, `RESOLVE_PICK` dispatch, label
categories and display info, star-catalog asset rows, structure marker buckets, tier
filename resolution, colour/flux/Schechter lookups.

Still hand-edited per family:

| family        | site                                                                                                                     | caught?                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| galaxyCatalog | `GALAXY_CATALOG_SOURCES` hand subset (`sources.ts:210`)                                                                  | test only              |
| galaxyCatalog | `pointRow(...)` in `assetWiring.ts:190` (demand + priority)                                                              | silent                 |
| galaxyCatalog | `GALAXY_CATALOG_SOURCE_REGISTRY` row (construction + reload)                                                             | silent, documented dup |
| galaxyCatalog | `galaxyType.ts` switch case                                                                                              | tsc                    |
| galaxyCatalog | `buildAllBins.ts` parser wiring, `allowDataFile.ts` regex                                                                | silent                 |
| volume        | one literal block in `assetWiring.ts:248-289`                                                                            | silent                 |
| volume        | `makeRunTierTransition.ts:72,76` if tiered                                                                               | silent                 |
| structure     | `BULK_CATALOG_CATEGORIES`, `structureCatalogToStructures.ts` branch, `structureFocusSubsystem.ts:82` chain, `emitCounts` | silent ×4              |
| structure     | `STRUCTURE_MARKER_STYLES` row                                                                                            | tsc                    |
| structure     | WESL `SOURCE_CODE_X` literal                                                                                             | parity test            |
| body          | `PICK_SEEDS_BY_BODY_ID` row                                                                                              | tsc                    |
| body          | `sceneBodyPickId.ts` / `starPickId.ts` literal-id chains                                                                 | silent                 |
| any           | `allowDataFile.ts` regex, `ATTRIBUTIONS.md`                                                                              | silent                 |

### 3b. New family (e.g. Edenhofer dust, LiDAR, splats)

Everything in 3a plus, all hand-edited and none tied together by a type:

1. `SourceEntry` union variant + row file.
2. Settings cluster on `EngineSettingsState` + `initialState.ts` seed + reducers.
3. Fetcher + slot + `EngineAssetSlots` field + `ASSET_WIRING` row + `slotFor`/`installSlots` if numeric-keyed.
4. `GPU_HANDLE_ROWS` row(s) (tsc-checked) + `EngineState.gpu.*` field.
5. `RenderTargetSpec` row if it needs an offscreen.
6. `frameProgram()` `steps.push(...)` at the semantically right position (imperative; a target with no step draws nothing, silently).
7. `ContentLayer` file + row in `CONTENT_LAYERS` (32-row array; `target`/`slab` are plain strings, no tie to 5 or 6).
8. `FADE_LAYERS` row (type-level totality over `VisibilityLayerKey`) + `SCALE_FADE_BANDS` row if distance-faded.
9. `RESOLVE_PICK` row + `LABEL_HOME_BY_SOURCE_TYPE` row if pickable / label-bearing; label producer registration in `engine.ts:592-617`.
10. SettingsPanel section + container; `LabelsAndGuidesSectionContainer` hand row if a guide.
11. `captureSettings.ts:39-63` cluster list (tour capture) — currently omits 11 clusters.
12. `PASS_GROUP_TITLES`, DebugPanel section if tuned.
13. `allowDataFile.ts`, `rawDataRegistry.ts`, build script, `ATTRIBUTIONS.md`.

Thirteen homes, three type-checked (1, 4, 8). The `add-data-source` skill still documents
sites that have since been consolidated (click-handler chain, 11 marker-renderer sites,
`StructureId` union) and misses several that now matter (6, 7, 11).

## 4. Composability today

- **Boot constructs every renderer for every layer unconditionally** (`GPU_HANDLE_ROWS`,
  43 rows, `initGpu.ts:81`). No branch anywhere is keyed on "is layer X wanted"; settings
  gate per-frame `enabled()` only.
- **Three hard boot couplings** break a partial engine outright: `wireSlots.ts:97-101`
  throws without the disk-impostor renderers; `wireInput.ts:68-69` returns early (no
  camera, no pick, no input at all) without `galaxyPointRenderer`; `startLoop.ts:88-97`
  throws without the Milky Way cloud, horizon shell, and disk renderers.
- **Store is one fixed shape**: nine static slices (`rootReducer.ts:51`), one monolithic
  `settings` slice, twenty sagas always forked (`rootSaga.ts:35`), two of them layer-specific
  (flow reseed, bias bake). `EngineState.settings` getters dereference slices with no guard.
- **`pickProgram` is built once against the full `CONTENT_LAYERS`** (`gpuHandleRegistry.ts:500`).
  A subset means forking the array, not passing a parameter.
- **`ContentLayer` exists and is the right seam shape** (name, slab, target, blend,
  enabled/draw/pickEnabled/drawPick) but every method takes the whole `EngineState`, so a
  layer can read anything; nothing scopes it.
- **Cross-layer reads**: Sgr A\* lensing reads the sky cubemap that galaxy and star layers
  capture into; two star sibling layers import `starCatalogLayer.enabled`; `focusUniform`
  is a shared GPU uniform written by `structureFocusSubsystem` and read by points, disks,
  pick; `FOREGROUND_MAX_DISTANCE_MPC` is ANDed into ~9 layers' `enabled()` from outside.
- **Three rendering workbenches each rebuild camera, frame loop, and pass ordering** instead
  of composing the engine: flow-workbench 1.2k LoC glue, scene-workbench 1.5k, galaxy-renderer
  10.6k with a 764-line `createGalaxyEngine` that hand-mirrors bloom pass order.

## 5. Already ruled — do not relitigate

- ADR 0011 / decisions #9: composition is normalized **one family at a time** into row
  registries; rungs 1–8 shipped. The umbrella `SubsystemBundle` type is **deferred, not
  rejected** (decision #17). Its recorded objection was "thin grouping over rows that
  already exist"; build-time omission of a layer is a new argument that objection never
  weighed.
- Rejected: derived frame ordering (toposort) — ordering is semantic; schema-generated
  settings UI; `WAKE_LAYERS`/`GENERATED_ARTIFACT_ROWS` tables; merging `FADE_LAYERS` with
  `VISIBILITY_ACTION_ROW`; a `bearsPick` axis; one URL params table.
- Row-keying rule (#12): a row is identified in its own domain, never a re-added
  `key: string`. Row-divergence rule (#10): no per-row optional flag to patch a misfit.
- Hard constraints: source codes append-only; pick encoding 6+26 bits with WESL parity;
  `src/data/` never imports `services/`; store stays fade-free; engine-core keeps shared
  accumulators, step gates, `ctx`, pick infra, tone/bloom, camera/input.

## 6. Findings, ranked by how much they block the ask

1. **No unit of composition exists.** The registry keys sources; nothing groups a family's
   renderer rows, asset rows, content layers, fade rows, settings cluster, pick resolver
   and UI into one thing that can be present or absent. This is the deferred umbrella.
2. **Boot phases assume the galaxy and Milky Way layers** (§4, three sites). Any partial
   engine dies here first.
3. **Settings state is a closed monolith.** A layer's cluster is a field on
   `EngineSettingsState` plus a seed in `initialState.ts` plus reducers; cannot be omitted
   or contributed.
4. **Three untyped tables must agree for a layer to draw**: `renderTargetRows`,
   `CONTENT_LAYERS`, `frameProgram()` steps. Silent on mismatch.
5. **Galaxy sources are registered in three lists** (`GALAXY_CATALOG_SOURCES`,
   `GALAXY_CATALOG_SOURCE_REGISTRY`, `pointRow` calls) plus a fourth in
   `tools/mcpm-workbench`. Backlog: point-source double registration.
6. **Volumes have no family-level asset row**; four literal blocks plus two tier-reload
   lines. The demand loop never reloads a ready slot, so tiering is a second enumeration.
7. **Structure category is still re-encoded at four silent sites** (focus chain, bulk list,
   decoder branch, counts) despite `StructureId` now being derived.
8. **Per-family knowledge scattered outside the registry**: marker styles, famous label
   style, `sourceClass` byte semantics, `buildGalaxyInfo` provenance strings, `galaxyType`
   band arithmetic (admits it mirrors `bandLabels` without importing), DESI drill geometry,
   `allowDataFile` regexes re-encoding `binBaseName`/`tiered`.
9. **Data pipeline bypasses**: fonts, Earth tiles, and the `group` category (Vite JSON
   import) skip manifest/R2; structures double-load (seed bundled and baked into `.ccat`).
10. **Edenhofer dust** is deployed with zero runtime wiring — the natural first "add a
    family" proof once the seam exists.

## 7. Settled decisions

Settled: build-time composition (not runtime gating); first consumers = galaxies-only
reference engine, then scene workbench. Full transcript:
[`docs/grill-sessions/layer-composition-2026-09-09.md`](../../grill-sessions/layer-composition-2026-09-09.md).

1. Composition mode: build-time (second entry point, absent layers excluded from the
   bundle), not runtime `if (enabled)` gating. Settled.
2. Unit of composition: the source-type family, renamed `Layer`. Settled.
3. Subsystems dissolve into Layer-private state; `structureFocus`'s `focusUniform` gets a
   named core seam (genuine cross-Layer contract); tour/debug subsystems stay core. Settled.
4. `ContentLayer` renamed to `ContentPass` (own prep PR, ~32 file renames); `Layer` is the
   1:N composition unit over `ContentPass`. Settled.
5. Settings are composed from per-Layer fragments (cluster type + seed + reducers) into a
   root type derived from the engine's Layer tuple, not one shared type every engine
   carries. Settled.
6. Core boundary: device, camera/input, frame executor, targets/post, pick program, fades
   registry, render scheduler, asset queue. Labels/selection/pick are core mechanism with
   per-Layer producer/resolver rows. Tour/clip machinery stays core for now (flagged for a
   later optional split). Earth home pose moves from `wireInput` into the engine
   composition config. Settled.
7. Frame order: one global hand-authored total order in `frameProgram`, filtered to a
   subset engine's owned passes; a pass with no matching line fails at startup. No
   per-engine order lists. Settled.
8. Layer location: colocated `src/layers/<name>/`, migrated incrementally per Layer via the
   refactor CLI. Settled — subfolder layout in §9.
9. Migration order: prep (rename, boot de-coupling + home pose, `defineLayer` + composed
   settings) → `galaxyCatalog` Layer + reference engine compiles → remaining families one PR
   each in dependency order (`starCatalog`, `milkyWay`, `structure`, `volume`, `body`,
   singletons) → Edenhofer dust as the greenfield proof → scene workbench adopts core.
   Settled.
10. PR packaging: the three prep changes land as separate PRs, in the order above, ahead of
    the `galaxyCatalog` PR. Settled.
11. Settings-cluster access: one widening accessor per Layer in its `settings/` folder, no
    cast, no generic `EngineState`, no declaration-merged registry `interface`. Settled.
12. `EngineData` and `EngineAssetSlots` dissolve per-Layer alongside subsystems, in the same
    per-Layer PR. Settled.
13. `SOURCE_REGISTRY` rows split into each Layer's `sources/`, reconstituted from the Layer
    tuple; the `Source` code enum stays global. Settled.
14. Pass order becomes one hand-authored nested `FRAME_ORDER` list of named steps, not a
    separate `PASS_ORDER` array plus `frameProgram()`; `ContentPass` loses `target`, `slab`,
    `skyCapture`, `hdrPostLensing`. Settled.

## 8. Stale documentation found

- `.claude/skills/add-data-source/SKILL.md`: click-handler `||` chain, 11 marker-renderer
  sites, `structurePoiStyles.ts` name, `STRUCTURE_CATEGORY_META` (never existed) — all stale.
- `docs/DATA.md`: claims Edenhofer has no `allowDataFile` entry; it does (`/^edenhofer-dust-.../`).
- `src/data/defaults.ts:479-486`: docblock cites `setVolumePalette` + localStorage; neither exists.
- `ATTRIBUTIONS.md`: no Milliquas entry.
- `constellations.json` is emitted only by the Rust star builder; no TS path produces it.

## 9. Layer folder structure

Colocated per Layer under `src/layers/<name>/`, fixed subfolder names, omit when empty:
`layer.ts` (the `Layer` object, the only import surface), `sources/`, `settings/`, `load/`,
`subsystems/`, `render/`, `passes/`, `present/` (labels, fades, pick resolver, info-card),
`ui/`, `types/`, mirrored by `tests/layers/<name>/`. `Source` codes and the selection
encoding stay outside any Layer (cross-cut all of them).

Shaders stay in `src/services/gpu/shaders/<layer>/` — NOT moved into `src/layers/`. They
are one WESL package rooted there; 50+ `package::<dir>::…` literals resolve against that
root, the plugin doesn't support multiple packages, and two external consumers (the
galaxy-renderer tool's symlinks + `wesl.toml`, shader parity tests) pin the current paths.
