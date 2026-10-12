# `src/layers/` — self-contained Layers

A **Layer** is one slice of the scene that owns everything it needs: its sources,
its settings, its renderers, its asset slots, and every contribution it makes to a
frame. Core composes Layers; it does not reach inside one.

The contract is `Layer` (`src/@types/engine/layer/Layer.d.ts`), built with
`defineLayer` (`src/services/engine/layer/defineLayer.ts`) and assembled by
`createLayers`. `src/layers/galaxyCatalog/` is the reference implementation.

## Where things go

**The folder layout is the contract, spelled out.** A contract member that is one
function is a root file named for it; a member that is a collection is a folder.

| Contract member | Lives in                                       | Notes                                                                                                                 |
| --------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`          | `layer.ts`                                     | The whole `defineLayer` call, nothing else                                                                            |
| `create`        | `create.ts`                                    | Mints the Runtime — the Layer's private guts                                                                          |
| `destroy`       | `destroy.ts`                                   | Releases exactly what `create` took                                                                                   |
| `planners?`     | `frame.ts`                                     | Per-frame content planning; appended to `state.planners` by `createLayers`                                            |
| `settings?`     | `state/`                                       | `state/<slice>/{slice,initialState,selectors}.ts` per cluster + `state/slices.ts` tuple; `state/defaults.ts` optional |
| `sources?`      | `sources/`                                     | One `SOURCE_REGISTRY` row per file, + the rows array                                                                  |
| `sagas?`        | `sagas/`                                       | One saga per file                                                                                                     |
| `search?`       | `present/`                                     | Palette rows, an async iterable; each yield replaces the Layer's previous snapshot                                    |
| `sourceCounts?` | `load/`                                        | Per-source counts, an async iterable, on the same terms as `search?`                                                  |
| `slabs?`        | `present/`                                     | Static `readonly SlabRow[]` — metre-frame hosts this Layer draws on; no runtime needed (data, not a closure)          |
| `ui?`           | `ui/`                                          | SettingsPanel/DebugPanel sections, a `labelsAndGuides` row, or a `detailCard` InfoCard arm — hand-written             |
| `passes`        | `passes/`                                      | One `ContentPass` factory per file                                                                                    |
| `assets?`       | `load/`                                        | The asset-row declaration, beside its slots                                                                           |
| `fades?`        | `present/`                                     |                                                                                                                       |
| `guides?`       | `present/`                                     |                                                                                                                       |
| `selection?`    | `present/`                                     |                                                                                                                       |
| `facts?`        | type in `@types/`, initial value in `layer.ts` |                                                                                                                       |
| `targets?`      | `layer.ts`                                     | Appended after core's rows; core allocates and resizes them                                                           |

Three more folders hold the Runtime's private machinery — core never sees these:

- **`load/`** — fetchers, `AssetSlot`s and the wiring that binds them.
- **`render/`** — GPU pipeline objects: renderers, vertex layouts, uniform packers.
- **`@types/`** — the Layer's **own** contract types, one per file, filename = the
  type. `<Name>Runtime.d.ts` is always here. Types shared with core or with a sibling
  Layer stay under `src/@types/` instead.

**`subsystems/` vs `render/`.** Both stay. `render/` holds GPU pipeline objects and what feeds them directly: renderers, pick renderers, stores that own GPU buffers, vertex layouts, uniform packers. `subsystems/` holds stateful per-frame machinery that decides _what_ to draw before any pipeline runs: LOD planners, sticky maps, bake state machines, their workers. A pair that spans the two keeps one name (`proceduralDiskSubsystem` / `proceduralDiskRenderer`). A Layer with no per-frame decision state has no `subsystems/` folder.

**Where declaration rows live.** A row's folder names the concern it describes, not the fact that it is a row. `load/` holds `assets` and `sourceCounts`; `present/` holds `fades`, `guides`, `selection`, `search`, `slabs`; `passes/` and `computes/` already work this way. Every formed Layer follows both rules.

## Rules

- **One symbol per file, filename = the symbol.** Deep relative imports, no barrels,
  no `index.ts`.
- **Types never live inline in implementation files.** A React component's own
  `Props` is the one exception.
- **`passes/` files export only their one named symbol** — helpers go to
  `src/utils/`, constants to `src/data/`. Ratchet:
  `tests/services/engine/frame/frameFilePurity.test.ts`.
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
- **A Layer never drives a fade at construction.** It only _declares_ fade rows;
  core owns the arrival edge (`installFadeOnArrival`). `LayerCoreDeps` has no
  `fades` member by design.
- **Tests mirror the tree** under `tests/layers/<name>/`.
- **Moving a file uses `npm run move-files`**, never `git mv` plus hand-edited
  imports — and grep afterwards, since it misses `.wesl` `package::` specifiers and
  string-literal paths.

## Status

`galaxyCatalog`, `starCatalog`, `cosmicWebFilaments`, `cosmicWebDensity`,
`flow`, `zoneOfAvoidance`, `localBubble`, `constellations`, `blackHoles`,
`milkyWay`, `lightTime` and `structure` are formed. `body` is the one
settings-only stub left from prep step (c).
