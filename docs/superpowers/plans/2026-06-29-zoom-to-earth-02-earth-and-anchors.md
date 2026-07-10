# Zoom to Earth — Plan 02: Earth & anchors

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` (§5 data model, §6 renderers, §10 Phases 2–3).
**Cross-plan contract (LOCKED source of truth):** `docs/superpowers/specs/` companion contract — every symbol name / path / signature below is verbatim from it, **except where the contract names symbols the renderer-unification fold deleted** (`encodeForegroundPass`, `foregroundOffscreen`, `foregroundComposite`, the `ReadyFrameContext` foreground fields) — for those, THIS re-grounded text supersedes the contract. Do NOT rename or re-shape anything else; if current code makes a contract symbol impossible, the task says **STOP and report**.
**Plan style (OVERRIDES upstream `writing-plans`):** `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code NO.** Cite `path:line`; test names + assertions ARE the acceptance criteria.

> Re-grounded 2026-07-10 onto the unified layer/slab/program renderer (renderer-unification 04 fold, PR #386 merged as `504b15dc`); supersedes the pre-fold wiring this plan originally consumed.

## Goal

Land the visible payoff of the zoom-to-Earth slice on top of Plan 01's precision seams: a **textured round Earth** at true relative scale, plus a small set of correctly-scaled **anchors** (the Sun, a curated **local star map** of the real ~10 pc stellar neighbourhood, the Moon, Jupiter) that ground the descent in its actual surroundings.

Two independently-shippable halves, in order:

- **Phase 2 (Earth) FIRST** — the `earth` data type + seed + `earthRenderer` (Blue Marble) + an `earthLayer` content-layer row. Ships a textured Earth on its own.
- **Phase 3 (Anchors) SECOND** — the `star` / `planet` data types + seed (the Sun + a local star map, plus Moon + Jupiter) + `starRenderer` / `planetRenderer` / `starPointRenderer` on the shared sphere infra, each drawn by its own content-layer row.

## Consumes from main (Plan 01 as folded by renderer-unification 04)

Plan 01 shipped **folded onto the unified layer/slab/program renderer** (see `docs/superpowers/plans/completed/2026-07-06-renderer-unification-04-fold-zoom-to-earth.md`). Plan 02 CONSUMES the landed seams under these names — do not redefine:

- `src/data/scaleUnits.ts` → `SCALE_UNITS` (`KM_TO_MPC`, `AU_TO_MPC`, `PC_TO_MPC`, …).
- `src/data/renderOrigin.ts` → `RENDER_ORIGIN_MPC: Readonly<Vec3>` — imported directly by whoever needs it (a constant, NOT per-frame ctx state; `ReadyFrameContext` has no `renderOrigin` field).
- `src/utils/camera/composeBodyMvp.ts` → `composeBodyMvp(foregroundVp: Float64Array, bodyPosMpc, renderOrigin, radiusMpc): Float32Array` (`composeBodyMvp.ts:57-62`). The first argument is the slab's **f64** view-projection — layers pass `view.slab.vp`, never the f32-narrowed `view.vp` (the compose-before-narrow seam; see `debugSpheresLayer.ts:13-25`).
- `src/utils/math/uvSphereMesh.ts` → `uvSphereMesh(segments, rings): UvSphereMesh` (unit-radius positions, equirectangular uvs, CCW-outward indices).
- `src/services/gpu/shaders/lib/sphere.wesl` → shared `SphereUniforms { mvp: mat4x4<f32> }` + `clip_from_local(localPos)` helper.
- **The content-layer registry**: `CONTENT_LAYERS` in `src/services/engine/frame/passes/index.ts` (flat ordered array; one file per layer under `passes/<name>Layer.ts`) + the `ContentLayer` type (`src/@types/engine/frame/ContentLayer.d.ts`: `{ name, slab, target, blend, enabled(state, ctx), draw(pass, view: SlabView, ctx, state), drawPick? }`). **The registry IS the dispatch table** — Plan 02 adds body layers as rows, not as branches.
- **Slabs**: `NEAR0` (index 0, origin-relative f64) / `COSMO` (index 1) + `deriveSlabs`/`slabViewOf` in `src/services/engine/frame/slabs.ts`; `SlabView` (`src/@types/engine/frame/SlabView.d.ts`) carries `{slab, vp: Float32Array, camPos, viewportPx}` — f64 consumers read `view.slab.vp`.
- **The frame program + executor**: `frameProgram(tone)` (`src/services/engine/frame/frameProgram.ts:52-71`) already carries the near-field tail — render `foreground:0` @ NEAR0 → composite `foreground:0→swap` `'over'` (same `tone` object as the hdr composite) → render `swap` @ NEAR0. `executeFrame` (`src/services/engine/frame/executeFrame.ts`) skips a pass AND its composite when no layer in the group is enabled (touched-set rule), auto-attaches depth from the target row, and derives the timing slots — a new layer needs **zero executor edits**.
- **The `foreground:0` render target row**: `{ id: 'foreground:0', format: 'rgba16float', depth: 'depth32float', scale: 1 }` in `src/services/gpu/renderTargets.ts:119` (clear values at `renderTargets.ts:101-106`). There is NO `foregroundOffscreen` module — the target table owns the lifecycle.
- **Captions already ship**: `foregroundLabelsLayer` (`src/services/engine/frame/passes/foregroundLabelsLayer.ts` — `'foreground-labels'`, NEAR0, swap, over) draws `state.gpu.foregroundLabelRenderer` (a second MSDF `LabelRenderer`, constructed in `initGpu.ts:407-408` with `setLabels(debugSphereLabels())`), gated below `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC = 1e-3` (`foregroundLabelsLayer.ts:41`). Plan 02 repoints its label SOURCE (Task 12); the layer + renderer stay.
- **Exemplar layer**: `src/services/engine/frame/passes/debugSpheresLayer.ts` (`'debug-spheres'`, NEAR0, `foreground:0`, opaque) — maps `DEBUG_SPHERE_BODIES` (`src/data/bodies/debugSphereBody.ts`) via `composeBodyMvp(view.slab.vp, …)` and calls `state.gpu.debugSphereRenderer.draw`. Its test (`tests/services/engine/frame/passes/debugSpheresLayer.test.ts`) mocks `composeBodyMvp` and identity-asserts it consumed `view.slab.vp` — the model for every body-layer test below. Registry/migration/blend-legality tests: `tests/services/engine/frame/passes/passes.test.ts` (`foreground:0` layers must be `'opaque'`, hdr layers `'additive'`, swap layers `'over'` — `passes.test.ts:331-355`).
- `src/services/gpu/renderers/debugSphereRenderer.ts` → `createDebugSphereRenderer(device, targetFormat, depthFormat)` (`debugSphereRenderer.ts:74-78`) — the POSITIONAL factory idiom Plan 02's new renderers mirror. Retirement of the whole debug-sphere constellation is Task 12.

**Deleted by the fold — must NOT appear as consumed seams:** `encodeForegroundPass.ts`, `encodeForegroundOver`, `foregroundLabelsPass`, `foregroundOffscreen.ts`, `foregroundComposite`, `toneMapDefaults`, and the `ReadyFrameContext` foreground fields (`foregroundVp`/`foregroundNear`/`foregroundFar`/`renderOrigin` — the ctx now carries `slabs: readonly Slab[]` instead). Where the locked contract names any of these, this re-grounded text supersedes it.

## Tech stack

TS + Vite + React shell, raw WebGPU + WESL (linked via `?static`). wgpu-matrix (`mat4`/`mat4d`). Vitest. No new runtime deps. The Blue Marble texture is a new committed asset under `public/`.

## Global constraints (house rules — these override defaults)

- **Append-only `Source` codes.** Codes are persisted/packed; the DESI patches took 18/19/20 after this plan was first written, so append `Star: 21`, `Planet: 22`, `Earth: 23` AFTER `DesiSgw = 20`. NEVER renumber. See the `source.ts:3-16` docblock.
- **One symbol per file** in `src/@types/` (one `type` per `.d.ts`) and `src/utils/` (filename = exported function). Deep relative imports, no barrels.
- **`type` aliases, never `interface`.**
- **`Vec3` / `Vec2` aliases**, never raw `[number, number, number]` tuples (`src/@types/math/Vec3.d.ts`, `Vec2.d.ts`).
- **The `CONTENT_LAYERS` registry IS the table dispatch.** Each body type gets its own content-layer row + file (`earthLayer`, `starSpheresLayer`, `planetsLayer`, `starPointsLayer`) — no `if (type === …)` chains, no bespoke dispatch-table module (spec §5, §6; memory `feedback_tagged_union_table_dispatch`, satisfied by the registry rows themselves).
- **Seed real data early** — `sceneBodies.ts` is authored right after the body types, and `createBodyStore` seeds from it at construction (`feedback_seed_data_early`).
- **Renderer conventions** (`docs/superpowers/conventions/renderers.md`): factory + `satisfies Renderer` (`label` + `destroy`), GPU resources in the closure, per-frame inputs through `draw()`, nullable `EngineGpuHandles` slot, constructed in `initGpu.ts`. Factory signatures follow the **landed positional idiom** — `(device, targetFormat, depthFormat)`, mirroring `createDebugSphereRenderer` (`debugSphereRenderer.ts:74-78`) — see contract-conflict #7.
- **WESL conventions** (`wesl-shaders` skill): no backticks in comments, literal `package::` prefix, `?static` TS import (see `pointRenderer.ts:43-46`).
- **Didactic timeless comments** — explain why; no dates / PR refs / "pre-X" history.
- **Suite stays green** at every task; the **final task gates on `npm run typecheck` (both tsconfigs) + `npm test`**.
- **VISUAL gates are user-verified** on the dev server, NOT automated — **with `?deepZoom` in the URL**: the wheel-zoom floor is gated (`clampDistance.ts:50-52` — default 0.05 Mpc, `?deepZoom` 1e-17 Mpc), so without the gate the bodies stay sub-pixel and unreachable. Confirm a textured ROUND Earth resolving cleanly with no jitter/swim, and anchors at BELIEVABLE relative sizes. The final task flags exactly what to confirm on screen.

## Contract conflicts found (reconcile inline; do not silently diverge)

1. **`code` field.** The contract sketch shows `StarSourceEntry = SourceEntryBase & { readonly type: 'star' }`, but `SourceEntryBase` (`src/@types/data/SourceEntryBase.d.ts:9-68`) does NOT carry `code` — every existing variant adds its own (`src/@types/data/structure/StructureSourceEntry.d.ts:13`, `src/@types/data/flow/FlowSourceEntry.d.ts:17`). Plan 02 therefore adds `readonly code: number` to each of the three new entry types, matching the existing variants. (Tasks 4, 10.)
2. **`EngineGpuHandles` path.** The contract cites `src/@types/engine/handles/EngineGpuHandles.d.ts`; that is the real path (the spec §11 shorthand `src/@types/engine/EngineGpuHandles.d.ts` is wrong). Use the `handles/` path. (Tasks 7, 12 add the renderer slots; the fold already owns `debugSphereRenderer` at `EngineGpuHandles.d.ts:327` and `foregroundLabelRenderer` at `:177`.)
3. **`src/@types/scene/` does not exist yet.** The body record types (`StarBody` / `PlanetBody` / `EarthBody`) create that directory (Tasks 1, 8).
4. **`EngineData` shape.** `EngineData.d.ts:20-23` currently has only `galaxies` + `structures`; its docblock says volumes/flow/filaments have no store. Plan 02 ADDS `readonly bodies: BodyStore` and updates the docblock rationale (bodies ARE app-side seed data the slot can't supply). (Task 5.)
5. **Next free Source codes: 21 / 22 / 23.** The plan's original 18/19/20 were taken by the DESI patches (`DesiDeep: 18`, `DesiWedge: 19`, `DesiSgw: 20` — `source.ts:109-136`). Star=21, Planet=22, Earth=23; all fit the 5-bit pick budget (0–30, 31 sentinel). (Tasks 4, 10.)
6. **Source-entry `.d.ts` files live in per-kind subfolders.** The contract's flat `src/@types/data/EarthSourceEntry.d.ts` paths predate the registry's layout — every variant now lives under `src/@types/data/<kind>/` (`structure/`, `flow/`, `milkyWay/`, …; see the imports in `SourceEntry.d.ts:1-6`). The three new entry types follow suit under `src/@types/data/body/`. A path adjustment only; type names unchanged. (Tasks 4, 10.)
7. **Renderer factory shape.** The contract's named-bag `createEarthRenderer(init: { device; colorFormat; depthFormat })` predates the fold; the landed foreground idiom is POSITIONAL — `createDebugSphereRenderer(device, targetFormat, depthFormat)` (`debugSphereRenderer.ts:74-78`, constructed at `initGpu.ts:400`). Plan 02's sphere-renderer factories mirror it: `(device: GPUDevice, targetFormat: GPUTextureFormat, depthFormat: GPUTextureFormat)`. (Tasks 6, 11.)
8. **The contract's `encodeForegroundPass` extension point is gone.** The fold dissolved it into the registry + program (see the Consumes section). Everywhere the contract says "extend `encodeForegroundPass`'s dispatch table", read "add a content-layer row". (Tasks 7, 12.)

---

# Phase 2 — Earth

## Task 1 — `EarthBody` scene record type

**Files:** `src/@types/scene/EarthBody.d.ts` (new), `tests/@types/scene/EarthBody.test.ts` (new — a type-shape compile test).

**Interfaces:**

- Produces:
  ```ts
  export type EarthBody = {
    readonly id: string;
    readonly label: string;
    readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
    readonly radiusKm: number; // 6371
    readonly textureUrl: string; // Blue Marble equirectangular
  };
  ```
- Consumes: `Vec3` from `src/@types/math/Vec3` (deep relative import).

- [x] Add `EarthBody.d.ts` with a didactic docblock: a seeded Earth record; `positionMpc` is canonical Mpc (authored via `SCALE_UNITS`), `radiusKm` resolved to a sphere by `composeBodyMvp`.
- [x] Add a minimal type-level test asserting an object literal of the shape assigns to `EarthBody` and that `positionMpc` is a `Vec3` (mirror an existing `@types` shape test if one exists; else a trivial `const x: EarthBody = {…}; expect(x.radiusKm).toBe(6371)`).
- [x] `npm test -- EarthBody` → green. Commit.

## Task 2 — `sceneBodies.ts` seed (Earth only, this phase)

**Files:** `src/data/bodies/sceneBodies.ts` (new — Earth export now; stars/planets added in Phase 3), `tests/data/bodies/sceneBodies.test.ts` (new).

**Interfaces:**

- Produces: `export const SCENE_EARTH: EarthBody`.
- Consumes: `EarthBody` (Task 1); `SCALE_UNITS` (`scaleUnits.ts`, Plan 01).

**Seed values (from contract + spec §5):** Earth `radiusKm: 6371`; `positionMpc` = `[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]` (1 AU from the Sun, authored in human units, stored Mpc); `textureUrl: '/images/earth/blue-marble-4k.jpg'`; `id: 'earth'`, `label: 'Earth'`. (These match the interim `DEBUG_SPHERE_BODIES` stand-ins — `debugSphereBody.ts:41-52` — whose own header says a real BodyStore retires them; that retirement is Task 12.)

- [x] Add `sceneBodies.ts` exporting `SCENE_EARTH`. Author the position via `SCALE_UNITS.AU_TO_MPC` (do NOT inline a magic Mpc number — the conversion is the contract).
- [x] Test `SCENE_EARTH radius is 6371 km`.
- [x] Test `SCENE_EARTH is one AU from the Sun in Mpc` — assert `SCENE_EARTH.positionMpc[0]` ≈ `SCALE_UNITS.AU_TO_MPC` (tight tolerance) and the other two components are 0.
- [x] Test `SCENE_EARTH textureUrl points at the Blue Marble asset` — `=== '/images/earth/blue-marble-4k.jpg'`.
- [x] `npm test -- sceneBodies` → green. Commit.

## Task 3 — `createBodyStore` (Earth-only surface for now)

**Files:** `src/services/engine/data/createBodyStore.ts` (new), `src/@types/engine/data/BodyStore.d.ts` (new), `tests/services/engine/data/createBodyStore.test.ts` (new).

**Interfaces:**

- Produces (`BodyStore.d.ts`, contract verbatim — full surface defined now, stars/planets seeded in Phase 3):
  ```ts
  export type BodyStore = {
    readonly stars: readonly StarBody[];
    readonly planets: readonly PlanetBody[];
    readonly earth: EarthBody | null;
    setStars(s: readonly StarBody[]): void;
    setPlanets(p: readonly PlanetBody[]): void;
    setEarth(e: EarthBody | null): void;
  };
  export function createBodyStore(): BodyStore;
  ```
- Consumes: `StarBody` / `PlanetBody` / `EarthBody`. **NOTE:** `StarBody` / `PlanetBody` land in Phase 3 (Task 8). To keep Phase 2 shippable, this task may import them ahead of their seed — define the FULL `BodyStore` type now (the closure stores empty arrays for stars/planets until Phase 3 seeds them). If forward-importing the not-yet-created `StarBody`/`PlanetBody` types is awkward, create those two `.d.ts` stubs as part of this task and seed them in Task 9 — **STOP and report** if the type files can't be created cleanly ahead of their seed.

**Pattern:** closure over private mutable state + `Object.freeze` of read-only getters + setters — mirror `createGalaxyStore.ts:20-44` and `createStructureStore.ts:25-45`.

- [x] Add `BodyStore.d.ts` (one type per file) + `createBodyStore.ts`.
- [x] Test `createBodyStore starts with empty stars/planets and null earth`.
- [x] Test `setEarth then earth getter returns the record` (round-trip).
- [x] Test `setStars / setPlanets round-trip` (set an array, read the getter back, identity preserved).
- [x] Test `setEarth(null) clears the earth`.
- [x] `npm test -- createBodyStore` → green. Commit.

## Task 4 — `earth` source type + entry + registry append

**Files:** `src/@types/data/body/EarthSourceEntry.d.ts` (new — per-kind subfolder, contract-conflict #6), `src/@types/data/SourceEntry.d.ts` (modify — extend union), `src/data/source.ts` (modify — append `Earth: 23`), `src/data/sources/earth.ts` (new), `src/data/sources.ts` (modify — import + register `EARTH_ENTRY`), `tests/data/sources.test.ts` (modify).

**Interfaces:**

- Produces:
  ```ts
  // body/EarthSourceEntry.d.ts
  export type EarthSourceEntry = SourceEntryBase & {
    readonly type: 'earth';
    readonly code: number; // see contract-conflict #1
  };
  ```
  `EARTH_ENTRY` `as const satisfies EarthSourceEntry` (mirror `flow.ts:5-28` / `cluster.ts:4-17` shape: `type`, `code: Source.Earth`, `id: 'earth'`, `label: 'Earth'`, `allSky`, `visible`, `bearsLabel`, `bearsMarker`). Bodies are NOT pickable and carry no COSMO label/marker → `bearsLabel: false`, `bearsMarker: false` — those flags drive the COSMO label/marker systems, which the body captions bypass (Sun/Earth captions already ship through `foregroundLabelsLayer`; see Task 12).
- Consumes: `SourceEntryBase` (`SourceEntryBase.d.ts:9`), `Source` (`source.ts`).

- [x] Append `Earth: 23` to the `Source` const with a didactic comment (registry-key-only code, appended after `DesiSgw = 20`, leaving 21/22 for the Phase-3 `Star`/`Planet`; never renumber the codes below).
- [x] Add `body/EarthSourceEntry.d.ts`; union it into `SourceEntry.d.ts:14-20`.
- [x] Add `sources/earth.ts` → `EARTH_ENTRY`; import + add `[Source.Earth]: EARTH_ENTRY` to `SOURCE_REGISTRY` (`sources.ts:95-117`).
- [x] Test (`sources.test.ts`, mirror the `overlay codes (milkyWay/flow)` describe block at `sources.test.ts:175-240`): `appends Earth=23 to the enum` → `expect(Source.Earth).toBe(23)`.
- [x] Test `earth row is a non-label, non-marker body source` — `entry.type === 'earth'`, `entry.id === 'earth'`, `bearsLabel === false`, `bearsMarker === false`.
- [x] Test `keeps Earth OUT of GALAXY_CATALOG_SOURCES` and `keeps the Earth bit clear of ALL_VISIBLE_MASK` (mirror `sources.test.ts:183-193`; note `ALL_VISIBLE_MASK` derives from `type: 'galaxyCatalog'` rows only, so the exact-mask assertion at `sources.test.ts:103` stays untouched).
- [x] Test `every entry carries a unique id` already covers `'earth'` — confirm it still passes (`sources.test.ts:55-67`).
- [x] `npm test -- sources` → green. Commit. _(Also gained `case Source.Earth:` in `galaxyType.ts`'s exhaustive non-galaxy switch — appending a Source code extends that switch by construction.)_

## Task 5 — Wire `BodyStore` into `EngineData`, seed Earth at construction

**Files:** `src/@types/engine/data/EngineData.d.ts` (modify), `src/services/engine/data/createEngineData.ts` (modify), `tests/services/engine/data/createEngineData.test.ts` (new or modify).

**Interfaces:**

- Produces: `EngineData` gains `readonly bodies: BodyStore`; `createEngineData()` constructs `createBodyStore()` and seeds `setEarth(SCENE_EARTH)` at construction (bodies seed from the static `sceneBodies.ts`, the seed-data-early convention).
- Consumes: `createBodyStore` (Task 3), `SCENE_EARTH` (Task 2).

- [x] Add `bodies: BodyStore` to `EngineData.d.ts:20-23`; update its docblock to record that bodies ARE app-side seed data (extends the "two stores" rationale at `EngineData.d.ts:5-18` — see contract-conflict #4).
- [x] In `createEngineData.ts:16-21`, construct `createBodyStore()`, call `setEarth(SCENE_EARTH)` before returning, add `bodies` to the returned bag; update the module docblock's "only galaxies and structures" sentence.
- [x] Test `createEngineData seeds the Earth body at construction` — `data.bodies.earth?.id === 'earth'`.
- [x] Test `createEngineData still exposes galaxies + structures stores` (regression).
- [x] `npm test -- createEngineData` → green. Commit.

## Task 6 — `EarthRenderer` type + `earthRenderer` factory + earth shaders

**Files:** `src/@types/rendering/EarthRenderer.d.ts` (new), `src/services/gpu/renderers/earthRenderer.ts` (new), `src/services/gpu/shaders/earth/vertex.wesl` (new), `src/services/gpu/shaders/earth/fragment.wesl` (new), `tests/services/gpu/renderers/earthRenderer.test.ts` (new — construction + structural asserts only; see VISUAL note).

**Interfaces:**

- Produces (`EarthRenderer.d.ts` methods verbatim from the contract; the factory follows the landed positional idiom — contract-conflict #7):
  ```ts
  export type EarthRenderer = Renderer & {
    setTexture(bitmap: ImageBitmap): void; // copyExternalImageToTexture
    draw(pass: GPURenderPassEncoder, mvp: Float32Array): void;
  };
  export function createEarthRenderer(
    device: GPUDevice,
    targetFormat: GPUTextureFormat, // 'rgba16float' — must match the foreground:0 row's format
    depthFormat: GPUTextureFormat, // 'depth32float' — must match the foreground:0 row's depth
  ): EarthRenderer;
  ```
- Consumes: `Renderer` (`@types/rendering/Renderer.d.ts:33-38`), `uvSphereMesh` + `lib/sphere.wesl` (Plan 01), the `?static` WESL import idiom (`pointRenderer.ts:43-46`), `copyExternalImageToTexture` (pattern at `src/services/gpu/resources/textureAtlas.ts:120-137`), the debug-sphere pipeline as the depth/cull/opaque template (`debugSphereRenderer.ts:153-202` — depth write + `'less'`, CCW front face, back-face cull, no blend descriptor = opaque).

**Shape:** positional factory mirroring `createDebugSphereRenderer` (`debugSphereRenderer.ts:74-78`); uploads `uvSphereMesh(…)` VBO/IBO once; owns the texture + sampler + bind group in the closure; `setTexture(bitmap)` does `device.queue.copyExternalImageToTexture(...)` into the equirectangular 2D texture; `draw(pass, mvp)` writes the f32 `mvp` to the `SphereUniforms` buffer and draws indexed. `satisfies Renderer` at the return. Earth fragment shader samples the equirectangular texture at the mesh uvs; vertex shader imports `package::lib::sphere` `clip_from_local`.

- [x] Add `EarthRenderer.d.ts`.
- [x] Add `earth/vertex.wesl` + `earth/fragment.wesl` (texture sample; share `lib/sphere`). Follow WESL conventions (no backticks, literal `package::`, `?static` on the TS side). Use the `wesl-shaders` skill.
- [x] Add `earthRenderer.ts` factory with `satisfies Renderer`.
- [x] Test `createEarthRenderer satisfies Renderer` — has a non-empty `label`, a `destroy` function (construct against a mocked/headless `GPUDevice` the way existing renderer tests mock it — read an existing renderer test for the device-stub style first; if no renderer is unit-tested headlessly in this repo, assert only the module exports + type-shape and rely on the VISUAL gate).
- [x] Test `setTexture and draw are callable` (structural: methods exist with the right arity).
- [x] **VISUAL gate (deferred to Task 13):** a round, correctly-textured Earth is user-verified on screen — NOT asserted here.
- [x] `npm test -- earthRenderer` → green (or typecheck-only if headless GPU construction is infeasible — note which). Commit.

## Task 7 — Blue Marble asset + `earthRenderer` handle + `earthLayer` content row

**Files:** `public/images/earth/blue-marble-4k.jpg` (new committed asset), `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify — add the slot), `src/services/engine/engine.ts` (modify — null seed + destroy row), `src/services/engine/phases/initGpu.ts` (modify — construct + fire the texture fetch), `src/services/engine/frame/passes/earthLayer.ts` (new), `src/services/engine/frame/passes/index.ts` (modify — register), `tests/services/engine/frame/passes/earthLayer.test.ts` (new), `tests/services/engine/frame/passes/passes.test.ts` (modify — migration row), `tests/@types/engineState.test.ts` + `tests/services/engine/phases/initGpu.destroyReachability.test.ts` (modify — handle wiring).

**Interfaces:**

- Produces: `EngineGpuHandles.earthRenderer: EarthRenderer | null`; `initGpu` constructs `createEarthRenderer(device, 'rgba16float', 'depth32float')`, stores it on `state.gpu.earthRenderer`, and kicks off the Blue Marble fetch → `createImageBitmap` → `setTexture`; and the registry row
  ```ts
  export const earthLayer: ContentLayer = {
    name: 'earth',
    slab: NEAR0,
    target: 'foreground:0',
    blend: 'opaque',
    enabled(state) {
      /* earthRenderer non-null AND bodies.earth non-null */
    },
    draw(pass, view, _ctx, state) {
      /* composeBodyMvp(view.slab.vp, …) → earthRenderer.draw */
    },
  };
  ```
- Consumes: `EarthRenderer` + `createEarthRenderer` (Task 6), `composeBodyMvp` + `SCALE_UNITS` + `RENDER_ORIGIN_MPC` (imported directly — not ctx state), `state.data.bodies` (Task 5), the existing `(foreground:0, NEAR0)` program step (`frameProgram.ts:67`) — **no frameProgram edit**: the earth row rides the step the fold already appended, and `executeFrame`'s touched-set rule keeps the pass + composite skipped while `enabled` is false.

**Asset task (STOP-and-report if blocked):** fetch a public-domain NASA Blue Marble **equirectangular** JPG (e.g. NASA Visible Earth "Blue Marble: Next Generation", or the 2002 Blue Marble equirectangular), downscale to ~4k width, write to `public/images/earth/blue-marble-4k.jpg`, and add a provenance note (URL + date + licence) in a `data/raw/`-style README OR an inline comment at the fetch site. The asset is committed (it's a small static shell asset, not an R2 `.bin`). If the fetch is blocked (no network / licence unclear), STOP and report — the rest of the earth renderer is buildable + testable headless against a stub texture.

**Layer body (model on `debugSpheresLayer.ts:45-68`, incl. its f64-seam header):** `composeBodyMvp(view.slab.vp, earth.positionMpc, RENDER_ORIGIN_MPC, earth.radiusKm * SCALE_UNITS.KM_TO_MPC)` — `view.slab.vp` (the slab's `Float64Array`), NOT `view.vp`; feeding the f32 narrowing would resolve the ~1 AU near-cancellation after the precision is gone and mis-place Earth by more than its radius. `initGpu` construction sits with the foreground block (`initGpu.ts:387-408`); the two format literals MUST match the `foreground:0` row (`renderTargets.ts:119`) — the target↔renderer-profile invariant (`ContentLayer.d.ts:21-26`); carry the convention comment `initGpu.ts:393-399` uses. The texture fetch is NOT awaited (bootstrap must not block on a 4k JPG; the sphere draws untextured or is gated until the bitmap lands — pick one and note it in the layer/renderer header).

- [x] Add the Blue Marble asset + provenance (or STOP-and-report).
- [x] Add `earthRenderer: EarthRenderer | null` to `EngineGpuHandles.d.ts` (nullable until `initGpu`; docblock per the bag's lifecycle rule `EngineGpuHandles.d.ts:28-36`); seed `null` in the `engine.ts` state literal and add the destroy + re-null row (mirror `engine.ts:696-697`).
- [x] Construct `createEarthRenderer(device, 'rgba16float', 'depth32float')` in `initGpu.ts` beside the foreground block (`initGpu.ts:387-408`); fire the Blue Marble fetch → `setTexture`.
- [x] Add `earthLayer.ts` + register it in `CONTENT_LAYERS` (`passes/index.ts:140-174`) in the foreground group beside `debugSpheresLayer`.
- [x] Test (`earthLayer.test.ts`, modelled on `debugSpheresLayer.test.ts` — same `vi.mock` of `composeBodyMvp`, typed `vi.fn` per `feedback_typed_vi_fn`): `earth layer draws the seeded earth via composeBodyMvp with the slab f64 vp` — fixture `SlabView` whose `slab.vp` is a recognisable `Float64Array` and whose `vp` is a different `Float32Array`; assert `composeBodyMvp`'s first arg `toBe(view.slab.vp)` (and `not.toBe(view.vp)`), its args carry `earth.positionMpc` / `RENDER_ORIGIN_MPC` / the km→Mpc radius, and `earthRenderer.draw` receives a length-16 `Float32Array`.
- [x] Test `enabled is false while earthRenderer is null and while bodies.earth is null; true with both set`.
- [x] Test (`passes.test.ts`): extend the foreground migration-table group (`passes.test.ts:206-216, 286-310` — `FOREGROUND_NAMES`) with `'earth'` `{slab: NEAR0, target: 'foreground:0', blend: 'opaque'}`; the blend-legality test (`passes.test.ts:331-355`) already enforces opaque for `foreground:0` rows — confirm it covers the new row without edits to its table.
- [x] Test: extend `initGpu.destroyReachability.test.ts` (add a `vi.mock` for the `earthRenderer` module — keeps its `?static` WESL imports out of JSDOM — plus the state-bag field, writes-onto-state and destroy-chain assertions) and `engineState.test.ts` (the null seed).
- [x] `npm test -- earthLayer passes initGpu engineState` → green. Commit.

---

# Phase 3 — Anchors

## Task 8 — `StarBody` + `PlanetBody` scene record types

**Files:** `src/@types/scene/StarBody.d.ts` (new), `src/@types/scene/PlanetBody.d.ts` (new), `tests/@types/scene/StarBody.test.ts` + `PlanetBody.test.ts` (new type-shape tests). _(If Task 3 already created these as stubs, this task fills in the final shape + tests.)_

**Interfaces (contract verbatim):**

```ts
// StarBody.d.ts
export type StarBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
  readonly absMag: number; // drives point brightness/size + LOD
  readonly color: Vec3; // B–V → rgb
  readonly radiusKm: number; // used once resolved to a sphere (the Sun)
};
// PlanetBody.d.ts
export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
  readonly albedo: Vec3; // flat lit colour (no texture yet)
};
```

- Consumes: `Vec3`.

- [x] Add both `.d.ts` (one type per file) with didactic docblocks (`absMag` drives the LOD point↔sphere choice — Plan 03; `color` / `albedo` are flat colours, no texture). _(Created early by Task 3 with the locked shapes; Task 8 verified field-for-field.)_
- [x] Type-shape test for each (assigns a literal; asserts a representative field).
- [x] `npm test -- StarBody PlanetBody` → green. Commit.

## Task 9 — Seed the local star map + Moon / Jupiter in `sceneBodies.ts`

**Files:** `src/data/bodies/sceneBodies.ts` (modify — add star + planet exports), `tests/data/bodies/sceneBodies.test.ts` (modify).

**Interfaces:**

- Produces: `export const SCENE_STARS: readonly StarBody[]` (the Sun + a curated local star map); `export const SCENE_PLANETS: readonly PlanetBody[]` (Moon + Jupiter).
- Consumes: `StarBody` / `PlanetBody` (Task 8), `SCALE_UNITS`, and `raDecDistToCartesian` (`src/utils/math/raDecDistToCartesian.ts:30-43`) — the SAME right-handed equatorial J2000 spherical→Cartesian conversion the galaxy build uses (`buildAllBins.ts:69,160`), so the seeded stars land in the exact frame as the catalogs and the star map is NOT rotated against the real sky.

**Coordinate frame (LOCKED — reuse, do not re-derive):** each star is authored in human units — real J2000 `raDeg`, `decDeg`, `distPc` — and its `positionMpc` is `raDecDistToCartesian(raDeg, decDeg, distPc * SCALE_UNITS.PC_TO_MPC)`. That util is directly importable from `src/utils/` (no new helper needed); do NOT inline the spherical→Cartesian formula and do NOT hand-author bare xyz Mpc constants — the RA/Dec authoring is what keeps the neighbourhood aligned with the galaxy sky. The Sun uses `distPc = 0`, which collapses the conversion to the origin `[0,0,0]` regardless of RA/Dec (the zero-distance case noted in `twoMrs.ts:251-252`).

**Star-selection rule (state it verbatim in the seed header):** the Sun, PLUS **one representative entry per stellar system within ~4 pc** (A/B components merged into their primary — e.g. Alpha Centauri A+B as one entry — EXCEPT Proxima Centauri, kept as its own entry because its ~1.301 pc distance is the parsec-scale f64 anchor the tests pin), PLUS the **naked-eye landmark stars out to ~10 pc** (Sirius, Procyon, Altair, Vega, Fomalhaut, Pollux, …). This yields ~20–30 stars. Representative set (the implementer finalises the numeric values from standard references — see Provenance): Sun; Proxima Cen (1.301 pc); Alpha Cen (1.34 pc); Barnard's Star (1.83 pc); Wolf 359 (2.41 pc); Lalande 21185 (2.55 pc); Sirius (2.64 pc); Luyten 726-8 (2.68 pc); Ross 154 (2.98 pc); Ross 248 (3.16 pc); Epsilon Eridani (3.21 pc); Lacaille 9352 (3.29 pc); Ross 128 (3.37 pc); EZ Aquarii (3.50 pc); 61 Cygni (3.50 pc); Procyon (3.51 pc); Struve 2398 (3.55 pc); Groombridge 34 (3.56 pc); Epsilon Indi (3.64 pc); Tau Ceti (3.65 pc); Kapteyn's Star (3.93 pc); Altair (5.13 pc); Vega (7.68 pc); Fomalhaut (7.70 pc); Pollux (10.34 pc).

**Colour (authored RGB — no new helper):** the CPU side has no B–V → RGB helper — `pickColourIndex` (`colourIndex.ts:40-55`) throws for non-galaxy sources and the colour ramp lives only in WGSL (`lib/colorIndex.wesl`), neither reusable for a `StarBody.color: Vec3`. So author each star's `color` as a linear-RGB constant drawn from a small **stated per-spectral-class palette** in the seed header, e.g. O/B blue-white `[0.6, 0.7, 1.0]`, A/F white `[1.0, 1.0, 0.98]`, G yellow-white `[1.0, 0.97, 0.85]` (the Sun), K orange `[1.0, 0.85, 0.65]`, M red `[1.0, 0.6, 0.4]`. Document the palette; do NOT add a `src/utils/color/*` helper for this fixed table (per the search-before-writing-helpers rule — a new pure helper would earn its own file + test, but a fixed authored palette does not).

**Physical values:** real `absMag` per star (Sun ≈ 4.83; Sirius ≈ 1.45; Proxima ≈ 15.6; Vega ≈ 0.58; …). `radiusKm`: real for the **Sun** (696340 — the only star this plan resolves to a sphere; Task 12's partition keeps every other star a point); for the rest, a **stated placeholder** (e.g. 1 solar radius) is acceptable — say so in the header rather than leaving it silent, because no other star's radius is read until Plan 03's LOD promotion.

**Planets (unchanged from the prior seed):** Moon `radiusKm: 1737`, Jupiter `radiusKm: 69911`; positions fixed plausible constants authored via `SCALE_UNITS` (Moon ~Earth-distance scale; Jupiter ~5.2 AU); `albedo` plausible flat colours.

**Provenance (seed-header comment):** the header documents that RA/Dec/distance/absMag are standard published values (Hipparcos / Gaia-era, as commonly tabulated for the nearest-stars and brightest-stars lists), and states the selection rule + the spectral-class colour palette, so the table is auditable.

- [x] Add `SCENE_STARS` (Sun + local map) + `SCENE_PLANETS`, all star positions via `raDecDistToCartesian(ra, dec, distPc * SCALE_UNITS.PC_TO_MPC)` and all planet positions via `SCALE_UNITS` (no inline Mpc magic numbers, no inline trig).
- [x] Test `SCENE_STARS contains the Sun at the origin` — the Sun entry's `positionMpc` is `[0,0,0]` (each component ≈ 0, tight tolerance) and `radiusKm === 696340`.
- [x] Test `Proxima sits ~1.301 pc from the Sun` — `hypot(...Proxima.positionMpc) ≈ 1.301 * SCALE_UNITS.PC_TO_MPC` (tight tolerance — this is the parsec-scale f64 anchor).
- [x] Test `the local map covers the neighbourhood` — `SCENE_STARS.length >= 20`; every entry has a finite `positionMpc` (all three components) and a finite `absMag`; every `color` component is in `[0, 1]`.
- [x] Test `named stars sit at their catalogued distances` — Alpha Cen `hypot(pos) ≈ 1.34 * SCALE_UNITS.PC_TO_MPC` and Sirius `hypot(pos) ≈ 2.64 * SCALE_UNITS.PC_TO_MPC` (spot checks vs. published values, loose tolerance ~0.02 pc).
- [x] Test `star direction matches its RA/Dec through the shared conversion` — pick one star (e.g. Sirius, RA ≈ 101.287°, Dec ≈ −16.716°) and assert its stored `positionMpc` equals `raDecDistToCartesian(raDeg, decDeg, distPc * SCALE_UNITS.PC_TO_MPC)` component-wise. This pins the FRAME (a rotated or bare-xyz seed fails here), not just a magnitude.
- [x] Test `SCENE_PLANETS radii` — Moon 1737, Jupiter 69911.
- [x] Test `planet positions are authored via SCALE_UNITS` — Jupiter's distance ≈ `5.2 * SCALE_UNITS.AU_TO_MPC` (assert the SCALE_UNITS relation, not a bare number).
- [x] `npm test -- sceneBodies` → green. Commit.

## Task 10 — `star` + `planet` source types + entries + registry append; seed into the store

**Files:** `src/@types/data/body/StarSourceEntry.d.ts` + `body/PlanetSourceEntry.d.ts` (new — per-kind subfolder, contract-conflict #6), `src/@types/data/SourceEntry.d.ts` (modify — extend union), `src/data/source.ts` (modify — append `Star: 21`, `Planet: 22`), `src/data/sources/star.ts` + `planet.ts` (new), `src/data/sources.ts` (modify — register), `src/services/engine/data/createEngineData.ts` (modify — seed stars/planets), `tests/data/sources.test.ts` (modify), `tests/services/engine/data/createEngineData.test.ts` (modify).

**Interfaces:**

- Produces:
  ```ts
  export type StarSourceEntry = SourceEntryBase & { readonly type: 'star'; readonly code: number };
  export type PlanetSourceEntry = SourceEntryBase & {
    readonly type: 'planet';
    readonly code: number;
  };
  ```
  `STAR_ENTRY` / `PLANET_ENTRY` `as const satisfies …` (mirror `EARTH_ENTRY` from Task 4: `id: 'star'`/`'planet'`, labels, `allSky`, `visible`, `bearsLabel: false`, `bearsMarker: false`). Codes: `Star: 21`, `Planet: 22` (inserted between `DesiSgw = 20` and `Earth = 23` in the const — **codes are append-only by VALUE; insertion order in the const is cosmetic; do NOT renumber Earth=23**). Confirm Earth stays 23.
- Consumes: `SourceEntryBase`, `Source`; `createEngineData` consumes `SCENE_STARS` / `SCENE_PLANETS`.

- [ ] Append `Star: 21`, `Planet: 22` to `source.ts` (Earth stays 23). Didactic comment.
- [ ] Add the two `.d.ts` under `src/@types/data/body/`; union into `SourceEntry.d.ts`.
- [ ] Add `sources/star.ts` + `planet.ts`; register `[Source.Star]: STAR_ENTRY`, `[Source.Planet]: PLANET_ENTRY` in `SOURCE_REGISTRY`.
- [ ] In `createEngineData.ts`, `setStars(SCENE_STARS)` + `setPlanets(SCENE_PLANETS)` at construction.
- [ ] Test (`sources.test.ts`): `appends Star=21, Planet=22, Earth=23` — assert all three codes; `keeps star/planet OUT of GALAXY_CATALOG_SOURCES`; `keeps star/planet bits clear of ALL_VISIBLE_MASK`.
- [ ] Test `star/planet rows are non-label, non-marker body sources`.
- [ ] Test (`createEngineData.test.ts`): `seeds the local star map (SCENE_STARS) and Moon + Jupiter as planets at construction` — `data.bodies.stars` length matches `SCENE_STARS`, `data.bodies.planets` matches `SCENE_PLANETS`.
- [ ] `npm test -- sources createEngineData` → green. Commit.

## Task 11 — `starRenderer` / `planetRenderer` / `starPointRenderer` types + factories + shaders

**Files:** `src/@types/rendering/StarRenderer.d.ts` + `PlanetRenderer.d.ts` + `StarPointRenderer.d.ts` (new), `src/services/gpu/renderers/starRenderer.ts` + `planetRenderer.ts` + `starPointRenderer.ts` (new), `src/services/gpu/shaders/star/{vertex,fragment}.wesl` + `planet/{vertex,fragment}.wesl` (new), `tests/services/gpu/renderers/{starRenderer,planetRenderer,starPointRenderer}.test.ts` (new — construction + structural).

**Interfaces (`draw` signatures verbatim from the contract):**

```ts
export type StarRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3): void;
};
export type PlanetRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, albedo: Vec3): void;
};
export type StarPointRenderer = Renderer & {
  // distant stars as additive points in the HDR accumulation — reuses the
  // point pipeline, NOT the opaque foreground pass.
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
};
```

Sphere factories follow the landed positional idiom (contract-conflict #7), mirroring `createEarthRenderer` / `createDebugSphereRenderer`: `createStarRenderer(device, targetFormat, depthFormat)` and `createPlanetRenderer(device, targetFormat, depthFormat)` — at the `initGpu` call site the formats must match the `foreground:0` row (`renderTargets.ts:119`). `starPointRenderer`'s factory takes whatever the point-pipeline reuse seam dictates (read `createPointRenderer` — `pointRenderer.ts:361-367` — first); its pipeline profile targets **`'rgba16float'` additive, no depth** (it draws into the depthless `hdr` target — `renderTargets.ts:117`).

- Consumes: `Renderer`, `Vec3`/`Vec2`, `uvSphereMesh` + `lib/sphere.wesl` (star/planet spheres), the point pipeline (`starPointRenderer` reuse — `pointRenderer.ts`).

**Shading:** `star/fragment.wesl` emissive sphere; `planet/fragment.wesl` flat lit albedo; both vertex shaders share `lib/sphere`. `starPointRenderer` reuses the additive point pipeline (cite `pointRenderer.ts`) — it is NOT drawn in the opaque foreground pass; it joins the additive HDR accumulation. **Decide and note** whether `starPointRenderer` wraps `createPointRenderer` directly or builds a thin point pipeline — read `pointRenderer.ts` first (note its signature also threads the fade/source/focus BGLs; a thin dedicated pipeline may be simpler than satisfying those); if it can't be cleanly reused, STOP and report rather than duplicating the whole pipeline.

- [ ] Add the three `.d.ts` types.
- [ ] Add star/planet shader dirs (emissive / flat-lit). `wesl-shaders` skill; share `lib/sphere`.
- [ ] Add the three factories with `satisfies Renderer`.
- [ ] Tests: each `create…Renderer satisfies Renderer` (label + destroy + method arity), structural like Task 6.
- [ ] `npm test -- starRenderer planetRenderer starPointRenderer` → green (or typecheck-only with a note, like Task 6). Commit.

## Task 12 — Anchor content-layer rows + handles + the NEAR0→hdr program step; retire the debug-sphere constellation; repoint the captions

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify — three slots), `src/services/engine/engine.ts` (modify — null seeds + destroy rows), `src/services/engine/phases/initGpu.ts` (modify — construct three renderers; repoint the caption label set), `src/services/engine/frame/passes/starSpheresLayer.ts` + `planetsLayer.ts` + `starPointsLayer.ts` (new), `src/services/engine/frame/passes/index.ts` (modify — register three rows), `src/services/engine/frame/frameProgram.ts` (modify — ONE appended step), `src/services/engine/presentation/sceneBodyLabels.ts` (new — replaces `debugSphereLabels.ts` as the caption source), per-layer tests (new) + `tests/services/engine/frame/passes/passes.test.ts` + `tests/services/engine/frame/frameProgram.test.ts` (modify) + `tests/@types/engineState.test.ts` + `tests/services/engine/phases/initGpu.destroyReachability.test.ts` (modify); **deletions (grep-gated):** `passes/debugSpheresLayer.ts` + its registry row + test, `src/data/bodies/debugSphereBody.ts`, `src/services/gpu/renderers/debugSphereRenderer.ts` + `src/@types/rendering/DebugSphereRenderer.d.ts` + `src/services/gpu/shaders/debugSphere/{vertex,fragment}.wesl`, the `EngineGpuHandles.debugSphereRenderer` slot + its `engine.ts` seed/destroy rows, `src/services/engine/presentation/debugSphereLabels.ts`.

**Interfaces:**

- Produces: `EngineGpuHandles` gains `starRenderer`, `planetRenderer`, `starPointRenderer` (all `| null`); `initGpu` constructs all three; and three registry rows — the registry IS the dispatch table, one row + file per body type:
  ```ts
  export const starSpheresLayer: ContentLayer = {
    name: 'star-spheres',
    slab: NEAR0,
    target: 'foreground:0',
    blend: 'opaque',
    // near-partition stars (the Sun) → composeBodyMvp(view.slab.vp, …) → starRenderer.draw(pass, mvp, color)
  };
  export const planetsLayer: ContentLayer = {
    name: 'planets',
    slab: NEAR0,
    target: 'foreground:0',
    blend: 'opaque',
    // bodies.planets → composeBodyMvp(view.slab.vp, …) → planetRenderer.draw(pass, mvp, albedo)
  };
  export const starPointsLayer: ContentLayer = {
    name: 'star-points',
    slab: NEAR0,
    target: 'hdr',
    blend: 'additive',
    // far-partition stars (Proxima + the rest of the local map) → starPointRenderer.draw(pass, view.vp, view.viewportPx)
  };
  ```
- Consumes: the three renderers (Task 11), `composeBodyMvp` + `SCALE_UNITS` + `RENDER_ORIGIN_MPC`, `state.data.bodies`, the existing `(foreground:0, NEAR0)` program step (sphere rows) and the NEW `(hdr, NEAR0)` step below (points row).

**The `(hdr, NEAR0)` program step — a data edit to `frameProgram.ts`:** `starPointsLayer`'s `(target: 'hdr', slab: NEAR0)` pair has NO program step today (`frameProgram.ts:52-71` renders hdr only @ COSMO), so this task ALSO appends

```ts
{ kind: 'render', target: 'hdr', slab: NEAR0 },
```

**BEFORE the hdr→swap composite** (after the `(hdr, COSMO)` step at `frameProgram.ts:56`), so the star points accumulate into HDR and ride the same tone-map as the galaxies. Why NEAR0→hdr is legal: COSMO's near plane (0.01 Mpc — `slabs.ts:57`) would clip parsec-scale anchors, so the points must project through NEAR0; hdr layers are `'additive'` by the blend-legality test (`passes.test.ts:331-355`), which `starPointsLayer` satisfies, and the additive `hdr` target has no depth (`renderTargets.ts:117`), so no depth attachment is implicated. `executeFrame` needs zero edits — the step rides the existing `(target, slab)` grouping and touched-set rules (the hdr target is already touched by the COSMO step, so this pass loads rather than clears).

**Partition (simple constant, NOT the Plan-03 LOD):** the Sun is always a foreground sphere; every OTHER seeded star (Proxima and the whole local map) is always a `star-points` additive point. Partition `bodies.stars` by ONE named distance constant shared by `starSpheresLayer` and `starPointsLayer`, chosen so only the Sun (distance 0) falls on the near side and all the real neighbours fall on the far side (full apparent-size point↔sphere promotion is Plan 03 — do NOT build the adaptive version). Note the constant + its single home explicitly.

**Caption repoint (the layer + renderer STAY; only the label source changes):** add `sceneBodyLabels()` in `src/services/engine/presentation/` modelled on `debugSphereLabels.ts` (renderOrigin-relative anchors, per-body colours, the vertical stagger rationale — carry those didactic notes) but sourced from `SCENE_EARTH` / `SCENE_STARS` / `SCENE_PLANETS`; in `initGpu.ts:407-408` swap `setLabels(debugSphereLabels())` → `setLabels(sceneBodyLabels())`. `foregroundLabelsLayer`, `foregroundLabelRenderer`, and the `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` gate are untouched. (The plan's original "bodies are not labelled" non-goal is overtaken — Sun/Earth captions already ship; `bearsLabel`/`bearsMarker` stay `false` on the source entries because those flags drive the COSMO label/marker systems, which the caption path bypasses.)

**Debug-sphere constellation retirement (explicit decision; grep-gated):** grep `src`/`tests` for importers of `debugSpheresLayer`, `DEBUG_SPHERE_BODIES` / `debugSphereBody`, `debugSphereRenderer` / `DebugSphereRenderer` / `state.gpu.debugSphereRenderer`, and `debugSphereLabels`. **Only if zero importers remain** (i.e. the new body layers + `sceneBodyLabels` have replaced every consumer), delete the whole constellation listed in Files. If anything still imports a piece, KEEP that piece and note why. Record the decision in the task notes either way. Deleting `debugSpheresLayer` also removes its `CONTENT_LAYERS` row and updates `passes.test.ts`'s `FOREGROUND_NAMES` + the `timedSlotsOf` literal (both files already anticipate the swap — `debugSphereBody.ts:3-6` and `debugSphereLabels.ts:27-28` say a live BodyStore retires them).

- [ ] Add the three slots to `EngineGpuHandles.d.ts`; seed `null` + destroy/re-null rows in `engine.ts` (mirror `engine.ts:696-697`); extend `engineState.test.ts` + `initGpu.destroyReachability.test.ts` (per-renderer `vi.mock`s, state-bag fields, destroy-chain assertions).
- [ ] Construct the three renderers in `initGpu.ts` (sphere renderers with `('rgba16float', 'depth32float')` matching the `foreground:0` row; `starPointRenderer` per its Task-11 seam).
- [ ] Add the three layer files + register in `CONTENT_LAYERS` (`passes/index.ts:140-174` — sphere rows in the foreground group, `star-points` positioned with the hdr-group ordering comment updated).
- [ ] Append the `(hdr, NEAR0)` render step to `frameProgram.ts` before the hdr→swap composite, with a step comment carrying the COSMO-near-plane rationale.
- [ ] Repoint the captions: add `sceneBodyLabels.ts`, swap the `setLabels` call in `initGpu.ts`, delete `debugSphereLabels.ts` (grep-gated).
- [ ] Retire the debug-sphere constellation (grep first; delete only pieces with zero importers; else keep + note).
- [ ] Test (`starSpheresLayer.test.ts`, modelled on `debugSpheresLayer.test.ts`): `the Sun is drawn via composeBodyMvp with the slab f64 vp` — mock `composeBodyMvp`, identity-assert first arg `toBe(view.slab.vp)`; `starRenderer.draw` receives `(pass, Float32Array(16), Vec3 color)`; typed `vi.fn`s. Plus `enabled is false while starRenderer is null / no near-partition stars`.
- [ ] Test (`planetsLayer.test.ts`): `Moon and Jupiter each get a composeBodyMvp call from view.slab.vp and a planetRenderer.draw call` (two draws, per-body albedo); same identity assertion + null-handle gate.
- [ ] Test (`starPointsLayer.test.ts`): `draw threads view.vp and view.viewportPx to starPointRenderer` (the f32 narrowing suffices for point anchors — same rationale as `foregroundLabelsLayer.ts:56-60`); `enabled is false while starPointRenderer is null / no far-partition stars`.
- [ ] Test (`passes.test.ts`): foreground migration group becomes exactly `['earth', 'star-spheres', 'planets']` (all NEAR0 / `foreground:0` / opaque); `star-points` asserted as an hdr-target NEAR0 additive row (extend the migration tables — the blend-legality switch needs no new clause).
- [ ] Test (`frameProgram.test.ts`): the step-list literal grows to nine steps with `{ kind: 'render', target: 'hdr', slab: NEAR0 }` before the hdr→swap composite (`frameProgram.test.ts:65-79`); the slab-coverage test still passes (`:111-119`); the real-registry `timedSlotsOf` literal (`:159-189`) gains `'star-points'` after the COSMO hdr layers and swaps the foreground tail to the new layer names. Check `renderFrame.test.ts` / `renderFrame.timing.test.ts` for fixtures pinning the eight-step shape; update if pinned.
- [ ] `npm test -- starSpheresLayer planetsLayer starPointsLayer passes frameProgram` → green. Commit.

## Task 13 — Full gate + VISUAL verification

**Files:** none new (verification + notes only).

- [ ] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] `npm test` (full suite) → green (590+ tests; new tests added).
- [ ] Placeholder scan: grep the new files for `TODO` / `FIXME` / `throw new Error('not implemented')` → none.
- [ ] **VISUAL gate — user-verified on the dev server (NOT automated). Load the app WITH `?deepZoom`** (the descent floor is URL-gated — `clampDistance.ts:50-52`; a plain load stops at 0.05 Mpc and the bodies stay sub-pixel), zoom from the galaxy view down to Earth and confirm:
  - Earth resolves as a **stable, round, correctly-textured** (Blue Marble) sphere — no jitter / swim / clipping.
  - The Sun, Moon, Jupiter render as **believably-sized** spheres relative to Earth on the way down.
  - The local stars (Proxima and the rest of the seeded neighbourhood) stay as additive points in the HDR accumulation alongside the galaxy backdrop; the recognisable brightest stars (Sirius, Vega, …) are present in roughly their real sky directions; the backdrop is intact; tone parity holds across the Sun's limb (the two composites share one `tone` object — `frameProgram.ts:65-68`).
  - The body captions (now sourced from `sceneBodies`) appear below 1 kpc and track the bodies.
  - An executor running unattended must **STOP and report** that these are visual properties awaiting on-screen confirmation rather than claim success.
- [ ] Commit.

---

## Self-review

### Spec-coverage map (every Phase 2/3 + §5/§6 bullet → task)

| Spec / contract item                                                                             | Task    |
| ------------------------------------------------------------------------------------------------ | ------- |
| §5 `EarthBody` type                                                                              | T1      |
| §5 Earth seed (`SCENE_EARTH`, SCALE_UNITS positions)                                             | T2      |
| §5 `createBodyStore` (BodyStore surface)                                                         | T3      |
| §5 `earth` source type + entry + registry append (code 23)                                       | T4      |
| §5 `createBodyStore` wired into `createEngineData` + seeded at construction                      | T5, T10 |
| §6 `earthRenderer` (Blue Marble equirectangular texture)                                         | T6      |
| §6 Blue Marble asset `public/images/earth/blue-marble-4k.jpg` + provenance                       | T7      |
| §4/§6 per-type body dispatch (earth) — as the `earthLayer` registry row                          | T7      |
| §5 `StarBody` / `PlanetBody` types                                                               | T8      |
| §5 anchor seed (Sun + local star map via `raDecDistToCartesian`, Moon + Jupiter via SCALE_UNITS) | T9      |
| §5 `star`/`planet` source types + entries + registry append (codes 21/22)                        | T10     |
| §5 stars/planets seeded into the store at construction                                           | T10     |
| §6 `starRenderer` (emissive sphere)                                                              | T11     |
| §6 `planetRenderer` (flat lit albedo)                                                            | T11     |
| §6 `starPointRenderer` (distant stars as additive HDR points)                                    | T11     |
| §6 anchor renderers wired — handles + initGpu + `star-spheres`/`planets`/`star-points` rows      | T12     |
| The `(hdr, NEAR0)` program step for the star points                                              | T12     |
| Captions repointed from `debugSphereLabels` to `sceneBodyLabels`                                 | T12     |
| Retire/keep the debug-sphere constellation (explicit, grep-gated decision)                       | T12     |
| §9/§10 final gate + VISUAL verification (`?deepZoom`)                                            | T13     |

Deferred (correctly NOT tasked — spec §1 non-goals / Plan 03): pick codes, per-type visibility toggles, InfoCards; adaptive foreground near/far (the fixed NEAR0 ratios live in `slabs.ts:44-45` with their Plan-03 forward-reference); full apparent-size point↔sphere LOD promotion; fly-to-Earth key; the `MIN_DISTANCE_MPC` floor (shipped by Plan 01, `?deepZoom`-gated); the ADR (Plan 03).

### Placeholder scan

No `TODO` / `FIXME` / fabricated unit tests for GPU output. GPU renderer/shader/asset tasks (T6, T7, T11) carry explicit VISUAL gates and structural-only asserts; no fake pixel-equality tests. T13 grep gates placeholders.

### Type-name consistency vs the contract

`EarthBody`, `StarBody`, `PlanetBody`, `EarthSourceEntry`, `StarSourceEntry`, `PlanetSourceEntry`, `EARTH_ENTRY`, `STAR_ENTRY`, `PLANET_ENTRY`, `BodyStore`, `createBodyStore`, `SCENE_EARTH`, `SCENE_STARS`, `SCENE_PLANETS`, `EarthRenderer`/`createEarthRenderer`, `StarRenderer`, `PlanetRenderer`, `StarPointRenderer`, `Source.Star/Planet/Earth` — spelled identically to the contract across all tasks. Renderer `draw` signatures match the contract verbatim (T6, T11); factory signatures follow the landed positional idiom (contract-conflict #7); the contract's `encodeForegroundPass` dispatch surface is superseded by registry rows (contract-conflict #8).

### Contract conflicts with current code (flagged inline above)

1. **`code` not in `SourceEntryBase`** — each new entry type adds `readonly code: number`, matching existing variants (`src/@types/data/structure/StructureSourceEntry.d.ts:13`, `src/@types/data/flow/FlowSourceEntry.d.ts:17`). (T4, T10.)
2. **`EngineGpuHandles` real path** is `src/@types/engine/handles/EngineGpuHandles.d.ts` (spec §11's shorthand is wrong). (T7, T12.)
3. **`src/@types/scene/` does not exist yet** — created by the body-type tasks. (T1, T8.)
4. **`EngineData` only has galaxies + structures today** (`EngineData.d.ts:20-23`) — Plan 02 adds `bodies` + updates the docblock. (T5.)
5. **Next free Source codes 21/22/23** — 18/19/20 were consumed by the DESI patches after this plan was first written (`source.ts:109-136`); pick reserves 0–30, 31 sentinel, so all three still fit. Earth=23, Star=21, Planet=22; append-only by value, Earth stays 23 even though it's wired before star/planet. (T4, T10.)
6. **`SourceEntryBase` DOES exist** (`SourceEntryBase.d.ts`) — the contract's "first read whether it exists / STOP-and-report if shapes don't factor" is resolved: it factors cleanly, reused as-is.
7. **Source-entry `.d.ts` subfolders** — new entry types go under `src/@types/data/body/`, matching the registry's per-kind layout. (T4, T10.)
8. **Renderer factories are positional** `(device, targetFormat, depthFormat)`, per the landed `createDebugSphereRenderer` idiom — supersedes the contract's named bag. (T6, T11.)
9. **The dispatch surface is the `CONTENT_LAYERS` registry** — `encodeForegroundPass` (and `foregroundOffscreen`, `foregroundComposite`, the ctx foreground fields) were deleted by the renderer-unification 04 fold; body layers are registry rows consuming `view.slab.vp` + `RENDER_ORIGIN_MPC` directly. (T7, T12.)
