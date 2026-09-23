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
| `planners?`     | `frame.ts`                                     | Per-frame content planning; joins `CORE_PLANNERS`                                                                     |
| `settings?`     | `state/`                                       | `state/<slice>/{slice,initialState,selectors}.ts` per cluster + `state/slices.ts` tuple; `state/defaults.ts` optional |
| `sources?`      | `sources/`                                     | One `SOURCE_REGISTRY` row per file, + the rows array                                                                  |
| `sagas?`        | `sagas/`                                       | One saga per file                                                                                                     |
| `search?`       | `load/`                                        | Palette rows, an async iterable; each yield replaces the Layer's previous snapshot                                    |
| `sourceCounts?` | `load/`                                        | Per-source counts, an async iterable, on the same terms as `search?`                                                  |
| `slabs?`        | `layer.ts`                                     | Static `readonly SlabRow[]` — metre-frame hosts this Layer draws on; no runtime needed (data, not a closure)          |
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

## Unsettled

Two boundaries are not yet adjudicated. Follow the reference implementation for now
and expect both to be ruled on when the Layer structure is cleaned up:

1. **`subsystems/` vs `render/`.** `galaxyCatalog` has both, and the split is not
   obviously principled — `proceduralDiskSubsystem.ts` and
   `proceduralDiskRenderer.ts` sit in different folders. Either "stateful per-frame
   machinery" is a real category distinct from "GPU pipeline object", or one folder
   should absorb the other.
2. **Where declarations live.** `assets?` sits in `load/` while `fades?`,
   `guides?` and `selection?` sit in `present/`, though all four are the same kind
   of thing: a plain row declaring a contribution. One of the two placements is
   wrong.

## Status

`galaxyCatalog`, `starCatalog`, `filaments`, `flow`, `zoneOfAvoidance`,
`localBubble`, and `constellations` are formed. The other four folders
(`body`, `milkyWay`, `structure`, `volume`) are settings-only stubs from prep
step (c) and are filled in one Layer at a time.
