# `src/layers/` — self-contained Layers

A **Layer** is one slice of the scene that owns everything it needs: its sources,
its settings, its renderers, its asset slots, and every contribution it makes to a
frame. Core composes Layers; it does not reach inside one.

The contract is `Layer` (`src/@types/engine/layer/Layer.d.ts`), built with
`defineLayer` (`src/services/engine/layer/defineLayer.ts`) and assembled by
`createLayers`. `src/layers/galaxyCatalog/` is the reference implementation for the contract; follow ADR 0014 for folders.

## Where things go

**A Layer is a set of concern modules plus the few files the composition root reads by path** ([ADR 0014](../../docs/adrs/0014-layers-organised-by-concern-modules.md)). Code is grouped by what it is for (`disks/`, `pointSprites/`, `aliases/`), never by kind of file, and no folder under `src/layers/` holds more than 15 files (`tests/conventions/concernFolderShape.test.ts`).

**At the Layer root** stay only:

| Contract member | Lives in                                       | Notes                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | `layer.ts`                                     | The whole `defineLayer` call, nothing else                                                                                                                                                                                                                                             |
| `create`        | `create.ts`                                    | Mints the Runtime — the Layer's private guts                                                                                                                                                                                                                                           |
| `destroy`       | `destroy.ts`                                   | Releases exactly what `create` took                                                                                                                                                                                                                                                    |
| `planners?`     | `frame.ts`                                     | Per-frame content planning; appended to `state.planners` by `createLayers`                                                                                                                                                                                                             |
| `visibility?`   | `visibility.ts`                                | Static show and label entries, data only; `APP_VISIBILITY_REGISTRY` imports the tuple, so it never imports `layer.ts`                                                                                                                                                                  |
| `heightAt?`     | `heightAt.ts`                                  | Runtime-bound: the ground height core's camera reads; the datum with none. One provider per composition; boot throws on two                                                                                                                                                            |
| `settings?`     | `state/`                                       | `state/<slice>/{slice,initialState,selectors}.ts` per cluster + `state/slices.ts` tuple; `state/defaults.ts` optional                                                                                                                                                                  |
| `sources?`      | `sources/`                                     | One `APP_SOURCE_REGISTRY` row per file, + the rows array; optional code-keyed `<layer>SourceRecord.ts` for the Layer's own lookups (Layers never import `APP_SOURCE_REGISTRY`); its id types live in `@types/`                                                                         |
| `bodies?`       | `bodies/`                                      | One body row per file, + the rows array. Leaf data: imports types, `src/data` constants and makers, and pure utils; never a body table, `layer.ts` or a pass. `compositions/appBodies.ts` collects them by import, a host's Layer (body's Earth) before the Layers whose rows orbit it |
| —               | `bodies/makers/`                               | The Layer's own row builders (`heliocentricPlanet`, `satelliteBody`), imported by its `bodies/` rows only                                                                                                                                                                              |
| `exhibits?`     | `exhibits/`                                    | One exhibit per file + `exhibits/exhibits.ts`, the rows array `appExhibits` folds after core's by import                                                                                                                                                                               |
| `facts?`        | type in `@types/`, initial value in `layer.ts` |                                                                                                                                                                                                                                                                                        |
| `targets?`      | `layer.ts`                                     | Appended after core's rows; core allocates and resizes them                                                                                                                                                                                                                            |
| —               | `@types/`                                      | The Layer's **contract** types only, one per file, filename = the type: `<Name>Runtime`, its facts, its settings types (`StructureSettings` and the like), its id and source types. Types shared with core or a sibling Layer stay under `src/@types/`                                 |

**Every other contract member and all runtime machinery live in a concern module,** `<concern>/<role>/`. The members that are collections (`sagas?`, `ui?`, `passes`, `computes?`, `assets?`, `search?`, `sourceCounts?`, `slabs?`, `skyCaptures?`, `guides?`, `selection?`) are still declared in `layer.ts`; each imports its leaves from the module that owns the concern. A module uses only the role folders it needs:

| Role folder   | Holds                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render/`     | GPU pipeline objects: renderers, vertex layouts, uniform packers                                                                                                                             |
| `subsystems/` | Stateful per-frame machinery that decides what to draw (see below)                                                                                                                           |
| `passes/`     | One `ContentPass` factory per file                                                                                                                                                           |
| `load/`       | Fetchers, `AssetSlot`s and the `assets` / `sourceCounts` declarations, beside their slots                                                                                                    |
| `present/`    | `guides`, `selection`, `search`, `slabs` rows (`search` is an async iterable; each yield replaces the Layer's previous snapshot; `slabs` is a static `readonly SlabRow[]`, data not closure) |
| `ui/`         | SettingsPanel/DebugPanel sections, a `labelsAndGuides` row, a `detailCard` InfoCard arm — hand-written; store-reaching components live here                                                  |
| `sagas/`      | One saga per file; store-reaching, so the store-boundary sweep exempts it                                                                                                                    |
| `@types/`     | The module's own types, one per file                                                                                                                                                         |
| `utils/`      | The module's helpers, one function per file; a helper with a second Layer or core user stays in `src/utils/`                                                                                 |
| `data/`       | The module's constants and tables, one per file; a constant with a second Layer or core user stays in `src/data/`                                                                            |
| `computes/`   | Compute passes                                                                                                                                                                               |

A module's `utils/` is flat: one function per file, no `<area>` subfolders unless it passes the cap. A non-contract type lives in the `@types/` of the module that produces its values; sibling modules import it from there, and it never sits in the root `@types/`. A module whose role folder outgrows 15 files splits into sub-modules, each with its own role folders. A root folder over the cap (`bodies/`, `sources/`, `exhibits/`) groups its leaves in subfolders (`bodies/planets/`, `bodies/moons/`), still imported by the composition root leaf by leaf. Module names say what the thing is for; `helpers`, `misc`, `common`, `shared`, `other` and `utils` are refused as module names.

galaxyCatalog's shipped modules, as an example of the layout:

```
galaxyCatalog/
  layer.ts  create.ts  destroy.ts  frame.ts  visibility.ts
  sources/  state/
  @types/                      GalaxyCatalogRuntime.d.ts …
  records/{load,data,present,utils,@types}/
  pointSprites/{render,passes,data,utils,@types}/
  lod/{data,subsystems,utils,@types}/
  disks/{load, quad/, procedural/, textured/}   (sub-modules, each with its own role folders)
  hiResFamous/{subsystems,load,data,utils,@types}/
  aliases/{load,sagas,utils,@types}/
  card/ui/  provenance/{ui,utils,data}/  controls/ui/
```

An exhibit's notes are sections, each `section(kind, data)`. A **section kind**
(`ExhibitSectionKind`) carries its `Component`, and optionally a `hold` (the saga that
replaces the exhibit's default hold), `shortcuts` (walked ahead of the global table
while the exhibit runs, handed the section's data) and a `cameraDriver`
(`ExhibitCameraDriver`: core lifts it into the driver table, turns it on only while an
exhibit carrying the kind runs, hands `pose` that exhibit's data, and lets it own the
drag). A kind lives beside its exhibit (`exhibits/<area>/`); the files it reaches that
read or write the store sit in `ui/` and `sagas/`, which the outbound sweep exempts. An
exhibit's id is also listed by hand in `src/@types/exhibits/ExhibitId.d.ts`.

**`subsystems/` vs `render/`.** Both stay, inside a module. `render/` holds GPU pipeline objects and what feeds them directly: renderers, pick renderers, stores that own GPU buffers, vertex layouts, uniform packers. `subsystems/` holds stateful per-frame machinery that decides _what_ to draw before any pipeline runs: LOD planners, sticky maps, bake state machines, their workers. A pair that spans the two keeps one name (`proceduralDiskSubsystem` / `proceduralDiskRenderer`). A module with no per-frame decision state has no `subsystems/` folder.

**Where declaration rows live.** A row's folder names the concern it describes, not the fact that it is a row: `assets` and `sourceCounts` sit in `load/`, `guides`, `selection`, `search` and `slabs` in `present/`.

## Rules

- **One symbol per file, filename = the symbol.** Deep relative imports, no barrels,
  no `index.ts`.
- **Types never live inline in implementation files.** A React component's own
  `Props` is the one exception.
- **`passes/` files export only their one named symbol** — helpers go to the
  module's `utils/`, constants to its `data/` (`src/utils/`, `src/data/` when shared). Ratchet:
  `tests/conventions/serviceFilePurity.test.ts`.
- **Pass names are globally unique.** `createLayers` throws at boot if two Layers
  answer to the same one, which is what catches a half-finished migration where
  core still holds a row the Layer now also declares.
- **A multi-cluster Layer's settings tuple is imported from the Layer, never off
  `APP_COMPOSITION`.** Reading it there would make the settings root type depend on
  the Layer's, which depends (via `ContentPass` → `PassState`) on that same root
  type — a circular alias.
- **Shaders do not move into a Layer.** WGSL stays at
  `src/services/gpu/shaders/<family>/`. The `?static` specifiers are invisible to
  `tsc` — only `npm run build` catches a dangling one.
- **A Layer never drives a fade.** It declares `visibility` entries, `fade:` on its
  passes, planners and computes, `label:` on its label rows and `gates` on its asset
  rows; core seeds, retargets and resolves every fade from them. `LayerCoreDeps` has
  no fade registry by design.
- **Tests mirror the tree** under `tests/layers/<name>/`.
- **Moving a file uses `npm run move-files`**, never `git mv` plus hand-edited
  imports — and grep afterwards, since it misses `.wesl` `package::` specifiers and
  string-literal paths.

## Status

`galaxyCatalog`, `starCatalog`, `cosmicWebFilaments`, `cosmicWebDensity`,
`flow`, `zoneOfAvoidance`, `localBubble`, `constellations`, `blackHoles`,
`milkyWay`, `lightTime`, `cosmicHorizon`, `structure`, `missions` and `body` are formed.
`cosmicHorizon` draws the particle-horizon shell and carries the Observable Universe exhibit. `body` draws
Earth, the planets, moons and rings: its own renderers, texture slots, passes and
atmosphere computes, with its Earth and planet slab rows declared in `layer.ts`; its
shape-model moons go through core's one mesh handle. It also streams and plans the
surface tiles, and its `heightAt` is the ground core's camera reads. It declares its identity: the body rows in `body/bodies/`, the
`body` selection kind and card, palette rows, name captions, orbit trails and the
Solar System exhibit. `missions` draws its craft: the rows live in
`missions/bodies/`, and its own mesh, contact-shadow and glint passes draw
through core's one mesh renderer handle. `earthScenes` declares the Earth scene rows (they
fold into the tables), its own `earthScene` selection kind and palette row, and draws Søndermarken: its mesh through core's one mesh handle, its
glint through its own renderer.
