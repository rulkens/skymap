# Layer composition 05a — the `filaments` Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/filaments/` as the first sibling Layer, moving the cosmic-web skeleton's renderer, pass, asset slot, fade row and source entry out of core — and delete the core fields that held them.

**Architecture:** The Layer contract as it stands today, with no extension. `filaments` is the smallest family in the migration set: one renderer, one `ContentPass`, one `AssetWiringRow`, one `FadeLayer` row, one `SourceEntry`, no labels, no selection rows, no render targets, no facts, no compute step. Every one of those has a member on `Layer` already (`create`/`destroy`, `passes`, `assets`, `fades`, `sources`, `settings`), so this PR is a pure exercise of the contract — which is its evidential point.

**Tech Stack:** TS, WebGPU, RTK, `defineLayer`/`instantiateLayer`/`createLayers`.

**Spec:** `docs/superpowers/specs/2026-09-09-layer-composition-design.md` — §4.5 (which slot goes to which Layer), §10(e) (one Layer per PR).

**Depends on:** `2026-09-16-layer-composition-05-prep-fade-on-arrival.md` must land first. It moves the arrival-edge fade into core (`installFadeOnArrival`) and deletes `LayerCoreDeps.fades`, so this Layer's `create` wires no fade at all. Executing 05a against the pre-prep tree would reintroduce the imperative kick the user rejected.

## Global Constraints

- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`; filename = symbol.
- **Types never live inline in implementation files.** The Layer's own contract type goes in `src/layers/filaments/types/`, EXPORTED. Un-exporting to satisfy a linter is the wrong fix.
- Comments: module header ≤ 5 lines, comment lines ≤ half the code lines; say WHY, never WHAT.
- Pass files declare only their one export.
- TS moves go through `npm run move-files`, never `git mv` + hand-edited imports. It misses `.wesl` `package::` specifiers and string-literal paths — grep for the old path afterwards.
- Shaders STAY at `src/services/gpu/shaders/filaments/`. That is the precedent `galaxyCatalog` set (`proceduralDiskRenderer.ts:57-59` imports `../../../services/gpu/shaders/galaxyCatalog/...?static`), and `?static` specifiers are invisible to `tsc` — only `npm run build` catches a dangling one.
- Ratchet tests only ever shrink: `tests/conventions/layerImportBoundary.test.ts`, `tests/services/engine/frame/frameFilePurity.test.ts`.

**User rulings carried into this plan (2026-09-16):** small Layers land before `starCatalog`; `filaments` and `flow` get separate PRs; `flow` (05b) carries the `computes` contract extension; `zoneOfAvoidance` is 05c.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/layers/filaments/layer.ts` | `filamentsLayer = defineLayer({...})` — the only file that names every contribution. |
| `src/layers/filaments/types/FilamentsRuntime.ts` | The private `Runtime`: `renderer` + `slot`. Exported. |
| `src/layers/filaments/create.ts` | Mints the renderer, then the slot that commits into it. |
| `src/layers/filaments/destroy.ts` | `runtime.renderer.destroy()`. |
| `src/layers/filaments/load/filamentsAssetRows.ts` | The one `AssetWiringRow`, `factory: () => runtime.slot`. |
| `src/layers/filaments/present/filamentsFadeRows.ts` | The one `FadeLayer` row, `guard` closing over `runtime.renderer`. |
| `src/layers/filaments/settings/filamentsLayerSettings.ts` | `[filamentsSettingsFragment] as const` — the tuple `layer.ts` and `appSettingsFragments` both read. |
| `src/layers/filaments/sources/filamentsSourceRows.ts` | `[[Source.Filaments, FILAMENTS_ENTRY]] as const`. |

### Moved (via `npm run move-files`)

| From | To |
|---|---|
| `src/services/gpu/renderers/filaments/filamentRenderer.ts` | `src/layers/filaments/render/filamentRenderer.ts` |
| `src/services/gpu/renderers/filaments/buildSegmentInstances.ts` | `src/layers/filaments/render/buildSegmentInstances.ts` |
| `src/services/engine/frame/passes/filamentsPass.ts` | `src/layers/filaments/passes/filamentsPass.ts` |
| `src/services/loading/slots/filamentSlot.ts` | `src/layers/filaments/load/filamentSlot.ts` |
| `src/services/loading/fetchers/filamentFetcher.ts` | `src/layers/filaments/load/filamentFetcher.ts` |
| `src/data/sources/filaments.ts` | `src/layers/filaments/sources/filaments.ts` |

Test mirrors ride along (`move-files` drags `tests/`): `tests/services/gpu/renderers/filaments/*` → `tests/layers/filaments/render/*`.

### Modified — core shrinks

| File | Change |
|---|---|
| `src/compositions/app.ts` | `layers: [galaxyCatalogLayer, filamentsLayer] as const` + the `satisfies` tuple. |
| `src/compositions/appSettingsFragments.ts` | `filamentsSettingsFragment` leaves `UNFORMED_SETTINGS_FRAGMENTS`; `...filamentsLayerSettings` joins `APP_SETTINGS_FRAGMENTS`. |
| `src/state/settings/settingsSlice.ts:20` | Import retargets to `filamentsLayerSettings`; still one specifier under `src/layers/`, so the ratchet row stays `13`. |
| `src/services/engine/gpuHandles/gpuHandleRegistry.ts:214-218` | Delete the `filamentRenderer` row + its import. |
| `src/@types/engine/handles/EngineGpuHandles.d.ts:143` | Delete `filamentRenderer`. (Lines 150 and 188 cite it as a rationale precedent — repoint those to `constellationRenderer`.) |
| `src/@types/engine/state/EngineAssetSlots.d.ts:40` | Delete `filaments`. `installSlots` and `slotFor` are generic over the key space; no branch edits. |
| `src/services/engine/engine.ts:176,298` | Delete both `null` initialisers. |
| `src/services/engine/wiring/assetWiring.ts:15,201-207` | Delete the row + import. |
| `src/services/engine/wiring/fadeLayers.ts:130-141` | Delete the row. |
| `src/services/engine/frame/passes/index.ts:10,53` | Drop `filamentsPass` from `CONTENT_PASSES`. |
| `src/data/sources.ts` | `FILAMENTS_ENTRY` import + `UNFORMED_SOURCE_REGISTRY` entry leave; `...sourceRecordOf(FILAMENTS_SOURCE_ROWS)` joins `SOURCE_REGISTRY`. |
| `tests/services/engine/frame/frameFilePurity.test.ts` | Remove the `filamentsPass` row (ratchet shrinks). |

`FILAMENTS_ENTRY`'s shape, `FilamentCloud`, `FilamentReq` and `FilamentRenderer` stay in `src/@types/` — the galaxy Layer left its renderer types there too (`@types/rendering/GalaxyPointRenderer.d.ts`), and `FilamentCloud` is a wire format `tools/filaments/buildFilaments.ts` also writes.

`FRAME_ORDER`'s `'filaments'` name (`frameOrder.ts:102`) does **not** move. Core orders; the Layer supplies the pass that answers to the name.

---

## Task 1: Relocate the filaments modules

**Files:** the six moves in the table above, plus their test mirrors.

- [ ] Write a manifest and run `npm run move-files -- --manifest <moves.json> --dry` first, then for real. Do **not** `git mv`.
- [ ] Grep for each old path afterwards — `move-files` misses string-literal paths and `.wesl` `package::` specifiers. The `?static` shader imports in `filamentRenderer.ts` are relative and get rewritten; verify by eye that they still resolve to `src/services/gpu/shaders/filaments/`.
- [ ] `npm run typecheck` clean, `npm test` green. No new test: a move that compiles and keeps the suite green cannot fail on a bug the compiler misses.
- [ ] Commit. Behaviour is unchanged at this point — the renderer is still constructed by `gpuHandleRegistry`, the pass still sits in `CONTENT_PASSES`.

## Task 2: Mint the Runtime, `create` and `destroy`

**Files:** create `src/layers/filaments/types/FilamentsRuntime.ts`, `create.ts`, `destroy.ts`.

**review: yes** — construction order is a lifecycle invariant, and the slot's commit is where a fade kick would wrongly reappear.

**Contract:**

```ts
// types/FilamentsRuntime.ts
export type FilamentsRuntime = {
  readonly renderer: FilamentRenderer;
  readonly slot: AssetSlot<FilamentCloud, FilamentReq>;
};

// create.ts
export function create(deps: LayerCoreDeps): FilamentsRuntime;
// destroy.ts
export function destroy(runtime: FilamentsRuntime): void;
```

`LayerCoreDeps` with no type argument: this Layer publishes no facts, so `deps.publish` must not exist. Adding a `facts` field to get one is out of scope.

- [ ] `create` builds the renderer with `deps.ctx.device`, `HDR_TARGET_FORMAT` and `deps.fadeBgl` — the same three arguments `gpuHandleRegistry.ts:215-218` passes today.
- [ ] `create` then mints the slot by calling the moved `createFilamentSlot`, rewired: it must close over `runtime.renderer` instead of reading `state.gpu.filamentRenderer`, which means the null check at its head disappears (the renderer exists by construction). Keep the `ready` console line.
- [ ] The slot's `syncVisibilityFades(state, { animate: true, only: ['filaments'] })` call is already gone — the prep PR deleted it and made the arrival fade core's edge (`installFadeOnArrival`). Wire **no** fade drive here. `create` must not reach for a fade registry; `LayerCoreDeps` no longer carries one. What opens the row's `hasCloud()` guard is the `upload(cloud)` this commit already does.
- [ ] `destroy` releases the renderer. WebGPU frees nothing on GC.
- [ ] No new test. The construction is a straight-line wiring change the typechecker covers, and the arrival fade is the prep PR's tested behaviour.
- [ ] Commit.

## Task 3: Runtime-bound contributions — pass, assets, fades

**Files:** modify `src/layers/filaments/passes/filamentsPass.ts`; create `load/filamentsAssetRows.ts`, `present/filamentsFadeRows.ts`.

**review: yes** — the fade row's `guard` and the pass's either-or `enabled` are the demand-loaded asymmetry, and getting them wrong shows up only as a visual pop.

**Contract:**

```ts
export function filamentsPass(runtime: FilamentsRuntime): ContentPass;
export function filamentsAssetRows(runtime: FilamentsRuntime): readonly AssetWiringRow[];
export function filamentsFadeRows(runtime: FilamentsRuntime): readonly FadeLayer<unknown>[];
```

- [ ] `filamentsPass` becomes a factory over the runtime. Its `name` stays `'filaments'` (the `FRAME_ORDER` name resolves through it) and its `enabled` keeps the either-or shape at `filamentsPass.ts:24-31` verbatim — the setting is intent, the opacity is visual state, so a fade-out keeps drawing after the toggle flips off. `draw` loses its `state.gpu.filamentRenderer === null` early return and reads `runtime.renderer`. The four tuning constants stay in the file; they are this pass's own.
- [ ] `filamentsAssetRows` returns the single row with `key: 'filaments'`, `factory: () => runtime.slot`, and `req`/`demand`/`priority` copied exactly from `assetWiring.ts:202-206` (`{ small: tier === 'small' }`, `ctx.settings.filaments.enabled`, `80`). A Layer row's `factory` hands back the slot `create` already minted; it never builds one.
- [ ] `filamentsFadeRows` returns the single `fadeLayerRow` with `key`, `handle`, `seed` and `intent` copied from `fadeLayers.ts:130-140`, and `guard` rewritten to `runtime.renderer.hasCloud()` — dropping the `?? false` optional chain, since the renderer is non-null in a Runtime. Carry the existing guard comment across: unguarded, a tour reveal whose download is in flight starts the fade over an empty renderer and the commit's re-sync stomps the authored ramp.
- [ ] No new test. Each of the three is a relocation of an existing literal; the behaviours they encode are Task 4's DoD lines.
- [ ] Commit.

## Task 4: Form the Layer and compose it

**Files:** create `layer.ts`, `settings/filamentsLayerSettings.ts`, `sources/filamentsSourceRows.ts`; modify `app.ts`, `appSettingsFragments.ts`, `settingsSlice.ts`, `sources.ts`.

**review: yes** — Redux settings composition; `Ruling 15`'s reducer-key uniqueness assert throws at import, not at boot.

**Contract:**

```ts
export const filamentsLayer = defineLayer({
  name: 'filaments',
  settings: filamentsLayerSettings,
  sources: FILAMENTS_SOURCE_ROWS,
  create, destroy,
  passes: (runtime) => [filamentsPass(runtime)],
  assets: filamentsAssetRows,
  fades: filamentsFadeRows,
});
```

No `facts`, no `sagas`, no `labels`, no `selection`, no `targets`, no `frame`, no `ui`. The Cosmic Web settings section is shared with `volumes` (`CosmicWebSection.tsx` derives its Style picker from both masters), so it is **not** this Layer's `ui` — that waits for `volume`.

- [ ] `filamentsLayerSettings` exports `[filamentsSettingsFragment] as const`. It exists so `appSettingsFragments` folds the tuple in from the Layer's own settings module rather than off `APP_COMPOSITION` — reading it there makes the settings root type depend on the Layer's, which depends via `ContentPass` → `PassState` on that same root: a circular alias `tsc` refuses and tsgo does not see (`galaxyCatalogLayerSettings.ts`'s header).
- [ ] `filamentsSettingsFragment` must leave `UNFORMED_SETTINGS_FRAGMENTS` in the same edit that adds the tuple. A fragment in both lists throws at import on the reducer-key uniqueness assert.
- [ ] `FILAMENTS_SOURCE_ROWS` exports `[[Source.Filaments, FILAMENTS_ENTRY]] as const`; `sources.ts` drops the `UNFORMED_SOURCE_REGISTRY` entry and spreads `sourceRecordOf(FILAMENTS_SOURCE_ROWS)` beside the galaxy rows.
- [ ] `app.ts` adds `filamentsLayer` to `layers` and to the `satisfies EngineComposition<readonly [...]>` tuple.
- [ ] No new test. `createLayers` already throws at boot on a duplicate pass name or a contested asset key, and the settings assert throws at import — three failure modes with live guards, none needing a unit test.
- [ ] Commit.

## Task 5: Delete what core no longer holds

**Files:** `gpuHandleRegistry.ts`, `EngineGpuHandles.d.ts`, `EngineAssetSlots.d.ts`, `engine.ts`, `assetWiring.ts`, `fadeLayers.ts`, `frame/passes/index.ts`, `tests/services/engine/frame/frameFilePurity.test.ts`.

**review: yes** — `EngineState` field deletions, and the pass-list edit is the one place a stale core row would keep drawing silently.

- [ ] Delete, in one commit, every row in the "Modified — core shrinks" table's deletion half. Deleting `filamentsPass` from `CONTENT_PASSES` is load-bearing, not tidying: `expandFrameOrder` resolves a `FRAME_ORDER` name by the **first** pass that answers to it, so a core pass left behind under `'filaments'` would keep drawing with the Layer's version never reached. `createLayers`' duplicate-name assert (`createLayers.ts:120-131`) catches it at boot if missed.
- [ ] `EngineAssetSlots.filaments` has no readers outside its own slot file's comment (verified by grep) — delete the field outright rather than leaving it `null`.
- [ ] `EngineGpuHandles.d.ts` cites `filamentRenderer` at lines 150 and 188 as the rationale precedent for two other nullable handles. Repoint both to `constellationRenderer`, which keeps the same shape and stays in core.
- [ ] Shrink the `frameFilePurity` ratchet by the `filamentsPass` row. Ratchets only ever shrink.
- [ ] Run `npm run build` (not just `typecheck`) — `?static` WESL specifiers are invisible to `tsc`, and Task 1 moved the file that holds them.
- [ ] Commit.

---

## Out of scope (deferred)

- **`flow`** — 05b. It owns a compute pre-pass (`encodeFlowCompute`, dispatched through the `COMPUTE` table at `executeFrame.ts:111-127`) and the `Layer` contract has no member for one. That PR adds `computes?(runtime)` and builds `COMPUTE` from the composition the way `passes` already is.
- **`zoneOfAvoidance`** — 05c. First Layer to own a render target (`zoa`, `renderTargets.ts:214`) plus an upsample row; `Layer.targets` already exists to carry it.
- **The `galaxiesOnly` reference engine**, deferred out of 04d. It becomes expressible once a second Layer exists, but forming it is not this PR.
- **A `ui` contribution.** `CosmicWebSection` is shared with `volumes`; it moves when `volume` does.
- **`FilamentCloud`/`FilamentReq`/`FilamentRenderer` type relocation.** They stay in `src/@types/`, matching what the galaxy Layer left behind.

---

## Definition of Done

**Deliverable inventory**

- [ ] `src/layers/filaments/` holds `layer.ts`, `create.ts`, `destroy.ts`, `types/FilamentsRuntime.ts`, `render/`, `passes/`, `load/`, `present/`, `settings/`, `sources/`.
- [ ] `APP_COMPOSITION.layers` is `[galaxyCatalogLayer, filamentsLayer]`.
- [ ] `EngineGpuHandles` no longer declares `filamentRenderer`; `EngineAssetSlots` no longer declares `filaments`.
- [ ] `CONTENT_PASSES`, `ASSET_WIRING` and `FADE_LAYERS` each hold one row fewer.
- [ ] `src/services/gpu/renderers/filaments/`, `src/services/loading/slots/filamentSlot.ts`, `src/services/loading/fetchers/filamentFetcher.ts` and `src/data/sources/filaments.ts` no longer exist.
- [ ] `npm run build` passes (the WESL gate `typecheck` cannot give).

**Named observable behaviours** (manual smoke pass, filaments requires `public/data/filaments.bin`)

- [ ] Cosmic Web → Style → **Filaments** draws the skeleton, fading in rather than popping.
- [ ] Toggling filaments **off** fades out over the authored ramp and keeps drawing until opacity reaches 0, rather than cutting on the frame the toggle flips.
- [ ] Toggling filaments on for the **first time in a session** (download in flight) does not pop in part-way through the ramp — the guard holds the fade until the cloud is uploaded.
- [ ] The **intensity** slider in Advanced still scales the overlay.
- [ ] Style → **Both** shows filaments and the volume field together; → **Smooth** leaves only the volume field.
- [ ] A tour step that reveals filaments still reveals them (the fade handle `{ kind: 'filament' }` is unchanged, so `VisibilityLayerKey` and the tour's visibility actions see what they saw before).

**Deferral boundary** — everything under "Out of scope" above. A reviewer finding `flow` still wired through `state.gpu.flowFieldRenderer`, or `CosmicWebSection` still hand-rendered by `SettingsPanel`, is looking at 05b/05c, not at a gap here.
