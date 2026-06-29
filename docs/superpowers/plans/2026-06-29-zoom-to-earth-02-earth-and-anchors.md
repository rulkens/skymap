# Zoom to Earth — Plan 02: Earth & anchors

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` (§5 data model, §6 renderers, §10 Phases 2–3).
**Cross-plan contract (LOCKED source of truth):** `docs/superpowers/specs/` companion contract — every symbol name / path / signature below is verbatim from it. Do NOT rename or re-shape; if current code makes a contract symbol impossible, the task says **STOP and report**.
**Plan style (OVERRIDES upstream `writing-plans`):** `docs/superpowers/conventions/plan-style.md` — **contract code yes, implementation code NO.** Cite `path:line`; test names + assertions ARE the acceptance criteria.

## Goal

Land the visible payoff of the zoom-to-Earth slice on top of Plan 01's precision seams: a **textured round Earth** at true relative scale, plus a small set of correctly-scaled **anchors** (Sun, Moon, Jupiter, Proxima) that make the descent legible.

Two independently-shippable halves, in order:

- **Phase 2 (Earth) FIRST** — the `earth` data type + seed + `earthRenderer` (Blue Marble) + foreground-pass table-dispatch for `'earth'`. Ships a textured Earth on its own.
- **Phase 3 (Anchors) SECOND** — the `star` / `planet` data types + seed (Sun, Proxima, Moon, Jupiter) + `starRenderer` / `planetRenderer` / `starPointRenderer` on the shared sphere infra, extending the same table dispatch.

## Consumes from Plan 01 (treat as already existing)

These are Plan-01 deliverables. Plan 02 CONSUMES them under their locked names — do not redefine:

- `src/data/scaleUnits.ts` → `SCALE_UNITS` (`KM_TO_MPC`, `AU_TO_MPC`, `PC_TO_MPC`, …).
- `src/data/renderOrigin.ts` → `RENDER_ORIGIN_MPC: Readonly<Vec3>`.
- `src/utils/camera/composeBodyMvp.ts` → `composeBodyMvp(foregroundVp, bodyPosMpc, renderOrigin, radiusMpc): Float32Array`.
- `src/utils/math/uvSphereMesh.ts` → `uvSphereMesh(segments, rings): UvSphereMesh` (unit-radius positions, equirectangular uvs, CCW-outward indices).
- `src/services/gpu/shaders/lib/sphere.wesl` → shared `SphereUniforms { mvp: mat4x4<f32> }` + `clip_from_local(localPos)` helper.
- `src/services/gpu/passes/foregroundOffscreen.ts` (`ForegroundOffscreen`: rgba16float color + depth32float depth) and `foregroundComposite.ts` (`ForegroundComposite`, OVER blend).
- `src/services/engine/frame/encodeForegroundPass.ts` → `encodeForegroundPass(encoder, ctx, state, deps)`; Plan 01 draws the debug sphere there. **Plan 02 extends its body to draw earth/planet/star spheres via TABLE DISPATCH by `type`.**
- `ReadyFrameContext` foreground fields (`foregroundVp`, `foregroundNear`, `foregroundFar`, `renderOrigin`) — `src/@types/engine/frame/ReadyFrameContext.d.ts`.
- `EngineGpuHandles` foreground slots (`foregroundOffscreen`, `foregroundComposite`, `debugSphereRenderer`) — `src/@types/engine/handles/EngineGpuHandles.d.ts`. Plan 02 ADDS `earthRenderer`, `planetRenderer`, `starRenderer`, `starPointRenderer`.
- `src/services/gpu/renderers/debugSphereRenderer.ts` → `DebugSphereRenderer` (Plan 02 decides retirement — Task 12).

## Tech stack

TS + Vite + React shell, raw WebGPU + WESL (linked via `?static`). wgpu-matrix (`mat4`/`mat4d`). Vitest. No new runtime deps. The Blue Marble texture is a new committed asset under `public/`.

## Global constraints (house rules — these override defaults)

- **Append-only `Source` codes.** Codes are persisted/packed; append `Star` / `Planet` / `Earth` AFTER `Flow=17` (→ 18, 19, 20). NEVER renumber. See `source.ts:17-109` docblock.
- **One symbol per file** in `src/@types/` (one `type` per `.d.ts`) and `src/utils/` (filename = exported function). Deep relative imports, no barrels.
- **`type` aliases, never `interface`.**
- **`Vec3` / `Vec2` aliases**, never raw `[number, number, number]` tuples (`src/@types/math/Vec3.d.ts`, `Vec2.d.ts`).
- **Tagged-union TABLE DISPATCH, never an `if (type === …)` chain** — each body `type` maps 1:1 to its renderer through a dispatch table (spec §5, §6; CLAUDE.md memory `feedback_tagged_union_table_dispatch`).
- **Seed real data early** — `sceneBodies.ts` is authored right after the body types, and `createBodyStore` seeds from it at construction (`feedback_seed_data_early`).
- **Renderer conventions** (`docs/superpowers/conventions/renderers.md`): factory + `satisfies Renderer` (`label` + `destroy`), GPU resources in the closure, per-frame inputs through `draw()`, nullable `EngineGpuHandles` slot, constructed in `initGpu.ts`.
- **WESL conventions** (`wesl-shaders` skill): no backticks in comments, literal `package::` prefix, `?static` TS import (see `pointRenderer.ts:45-46`).
- **Didactic timeless comments** — explain why; no dates / PR refs / "pre-X" history.
- **Suite stays green** at every task; the **final task gates on `npm run typecheck` (both tsconfigs) + `npm test`**.
- **VISUAL gates are user-verified** on the dev server, NOT automated: a textured ROUND Earth resolving cleanly with no jitter/swim, and anchors at BELIEVABLE relative sizes. The final task flags exactly what to confirm on screen.

## Contract conflicts found (reconcile inline; do not silently diverge)

1. **`code` field.** The contract sketch shows `StarSourceEntry = SourceEntryBase & { readonly type: 'star' }`, but `SourceEntryBase` (`SourceEntryBase.d.ts:9-68`) does NOT carry `code` — every existing variant adds its own (`StructureSourceEntry.d.ts:13`, `FlowSourceEntry.d.ts:17`). Plan 02 therefore adds `readonly code: number` to each of the three new entry types, matching the existing variants. (Tasks 4, 8.)
2. **`EngineGpuHandles` path.** The contract cites `src/@types/engine/handles/EngineGpuHandles.d.ts`; that is the real path (the spec §11 shorthand `src/@types/engine/EngineGpuHandles.d.ts` is wrong). Use the `handles/` path. (Plan 01 owns the foreground slots; Task 7/11 add the renderer slots.)
3. **`src/@types/scene/` does not exist yet.** The body record types (`StarBody` / `PlanetBody` / `EarthBody`) create that directory (Tasks 2, 6).
4. **`EngineData` shape.** `EngineData.d.ts` currently has only `galaxies` + `structures`; its docblock says volumes/flow/filaments have no store. Plan 02 ADDS `readonly bodies: BodyStore` and updates the docblock rationale (bodies ARE app-side seed data the slot can't supply). (Task 5.)
5. **Next free Source codes: 18 / 19 / 20** (confirmed: `source.ts` ends at `Flow: 17`; pick reserves 0–30, 31 sentinel — three fit). (Tasks 4, 8.)

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
    readonly positionMpc: Vec3;   // absolute heliocentric, f64-valued
    readonly radiusKm: number;    // 6371
    readonly textureUrl: string;  // Blue Marble equirectangular
  };
  ```
- Consumes: `Vec3` from `src/@types/math/Vec3` (deep relative import).

- [ ] Add `EarthBody.d.ts` with a didactic docblock: a seeded Earth record; `positionMpc` is canonical Mpc (authored via `SCALE_UNITS`), `radiusKm` resolved to a sphere by `composeBodyMvp`.
- [ ] Add a minimal type-level test asserting an object literal of the shape assigns to `EarthBody` and that `positionMpc` is a `Vec3` (mirror an existing `@types` shape test if one exists; else a trivial `const x: EarthBody = {…}; expect(x.radiusKm).toBe(6371)`).
- [ ] `npm test -- EarthBody` → green. Commit.

## Task 2 — `sceneBodies.ts` seed (Earth only, this phase)

**Files:** `src/data/bodies/sceneBodies.ts` (new — Earth export now; stars/planets added in Phase 3), `tests/data/bodies/sceneBodies.test.ts` (new).

**Interfaces:**
- Produces: `export const SCENE_EARTH: EarthBody`.
- Consumes: `EarthBody` (Task 1); `SCALE_UNITS` (`scaleUnits.ts`, Plan 01).

**Seed values (from contract + spec §5):** Earth `radiusKm: 6371`; `positionMpc` = `[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]` (1 AU from the Sun, authored in human units, stored Mpc); `textureUrl: '/images/earth/blue-marble-4k.jpg'`; `id: 'earth'`, `label: 'Earth'`.

- [ ] Add `sceneBodies.ts` exporting `SCENE_EARTH`. Author the position via `SCALE_UNITS.AU_TO_MPC` (do NOT inline a magic Mpc number — the conversion is the contract).
- [ ] Test `SCENE_EARTH radius is 6371 km`.
- [ ] Test `SCENE_EARTH is one AU from the Sun in Mpc` — assert `SCENE_EARTH.positionMpc[0]` ≈ `SCALE_UNITS.AU_TO_MPC` (tight tolerance) and the other two components are 0.
- [ ] Test `SCENE_EARTH textureUrl points at the Blue Marble asset` — `=== '/images/earth/blue-marble-4k.jpg'`.
- [ ] `npm test -- sceneBodies` → green. Commit.

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
- Consumes: `StarBody` / `PlanetBody` / `EarthBody`. **NOTE:** `StarBody` / `PlanetBody` land in Phase 3 (Task 6). To keep Phase 2 shippable, this task may import them ahead of their seed — define the FULL `BodyStore` type now (the closure stores empty arrays for stars/planets until Phase 3 seeds them). If forward-importing the not-yet-created `StarBody`/`PlanetBody` types is awkward, create those two `.d.ts` stubs as part of this task and seed them in Task 6 — **STOP and report** if the type files can't be created cleanly ahead of their seed.

**Pattern:** closure over private mutable arrays + `Object.freeze` of read-only getters + setters — mirror `createGalaxyStore.ts:20-44` and `createStructureStore.ts:25-45`.

- [ ] Add `BodyStore.d.ts` (one type per file) + `createBodyStore.ts`.
- [ ] Test `createBodyStore starts with empty stars/planets and null earth`.
- [ ] Test `setEarth then earth getter returns the record` (round-trip).
- [ ] Test `setStars / setPlanets round-trip` (set an array, read the getter back, identity preserved).
- [ ] Test `setEarth(null) clears the earth`.
- [ ] `npm test -- createBodyStore` → green. Commit.

## Task 4 — `earth` source type + entry + registry append

**Files:** `src/@types/data/EarthSourceEntry.d.ts` (new), `src/@types/data/SourceEntry.d.ts` (modify — extend union), `src/data/source.ts` (modify — append `Earth: 20`), `src/data/sources/earth.ts` (new), `src/data/sources.ts` (modify — import + register `EARTH_ENTRY`), `tests/data/sources.test.ts` (modify).

**Interfaces:**
- Produces:
  ```ts
  // EarthSourceEntry.d.ts
  export type EarthSourceEntry = SourceEntryBase & {
    readonly type: 'earth';
    readonly code: number;   // see contract-conflict #1
  };
  ```
  `EARTH_ENTRY` `as const satisfies EarthSourceEntry` (mirror `flow.ts:5-28` / `cluster.ts:4-17` shape: `type`, `code: Source.Earth`, `id: 'earth'`, `label: 'Earth'`, `allSky`, `visible`, `bearsLabel`, `bearsMarker`). Bodies are NOT yet selectable/labelled (spec §5 "deferred") → `bearsLabel: false`, `bearsMarker: false`.
- Consumes: `SourceEntryBase` (`SourceEntryBase.d.ts:9`), `Source` (`source.ts`).

- [ ] Append `Earth: 20` to the `Source` const with a didactic comment (registry-key-only code, appended after Flow=17; never renumber the codes below).
- [ ] Add `EarthSourceEntry.d.ts`; union it into `SourceEntry.d.ts:14-20`.
- [ ] Add `sources/earth.ts` → `EARTH_ENTRY`; import + add `[Source.Earth]: EARTH_ENTRY` to `SOURCE_REGISTRY` (`sources.ts:91-110`).
- [ ] Test (`sources.test.ts`, mirror the `overlay codes (milkyWay/flow)` describe block at `sources.test.ts:168-233`): `appends Earth=20 to the enum` → `expect(Source.Earth).toBe(20)`.
- [ ] Test `earth row is a non-label, non-marker body source` — `entry.type === 'earth'`, `entry.id === 'earth'`, `bearsLabel === false`, `bearsMarker === false`.
- [ ] Test `keeps Earth OUT of GALAXY_CATALOG_SOURCES` and `keeps the Earth bit clear of ALL_VISIBLE_MASK` (mirror `sources.test.ts:176-186`).
- [ ] Test `every entry carries a unique id` already covers `'earth'` — confirm it still passes (`sources.test.ts:55-68`).
- [ ] `npm test -- sources` → green. Commit.

## Task 5 — Wire `BodyStore` into `EngineData`, seed Earth at construction

**Files:** `src/@types/engine/data/EngineData.d.ts` (modify), `src/services/engine/data/createEngineData.ts` (modify), `tests/services/engine/data/createEngineData.test.ts` (new or modify).

**Interfaces:**
- Produces: `EngineData` gains `readonly bodies: BodyStore`; `createEngineData()` constructs `createBodyStore()` and seeds `setEarth(SCENE_EARTH)` at construction (mirror how galaxies/structures are intended to seed; bodies seed from the static `sceneBodies.ts`, the seed-data-early convention).
- Consumes: `createBodyStore` (Task 3), `SCENE_EARTH` (Task 2).

- [ ] Add `bodies: BodyStore` to `EngineData.d.ts:23-26`; update its docblock to record that bodies ARE app-side seed data (overrides the "two stores" sentence — see contract-conflict #4).
- [ ] In `createEngineData.ts:16-21`, construct `createBodyStore()`, call `setEarth(SCENE_EARTH)` before returning, add `bodies` to the returned bag.
- [ ] Test `createEngineData seeds the Earth body at construction` — `data.bodies.earth?.id === 'earth'`.
- [ ] Test `createEngineData still exposes galaxies + structures stores` (regression).
- [ ] `npm test -- createEngineData` → green. Commit.

## Task 6 — `EarthRenderer` type + `earthRenderer` factory + earth shaders

**Files:** `src/@types/rendering/EarthRenderer.d.ts` (new), `src/services/gpu/renderers/earthRenderer.ts` (new), `src/services/gpu/shaders/earth/vertex.wesl` (new), `src/services/gpu/shaders/earth/fragment.wesl` (new), `tests/services/gpu/renderers/earthRenderer.test.ts` (new — construction + structural asserts only; see VISUAL note).

**Interfaces:**
- Produces (`EarthRenderer.d.ts`, contract verbatim):
  ```ts
  export type EarthRenderer = Renderer & {
    setTexture(bitmap: ImageBitmap): void;             // copyExternalImageToTexture
    draw(pass: GPURenderPassEncoder, mvp: Float32Array): void;
  };
  export function createEarthRenderer(init: {
    device: GPUDevice;
    colorFormat: GPUTextureFormat;   // 'rgba16float' (foreground offscreen color)
    depthFormat: GPUTextureFormat;   // 'depth32float'
  }): EarthRenderer;
  ```
- Consumes: `Renderer` (`@types/rendering/Renderer.d.ts:46-49`), `uvSphereMesh` + `lib/sphere.wesl` (Plan 01), the `?static` WESL import idiom (`pointRenderer.ts:45-46`), `copyExternalImageToTexture` (pattern at `textureAtlas.ts:131-145`).

**Shape:** factory takes a named bag (renderers.md "named bag" rule); uploads `uvSphereMesh(…)` VBO/IBO once; owns the texture + sampler + bind group in the closure; `setTexture(bitmap)` does `device.queue.copyExternalImageToTexture(...)` into the equirectangular 2D texture; `draw(pass, mvp)` writes the f32 `mvp` to the `SphereUniforms` buffer and draws indexed. `satisfies Renderer` at the return. Earth fragment shader samples the equirectangular texture at the mesh uvs; vertex shader imports `package::lib::sphere` `clip_from_local`.

- [ ] Add `EarthRenderer.d.ts`.
- [ ] Add `earth/vertex.wesl` + `earth/fragment.wesl` (texture sample; share `lib/sphere`). Follow WESL conventions (no backticks, literal `package::`, `?static` on the TS side). Use the `wesl-shaders` skill.
- [ ] Add `earthRenderer.ts` factory with `satisfies Renderer`.
- [ ] Test `createEarthRenderer satisfies Renderer` — has a non-empty `label`, a `destroy` function (construct against a mocked/headless `GPUDevice` the way existing renderer tests mock it — read an existing renderer test for the device-stub style first; if no renderer is unit-tested headlessly in this repo, assert only the module exports + type-shape and rely on the VISUAL gate).
- [ ] Test `setTexture and draw are callable` (structural: methods exist with the right arity).
- [ ] **VISUAL gate (deferred to Task 13):** a round, correctly-textured Earth is user-verified on screen — NOT asserted here.
- [ ] `npm test -- earthRenderer` → green (or typecheck-only if headless GPU construction is infeasible — note which). Commit.

## Task 7 — Blue Marble asset + `EngineGpuHandles.earthRenderer` slot + construct in `initGpu` + dispatch `'earth'`

**Files:** `public/images/earth/blue-marble-4k.jpg` (new committed asset), `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify), `src/services/engine/phases/initGpu.ts` (modify — construct + upload), `src/services/engine/frame/encodeForegroundPass.ts` (modify — table-dispatch `'earth'`), `tests/services/engine/frame/encodeForegroundPass.test.ts` (modify/extend Plan 01's test).

**Interfaces:**
- Produces: `EngineGpuHandles.earthRenderer: EarthRenderer | null`; `initGpu` constructs `createEarthRenderer(...)`, stores it on `state.gpu.earthRenderer`, and kicks off the Blue Marble fetch → `createImageBitmap` → `setTexture` (async, like the font-atlas await at `initGpu.ts:193`); `encodeForegroundPass` draws `state.data.bodies.earth` via the dispatch table using `composeBodyMvp(ctx.foregroundVp, earth.positionMpc, ctx.renderOrigin, earth.radiusKm * SCALE_UNITS.KM_TO_MPC)`.
- Consumes: `EarthRenderer` + `createEarthRenderer` (Task 6), `composeBodyMvp` + `SCALE_UNITS` + `ForegroundOffscreen` (Plan 01), `state.data.bodies` (Task 5).

**Asset task (STOP-and-report if blocked):** fetch a public-domain NASA Blue Marble **equirectangular** JPG (e.g. NASA Visible Earth "Blue Marble: Next Generation", or the 2002 Blue Marble equirectangular), downscale to ~4k width, write to `public/images/earth/blue-marble-4k.jpg`, and add a provenance note (URL + date + licence) in `data/raw/`-style README OR an inline comment at the fetch site. The asset is committed (it's a small static shell asset, not an R2 `.bin`). If the fetch is blocked (no network / licence unclear), STOP and report — the rest of the earth renderer is buildable + testable headless against a stub texture.

**Dispatch (table, not an if-chain):** introduce a `Record`/`Map` keyed by body `type` → a draw closure `(pass, mvp) => state.gpu.<renderer>?.draw(pass, mvp, …)`. Earth is the first entry (`'earth'`); Phase 3 adds `'star'`/`'planet'`. Each body's mvp comes from `composeBodyMvp`. Cite the contract's `encodeForegroundPass` step-(1) render-pass description.

- [ ] Add the Blue Marble asset + provenance (or STOP-and-report).
- [ ] Add `earthRenderer: EarthRenderer | null` to `EngineGpuHandles.d.ts` (nullable until `initGpu`); add it to the destroy/teardown path if the handles file or `engine.ts` walks slots for teardown (verify where `foregroundOffscreen` etc. get destroyed — match it).
- [ ] Construct `createEarthRenderer(...)` in `initGpu.ts` near the other HDR-target renderers (cite the construction block ~`initGpu.ts:249-313`); fire the Blue Marble fetch → `setTexture`.
- [ ] Extend `encodeForegroundPass.ts` to draw the Earth body via the dispatch table; compose its MVP via `composeBodyMvp`.
- [ ] Test (`encodeForegroundPass.test.ts`): `earth body is drawn through the dispatch table` — with a stub `earthRenderer` whose `draw` is a `vi.fn<(pass: GPURenderPassEncoder, mvp: Float32Array) => void>()`, a ctx carrying a real `foregroundVp` + a seeded `state.data.bodies.earth`, assert `draw` is called once with a `Float32Array` of length 16. (Use a typed `vi.fn` — `feedback_typed_vi_fn`.)
- [ ] Test `no earth body → earth renderer draw not called` (null-safe path).
- [ ] `npm test -- encodeForegroundPass` → green. Commit.

---

# Phase 3 — Anchors

## Task 8 — `StarBody` + `PlanetBody` scene record types

**Files:** `src/@types/scene/StarBody.d.ts` (new), `src/@types/scene/PlanetBody.d.ts` (new), `tests/@types/scene/StarBody.test.ts` + `PlanetBody.test.ts` (new type-shape tests). *(If Task 3 already created these as stubs, this task fills in the final shape + tests.)*

**Interfaces (contract verbatim):**
```ts
// StarBody.d.ts
export type StarBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;  // absolute heliocentric, f64-valued
  readonly absMag: number;     // drives point brightness/size + LOD
  readonly color: Vec3;        // B–V → rgb
  readonly radiusKm: number;   // used once resolved to a sphere (the Sun)
};
// PlanetBody.d.ts
export type PlanetBody = {
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
  readonly albedo: Vec3;       // flat lit colour (no texture yet)
};
```
- Consumes: `Vec3`.

- [ ] Add both `.d.ts` (one type per file) with didactic docblocks (`absMag` drives the LOD point↔sphere choice — Plan 03; `color` / `albedo` are flat colours, no texture).
- [ ] Type-shape test for each (assigns a literal; asserts a representative field).
- [ ] `npm test -- StarBody PlanetBody` → green. Commit.

## Task 9 — Seed Sun / Proxima / Moon / Jupiter in `sceneBodies.ts`

**Files:** `src/data/bodies/sceneBodies.ts` (modify — add star + planet exports), `tests/data/bodies/sceneBodies.test.ts` (modify).

**Interfaces:**
- Produces: `export const SCENE_STARS: readonly StarBody[]` (Sun + Proxima); `export const SCENE_PLANETS: readonly PlanetBody[]` (Moon + Jupiter).
- Consumes: `StarBody` / `PlanetBody` (Task 8), `SCALE_UNITS`.

**Seed values (contract + spec §5):** Sun at `[0,0,0]`, `radiusKm: 696340`; Proxima at `~1.301 pc` via `SCALE_UNITS.PC_TO_MPC` (position a plausible direction, e.g. `[1.301 * SCALE_UNITS.PC_TO_MPC, 0, 0]` — fixed constant, not ephemeris). Moon `radiusKm: 1737`, Jupiter `radiusKm: 69911` — positions fixed plausible constants authored via `SCALE_UNITS` (Moon ~Earth-distance scale; Jupiter ~5.2 AU). `absMag`/`color`/`albedo` plausible constants (Sun absMag ≈ 4.83, yellow-white; Proxima dim red).

- [ ] Add `SCENE_STARS` + `SCENE_PLANETS`, all positions authored via `SCALE_UNITS` (no inline Mpc magic numbers).
- [ ] Test `SCENE_STARS contains the Sun at the origin` — Sun's `positionMpc` is `[0,0,0]` and `radiusKm === 696340`.
- [ ] Test `Proxima sits ~1.301 pc from the Sun` — `|positionMpc| ≈ 1.301 * SCALE_UNITS.PC_TO_MPC` (tight tolerance).
- [ ] Test `SCENE_PLANETS radii` — Moon 1737, Jupiter 69911.
- [ ] Test `planet positions are authored via SCALE_UNITS` — Jupiter's distance ≈ `5.2 * SCALE_UNITS.AU_TO_MPC` (or whatever constant chosen; assert the SCALE_UNITS relation, not a bare number).
- [ ] `npm test -- sceneBodies` → green. Commit.

## Task 10 — `star` + `planet` source types + entries + registry append; seed into the store

**Files:** `src/@types/data/StarSourceEntry.d.ts` + `PlanetSourceEntry.d.ts` (new), `src/@types/data/SourceEntry.d.ts` (modify — extend union), `src/data/source.ts` (modify — append `Star: 18`, `Planet: 19`), `src/data/sources/star.ts` + `planet.ts` (new), `src/data/sources.ts` (modify — register), `src/services/engine/data/createEngineData.ts` (modify — seed stars/planets), `tests/data/sources.test.ts` (modify), `tests/services/engine/data/createEngineData.test.ts` (modify).

**Interfaces:**
- Produces:
  ```ts
  export type StarSourceEntry   = SourceEntryBase & { readonly type: 'star';   readonly code: number };
  export type PlanetSourceEntry = SourceEntryBase & { readonly type: 'planet'; readonly code: number };
  ```
  `STAR_ENTRY` / `PLANET_ENTRY` `as const satisfies …` (mirror `EARTH_ENTRY` from Task 4: `id: 'star'`/`'planet'`, labels, `allSky`, `visible`, `bearsLabel: false`, `bearsMarker: false`). Codes: `Star: 18`, `Planet: 19` (appended BEFORE `Earth: 20` is fine — but Earth already took 20 in Task 4; append Star=18, Planet=19 between Flow=17 and Earth=20 — **codes are append-only by VALUE, insertion order in the const is cosmetic; do NOT renumber Earth=20**). Confirm Earth stays 20.
- Consumes: `SourceEntryBase`, `Source`; `createEngineData` consumes `SCENE_STARS` / `SCENE_PLANETS`.

- [ ] Append `Star: 18`, `Planet: 19` to `source.ts` (Earth stays 20). Didactic comment.
- [ ] Add the two `.d.ts`; union into `SourceEntry.d.ts`.
- [ ] Add `sources/star.ts` + `planet.ts`; register `[Source.Star]: STAR_ENTRY`, `[Source.Planet]: PLANET_ENTRY` in `SOURCE_REGISTRY`.
- [ ] In `createEngineData.ts`, `setStars(SCENE_STARS)` + `setPlanets(SCENE_PLANETS)` at construction.
- [ ] Test (`sources.test.ts`): `appends Star=18, Planet=19, Earth=20` — assert all three codes; `keeps star/planet OUT of GALAXY_CATALOG_SOURCES`; `keeps star/planet bits clear of ALL_VISIBLE_MASK`.
- [ ] Test `star/planet rows are non-label, non-marker body sources`.
- [ ] Test (`createEngineData.test.ts`): `seeds Sun + Proxima as stars and Moon + Jupiter as planets at construction`.
- [ ] `npm test -- sources createEngineData` → green. Commit.

## Task 11 — `starRenderer` / `planetRenderer` / `starPointRenderer` types + factories + shaders

**Files:** `src/@types/rendering/StarRenderer.d.ts` + `PlanetRenderer.d.ts` + `StarPointRenderer.d.ts` (new), `src/services/gpu/renderers/starRenderer.ts` + `planetRenderer.ts` + `starPointRenderer.ts` (new), `src/services/gpu/shaders/star/{vertex,fragment}.wesl` + `planet/{vertex,fragment}.wesl` (new), `tests/services/gpu/renderers/{starRenderer,planetRenderer,starPointRenderer}.test.ts` (new — construction + structural).

**Interfaces (contract verbatim):**
```ts
export type StarRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3): void;
};
export type PlanetRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, mvp: Float32Array, albedo: Vec3): void;
};
export type StarPointRenderer = Renderer & {
  // distant stars as points in the ADDITIVE backdrop — reuses the point pipeline,
  // NOT the foreground depth pass.
  draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void;
};
```
Factory signatures mirror `createEarthRenderer` (named bag with `device` + `colorFormat` + `depthFormat`) for `starRenderer`/`planetRenderer`; `starPointRenderer` takes whatever the point pipeline needs (read `pointRenderer.ts:340` `createPointRenderer` signature for the reuse seam — additive backdrop, no depth).

- Consumes: `Renderer`, `Vec3`/`Vec2`, `uvSphereMesh` + `lib/sphere.wesl` (star/planet spheres), the point pipeline (`starPointRenderer` reuse — `pointRenderer.ts`).

**Shading:** `star/fragment.wesl` emissive sphere; `planet/fragment.wesl` flat lit albedo; both vertex shaders share `lib/sphere`. `starPointRenderer` reuses the additive point pipeline (cite `pointRenderer.ts`) — it is NOT drawn in the foreground depth pass; it joins the additive HDR backdrop. **Decide and note** whether `starPointRenderer` wraps `createPointRenderer` directly or builds a thin point pipeline — read `pointRenderer.ts` first; if it can't be cleanly reused, STOP and report rather than duplicating the whole pipeline.

- [ ] Add the three `.d.ts` types.
- [ ] Add star/planet shader dirs (emissive / flat-lit). `wesl-shaders` skill; share `lib/sphere`.
- [ ] Add the three factories with `satisfies Renderer`.
- [ ] Tests: each `create…Renderer satisfies Renderer` (label + destroy + method arity), structural like Task 6.
- [ ] `npm test -- starRenderer planetRenderer starPointRenderer` → green (or typecheck-only with a note, like Task 6). Commit.

## Task 12 — Wire anchor renderers into `EngineGpuHandles` + `initGpu` + foreground dispatch; retire `debugSphereRenderer`?

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify), `src/services/engine/phases/initGpu.ts` (modify), `src/services/engine/frame/encodeForegroundPass.ts` (modify — extend the dispatch table for `'star'`/`'planet'` + draw `starPointRenderer` for distant stars), `tests/services/engine/frame/encodeForegroundPass.test.ts` (modify); possibly delete `src/services/gpu/renderers/debugSphereRenderer.ts` + its shaders + test.

**Interfaces:**
- Produces: `EngineGpuHandles` gains `starRenderer`, `planetRenderer`, `starPointRenderer` (all `| null`); `initGpu` constructs all three; `encodeForegroundPass` dispatch table gains `'star'` → `starRenderer.draw(pass, mvp, color)` and `'planet'` → `planetRenderer.draw(pass, mvp, albedo)`, iterating `state.data.bodies.stars`/`.planets`. For this phase the Sun is always a foreground sphere and Proxima/distant stars render as `starPointRenderer` points in the additive backdrop — **partition by a simple constant** here (full apparent-size LOD is Plan 03; do NOT build the adaptive promotion). Note the simple partition explicitly.
- Consumes: the three renderers (Task 11), `composeBodyMvp` + `SCALE_UNITS`, `state.data.bodies`.

**`debugSphereRenderer` retirement (explicit decision task):** grep `src`/`tests` for importers of `debugSphereRenderer` / `DebugSphereRenderer` / `state.gpu.debugSphereRenderer`. **Only if zero importers remain** (i.e. `encodeForegroundPass` now draws Earth + anchors and no longer references the debug sphere), delete the renderer + its shaders + its slot + its test. If anything still imports it, KEEP it and note why (e.g. retained as a headless smoke-test fixture). Record the decision in the task notes either way.

- [ ] Add the three slots to `EngineGpuHandles.d.ts`; wire teardown.
- [ ] Construct the three renderers in `initGpu.ts`.
- [ ] Extend `encodeForegroundPass.ts` dispatch table for `'star'`/`'planet'`; draw the Sun as a foreground sphere, distant stars via `starPointRenderer` (simple constant partition; note it).
- [ ] Decide debugSphereRenderer retirement (grep first; delete only if zero importers; else keep + note).
- [ ] Test (`encodeForegroundPass.test.ts`): `the Sun is drawn through the star dispatch entry` — seeded `state.data.bodies.stars` with the Sun, stub `starRenderer.draw` typed `vi.fn`, assert called with a length-16 `Float32Array` + a `Vec3` color.
- [ ] Test `planets are drawn through the planet dispatch entry` (Moon + Jupiter → two `planetRenderer.draw` calls).
- [ ] Test `the dispatch is table-driven` — assert no `if (type === …)` chain (structural: a single registry/table object keyed by `type`; assert its keys are exactly `['earth','star','planet']` if the table is exported, OR review-only with a note).
- [ ] `npm test -- encodeForegroundPass` → green. Commit.

## Task 13 — Full gate + VISUAL verification

**Files:** none new (verification + notes only).

- [ ] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] `npm test` (full suite) → green (590+ tests; new tests added).
- [ ] Placeholder scan: grep the new files for `TODO` / `FIXME` / `throw new Error('not implemented')` → none.
- [ ] **VISUAL gate — user-verified on the dev server (NOT automated).** Load the app, zoom from the galaxy view down to Earth and confirm:
  - Earth resolves as a **stable, round, correctly-textured** (Blue Marble) sphere — no jitter / swim / clipping.
  - The Sun, Moon, Jupiter render as **believably-sized** spheres relative to Earth on the way down.
  - Proxima (and the galaxy backdrop) stay as additive-backdrop points; the backdrop is intact.
  - An executor running unattended must **STOP and report** that these are visual properties awaiting on-screen confirmation rather than claim success.
- [ ] Commit.

---

## Self-review

### Spec-coverage map (every Phase 2/3 + §5/§6 bullet → task)

| Spec / contract item | Task |
| --- | --- |
| §5 `EarthBody` type | T1 |
| §5 Earth seed (`SCENE_EARTH`, SCALE_UNITS positions) | T2 |
| §5 `createBodyStore` (BodyStore surface) | T3 |
| §5 `earth` source type + entry + registry append (code 20) | T4 |
| §5 `createBodyStore` wired into `createEngineData` + seeded at construction | T5, T10 |
| §6 `earthRenderer` (Blue Marble equirectangular texture) | T6 |
| §6 Blue Marble asset `public/images/earth/blue-marble-4k.jpg` + provenance | T7 |
| §4/§6 `encodeForegroundPass` table-dispatch by `type` (earth) | T7 |
| §5 `StarBody` / `PlanetBody` types | T8 |
| §5 anchor seed (Sun, Proxima, Moon, Jupiter, real radii + SCALE_UNITS positions) | T9 |
| §5 `star`/`planet` source types + entries + registry append (codes 18/19) | T10 |
| §5 stars/planets seeded into the store at construction | T10 |
| §6 `starRenderer` (emissive sphere) | T11 |
| §6 `planetRenderer` (flat lit albedo) | T11 |
| §6 `starPointRenderer` (distant stars as additive-backdrop points) | T11 |
| §6 anchor renderers wired (handles + initGpu + dispatch star/planet) | T12 |
| Retire/keep `debugSphereRenderer` (explicit decision) | T12 |
| §9/§10 final gate + VISUAL verification | T13 |

Deferred (correctly NOT tasked — spec §1 non-goals / Plan 03): pick codes, per-type visibility toggles, InfoCards; adaptive foreground near/far; full apparent-size point↔sphere LOD promotion; fly-to-Earth key; lowering `MIN_DISTANCE_MPC` (Plan 01); the ADR (Plan 03).

### Placeholder scan
No `TODO` / `FIXME` / fabricated unit tests for GPU output. GPU renderer/shader/asset tasks (T6, T7, T11) carry explicit VISUAL gates and structural-only asserts; no fake pixel-equality tests. T13 grep gates placeholders.

### Type-name consistency vs the contract
`EarthBody`, `StarBody`, `PlanetBody`, `EarthSourceEntry`, `StarSourceEntry`, `PlanetSourceEntry`, `EARTH_ENTRY`, `STAR_ENTRY`, `PLANET_ENTRY`, `BodyStore`, `createBodyStore`, `SCENE_EARTH`, `SCENE_STARS`, `SCENE_PLANETS`, `EarthRenderer`/`createEarthRenderer`, `StarRenderer`, `PlanetRenderer`, `StarPointRenderer`, `Source.Star/Planet/Earth` — spelled identically to the contract across all tasks. Renderer `draw` signatures match the contract verbatim (T6, T11).

### Contract conflicts with current code (flagged inline above)
1. **`code` not in `SourceEntryBase`** — each new entry type adds `readonly code: number`, matching existing variants (`StructureSourceEntry.d.ts:13`, `FlowSourceEntry.d.ts:17`). (T4, T10.)
2. **`EngineGpuHandles` real path** is `src/@types/engine/handles/EngineGpuHandles.d.ts` (spec §11's shorthand is wrong). (T7, T12.)
3. **`src/@types/scene/` does not exist yet** — created by the body-type tasks. (T1, T8.)
4. **`EngineData` only has galaxies + structures today** — Plan 02 adds `bodies` + updates the docblock. (T5.)
5. **Next free Source codes 18/19/20** confirmed (`source.ts` ends at `Flow: 17`; pick reserves 0–30). Earth=20, Star=18, Planet=19; append-only by value, Earth stays 20 even though it's wired before star/planet. (T4, T10.)
6. **`SourceEntryBase` DOES exist** (`SourceEntryBase.d.ts`) — the contract's "first read whether it exists / STOP-and-report if shapes don't factor" is resolved: it factors cleanly, reused as-is.
