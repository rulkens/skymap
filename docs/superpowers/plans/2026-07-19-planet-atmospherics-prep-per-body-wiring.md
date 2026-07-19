# Planet Atmospherics — Prep PR: atmosphere-shell wiring goes per-body

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Generalise the atmosphere-shell **wiring** from Earth-only to a per-body table, **behavior-neutral** — with only the Earth row in `ATMOSPHERE_PARAMS`, Earth's rendered output stays **pixel-identical**. This is the **prep PR** that lands before the photoreal-planet-atmospherics feature PR. It changes the three hard-coded `state.data.bodies.earth` reads (renderer construction, the shell draw, the sky-view bake) into a per-body table + one shared per-frame draw-list derivation. **No new params rows, no limb darkening, no `ATMOSPHERE_SHELL_PARAMS` deletion** — those are the feature PR.

**Architecture:** Three seams change, all in the wiring around the already-body-agnostic `atmosphereShellRenderer`:

1. **The renderer goes per-body** (`atmosphereShellRenderer.ts`). `createAtmosphereShellRenderer` takes `paramsById: Readonly<Record<string, AtmosphereParams>>` instead of a single `params`. Internally it holds a `Map<string, AtmosphereBundle>` — one bundle per body id (three LUT textures + views, three uniform buffers, four bind groups) — while the four pipelines, the LUT sampler, and the proxy-sphere mesh stay **shared** across the whole set. This mirrors `texturedBodyRenderer`'s per-body `Map<BodyTextureId, BodyResources>` idiom. The startup transmittance→multi-scatter bake loops every body in `paramsById` into **one** command encoder + **one** `queue.submit`. `encodeSkyView(encoder, bodyId, uniforms)` and `draw(pass, bodyId, uniforms)` gain a leading `bodyId` selecting the bundle; both throw on an unknown id (callers only ever pass ids from the draw-list, filtered to `paramsById` members).

2. **One shared per-frame draw-list** (`frame/atmosphereDrawList.ts`, NEW). `atmosphereDrawList(state, ctx): readonly AtmosphereDrawEntry[]` is the single derivation both the bake and the draw consume: start from `[state.data.bodies.earth, ...state.data.bodies.planets]`, drop the `null` Earth, filter to bodies with an `ATMOSPHERE_PARAMS` row, then apply the shared `FOREGROUND_MAX_DISTANCE_MPC` distance cull and the per-body `SUB_PIXEL_BODY_CULL_PX` sub-pixel cull (the same `apparentSizePx`-based derivation currently inlined in `atmosphereShellLayer`). In practice ≤1 entry passes; the design is correct for N>1.

3. **Both consumers iterate the list** (`atmosphereShellLayer.ts`, `encodeAtmosphereSkyView.ts`). Each deletes its own `bodies.earth` read and its own gate copy, iterating `atmosphereDrawList` instead. `initGpu` passes the whole `ATMOSPHERE_PARAMS` table (drops the hardcoded `['earth']`). The bake↔draw gate relation upgrades from **superset** to **equality** — both sites now read the same list (including the sub-pixel cull), so the shell bakes iff it draws (§5.2 of the spec); document that in both didactic headers and delete the "bake gate must be a superset" prose.

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders (`?static` linker), Vitest.

**Spec:** docs/superpowers/specs/2026-07-19-photoreal-planets-atmospherics-design.md — this plan implements **§2 (Ground preparation)**, **§5 (the shared draw-list derivation)**, and **§2.3 (neutrality)** only. §3/§6/§7 (the six new rows, limb darkening, `AtmosphereParams` growth, `ATMOSPHERE_SHELL_PARAMS` deletion) are the **feature PR** and are explicitly out of scope here.

**Depends on:** the shipped photoreal-Earth atmosphere shell (`plans/completed/2026-07-19-photoreal-earth-e-atmosphere-shell.md`, PR #453) — the body-agnostic `atmosphereShellRenderer`, the `ATMOSPHERE_PARAMS` data table, the `camPosLocal`/`sunDirLocal`/`composeBodyMvp` utils, the `NEAR0` slab + `foreground:0` target, and the `apparentSizePx` sub-pixel cull. All present on `main`; this plan reshapes their wiring, adds nothing new to the render pipeline.

### Header notes — resolved decisions (do not re-litigate)

- **This PR is behavior-neutral.** With one Earth row, the reshaped renderer bakes exactly one bundle, `atmosphereDrawList` yields exactly the Earth entry whenever Earth is in near-field range, and the shell draws with the same LUTs, uniforms, and pipeline as before. Earth is **pixel-identical** — the last task verifies this on the dev server.
- **No feature-PR work.** Do NOT add Venus/Mars/giant rows, do NOT touch `AtmosphereParams`'s field set, do NOT delete `atmosphereShellParams.ts`, do NOT add `limbDarkening.wesl` / `LIMB_DARKENING_PARAMS` / `TexturedBodyUniforms` changes. Keep the exposure/sunIrradiance reads exactly as today (see next note).
- **Exposure/sunIrradiance reads are unchanged.** `AtmosphereParams` does not yet carry look fields, so the draw keeps packing `ATMOSPHERE_SHELL_PARAMS.sunIrradiance` + `state.settings.earth.atmosphereExposure` verbatim — with only the Earth row present, the loop packs those for its single entry. The feature PR is where the per-body `body.id === 'earth' ? settings… : params.exposure` branch lands; NOT here.
- **The renderer's shared-vs-per-body split is load-bearing, not stylistic.** Per-body **buffers** so no shared state exists for a mid-frame `writeBuffer` to clobber (the house `queue.writeBuffer` race trap); shared **pipelines/sampler/mesh** so one program serves all bodies. This is the exact `texturedBodyRenderer` bundle idiom.
- **The bake↔draw upgrade to equality is strictly better.** The old superset (bake gates on distance but NOT sub-pixel) existed only to guarantee the bake was never stricter than the draw. Reading the same list makes them equal by construction and retires the thin over-bake band where the camera was in range but the disc had gone sub-pixel. Do not reintroduce a separate bake gate.

## Global Constraints

Every task inherits these.

- **Neutrality is the acceptance bar.** No task may change Earth's rendered pixels. The only behavioral delta is the retired over-bake band (a compute-cost saving, invisible).
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name) — `AtmosphereDrawEntry` owns its `.d.ts`, `atmosphereDrawList` owns its `.ts`; deep relative imports, no barrels; didactic multi-paragraph module headers that explain **why** (the consolidation and the superset→equality upgrade get documented in the touched headers); WebGPU explicit bind-group layouts, never `'auto'` shared across pipelines (`feedback_webgpu_auto_layout_trap`); `Vec3`/`Mat3` aliases never raw tuples; stage specific paths on commit (never `git add -A`); commit messages conventional (`refactor(atmosphere): …`).
- **Testing (`conventions/testing.md`):** new focused tests ONLY for `atmosphereDrawList`'s behavioral branches. No numeric restatements, no type-shape tests, no constant/registry restatements. Update the existing `encodeAtmosphereSkyView` test to the new fixture + call shapes rather than duplicating it. The renderer reshape carries no unit test (GPU construction — verified by `npm run build` link + the final visual pass).
- **iOS safety (house trap):** an invalid shader/pipeline silently drops the WHOLE frame on WebKit. The renderer reshape multiplies the bundle count but keeps every shader module unchanged; the risk is purely the extra bundles. The final task's visual pass includes an iOS spot-check that the Earth limb still presents.
- **Downloads:** NONE. Pure refactor; no `fetch-*`, no R2 sync.

---

## Task 1: `AtmosphereDrawEntry` type + `atmosphereDrawList` shared derivation

**Files:**

- Create `src/@types/engine/frame/AtmosphereDrawEntry.d.ts`
- Create `src/services/engine/frame/atmosphereDrawList.ts`
- Create `tests/services/engine/frame/atmosphereDrawList.test.ts`

**Interfaces — Consumes:** `EngineState`, `ReadyFrameContext`, `EarthBody`, `PlanetBody`, `AtmosphereParams` (types); `ATMOSPHERE_PARAMS` (`data/bodies/atmosphereParams`), `apparentSizePx` (`utils/math/apparentSizePx`), `SCALE_UNITS` (`data/scaleUnits`), `FOREGROUND_MAX_DISTANCE_MPC` (`frame/foregroundMaxDistance`), `SUB_PIXEL_BODY_CULL_PX` (`frame/subPixelBodyCullPx`). **Produces:**

```ts
// @types/engine/frame/AtmosphereDrawEntry.d.ts — one type per file.
// The seeded body (Earth or a planet) plus its atmosphere params, resolved once
// per frame for both the sky-view bake and the shell draw.
export type AtmosphereDrawEntry = {
  readonly body: EarthBody | PlanetBody; // carries id, positionMpc, radiusKm, orientation
  readonly params: AtmosphereParams;
};
```

```ts
// services/engine/frame/atmosphereDrawList.ts
export function atmosphereDrawList(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly AtmosphereDrawEntry[];
```

- The derivation, in order: candidates `[state.data.bodies.earth, ...state.data.bodies.planets]`; drop the `null` Earth; keep a body iff (a) it has an `ATMOSPHERE_PARAMS` row (the data-gate), (b) `ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC` (the shared near-field distance cull — a whole-list short-circuit, since `ctx.cam.distance` is one scalar), and (c) its **surface** diameter resolves at/above `SUB_PIXEL_BODY_CULL_PX`.
- The sub-pixel derivation is the one currently inlined in `atmosphereShellLayer.ts:89-108` — lift it verbatim: per-body distance from `ctx.drawCamPos`, `apparentSizePx({ diameterKpc: (2·radiusKm·KM_TO_MPC)/KPC_TO_MPC, distanceMpc, viewportHeightPx: ctx.canvasSize.height, fovYRad: ctx.fovYRad })`, with the `distanceMpc === 0` (camera inside the body) case treated as resolved (kept in the list). Preserve that degenerate-case comment.
- Didactic header: this is the ONE derivation feeding both the bake (`encodeAtmosphereSkyView`) and the draw (`atmosphereShellLayer`), so the two can never disagree (follow-up #1 consolidation); note that ≤1 entry passes in practice but the shape is general; note the sub-pixel cull on the SURFACE diameter (matching the opaque body it haloes, not the atmosphere-top).

**Steps (TDD):**

- [ ] Add the `AtmosphereDrawEntry` type (one type per file; `EarthBody`/`PlanetBody`/`AtmosphereParams` alias imports) with a didactic header.
- [ ] Write `tests/services/engine/frame/atmosphereDrawList.test.ts` — the behavioral branches, each an independent reason to fail (model the fixture on `encodeAtmosphereSkyView.test.ts`'s `makeState`/`makeCtx`, extended with `data.bodies.planets` and `ctx.canvasSize`/`ctx.fovYRad`):
  - [ ] `includes a body with a row, in near-field range, and a supra-pixel disc` — Earth seeded, `ctx.cam.distance` inside the near-field edge, `canvasSize`/`fovYRad`/`drawCamPos` chosen so the disc clears `SUB_PIXEL_BODY_CULL_PX` ⇒ the entry is present with `body` and `params`.
  - [ ] `excludes a body with no ATMOSPHERE_PARAMS row` — a seeded planet whose id is absent from `ATMOSPHERE_PARAMS` ⇒ not in the list (the data-gate).
  - [ ] `excludes a body beyond FOREGROUND_MAX_DISTANCE_MPC` — `ctx.cam.distance === FOREGROUND_MAX_DISTANCE_MPC` ⇒ empty (distance cull).
  - [ ] `excludes a body whose disc is sub-pixel` — same body but `drawCamPos` far enough (or a tiny `canvasSize.height`) that the disc falls below `SUB_PIXEL_BODY_CULL_PX` ⇒ not in the list (this is the cull that makes the bake↔draw relation equality).
  - [ ] `skips a null earth without throwing` — `state.data.bodies.earth === null`, `planets: []` ⇒ empty list, no throw.
- [ ] Implement `atmosphereDrawList`.
- [ ] `npm test -- atmosphereDrawList` green; `npx tsc --noEmit` clean.
- [ ] Commit (`AtmosphereDrawEntry.d.ts`, `atmosphereDrawList.ts`, its test).

---

## Task 2: Both consumers iterate `atmosphereDrawList` (consolidation + superset→equality)

**Files:**

- Modify `src/services/engine/frame/passes/atmosphereShellLayer.ts`
- Modify `src/services/engine/frame/encodeAtmosphereSkyView.ts`
- Modify `tests/services/engine/frame/encodeAtmosphereSkyView.test.ts`

**Interfaces — Consumes:** `atmosphereDrawList` (Task 1). Renderer API **unchanged** in this task (`encodeSkyView(encoder, uniforms)`, `draw(pass, uniforms)` — still single-body; `initGpu` still passes `ATMOSPHERE_PARAMS['earth']!`). Since only Earth has a row, the list is ≤1 entry, so looping it against the single-body renderer is behaviorally identical to today. **Produces:** the consolidated consumers.

- **`atmosphereShellLayer.ts`:** delete the local `atmosphereShellDraw` derivation (the `bodies.earth` read + the sub-pixel/distance gate copy), the `EarthBody` import, and the now-unused `ATMOSPHERE_PARAMS`/`apparentSizePx`/`SCALE_UNITS`/`FOREGROUND_MAX_DISTANCE_MPC`/`SUB_PIXEL_BODY_CULL_PX` imports it duplicated. `enabled` returns `false` if the renderer handle is null, else `atmosphereDrawList(state, ctx).length > 0`. `draw` loops `atmosphereDrawList(state, ctx)`: for each `{ body, params }` compose the proxy MVP / `sunDirLocal` / `camPosLocal` / `bottomRadius` exactly as the current `draw` does (using `body` where it reads `earth` today), and call `renderer.draw(pass, packAtmosphereUniforms(mvp, sun, camLocal, bottomRadius, ATMOSPHERE_SHELL_PARAMS.sunIrradiance, state.settings.earth.atmosphereExposure))` — the exposure/sunIrradiance reads stay verbatim (only the Earth row exists this PR). Keep the `composeBodyMvp`/`sunDirLocal`/`camPosLocal`/`packAtmosphereUniforms`/`RENDER_ORIGIN_MPC`/`SCALE_UNITS`/`ATMOSPHERE_SHELL_PARAMS` imports the draw still needs. Update the header: the layer now iterates the shared `atmosphereDrawList`; the "bake gates on a strict SUPERSET" paragraph becomes "the bake reads the SAME list, so bake↔draw is equality".
- **`encodeAtmosphereSkyView.ts`:** delete the `bodies.earth` read + the `ATMOSPHERE_PARAMS`/`FOREGROUND_MAX_DISTANCE_MPC` gate copy. Keep the renderer-null short-circuit. Iterate `atmosphereDrawList(state, ctx)`: for each `{ body, params }` derive `camLocal`/`sun`/`viewHeightKm`/`sunZenithCos` from `ctx.drawCamPos` + `body` exactly as today (using `body` where it reads `earth`), and call `renderer.encodeSkyView(encoder, new Float32Array([viewHeightKm, sunZenithCos, 0, 0]))`. Update the header: delete the "gate is the layer's enabled minus the sub-pixel cull / strict SUPERSET" section; replace with "reads the SAME `atmosphereDrawList` the draw does — bake↔draw is equality (the shell bakes iff it draws); the retired over-bake band is the camera-in-range-but-sub-pixel case the old superset baked needlessly."
- **`encodeAtmosphereSkyView.test.ts`:** extend `makeState` to seed `data.bodies.planets: []` (the list spreads it) and `makeCtx` to carry `canvasSize` + `fovYRad` such that the `CAM_POS_RENDERED` disc is **supra-pixel** (the equality gate now applies the sub-pixel cull to the bake too — the fixture must clear it for the "bakes the SkyViewParams" case). The load-bearing packing assertions (slot 0 `viewHeightKm`, slot 1 `sunZenithCos`, `drawCamPos`-not-stale source) are unchanged; the `encodeSkyView` call is still 2-arg in this task. Keep the three no-op cases (null renderer / beyond distance / unseeded Earth) — all now flow through an empty `atmosphereDrawList`.

**Steps:**

- [ ] Rewrite `atmosphereShellLayer.ts` to iterate `atmosphereDrawList`; delete the local derivation + duplicated imports; update the header (superset→equality, shared derivation).
- [ ] Rewrite `encodeAtmosphereSkyView.ts` to iterate `atmosphereDrawList`; delete the duplicated gate; update the header.
- [ ] Update `encodeAtmosphereSkyView.test.ts` fixtures (`planets: []`, `canvasSize`, `fovYRad`) so the bake case is supra-pixel; keep the packing + no-op assertions.
- [ ] `npm test -- encodeAtmosphereSkyView` green; `npx tsc --noEmit` clean.
- [ ] Commit (both consumers + the test).

---

## Task 3: Per-body renderer bundles + `.d.ts` + `initGpu` whole table + `bodyId` at call sites

**Files:**

- Modify `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`
- Modify `src/@types/rendering/AtmosphereShellRenderer.d.ts`
- Modify `src/services/engine/phases/initGpu.ts`
- Modify `src/services/engine/frame/passes/atmosphereShellLayer.ts`
- Modify `src/services/engine/frame/encodeAtmosphereSkyView.ts`
- Modify `tests/services/engine/frame/encodeAtmosphereSkyView.test.ts`

This task is atomic-by-necessity: the `encodeSkyView`/`draw` signatures gain a leading `bodyId`, so every call site + the factory move together to keep the build green.

**Interfaces — Produces:**

```ts
// atmosphereShellRenderer.ts — a bundle per body id; pipelines/sampler/mesh SHARED.
type AtmosphereBundle = {
  transmittanceTex: GPUTexture;
  multiScatterTex: GPUTexture;
  skyViewTex: GPUTexture;
  scatteringBuffer: GPUBuffer;
  skyViewParamsBuffer: GPUBuffer;
  shellUniformBuffer: GPUBuffer;
  transmittanceBindGroup: GPUBindGroup;
  multiScatterBindGroup: GPUBindGroup;
  skyViewBindGroup: GPUBindGroup;
  shellBindGroup: GPUBindGroup;
};

export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  depthFormat: GPUTextureFormat,  // 'depth32float' (foreground:0)
  paramsById: Readonly<Record<string, AtmosphereParams>>, // was `params: AtmosphereParams`
): AtmosphereShellRenderer;

type AtmosphereShellRenderer = Renderer & {
  encodeSkyView(encoder: GPUCommandEncoder, bodyId: string, skyViewUniforms: Float32Array): void;
  draw(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array): void;
};
```

- **The reshape** (`atmosphereShellRenderer.ts`): everything currently created once — the three LUT textures + views, the `scatteringBuffer`/`skyViewParamsBuffer`/`shellUniformBuffer`, and the four bind groups (transmittance-bake, multi-scatter-bake, sky-view-bake, shell-draw) — becomes **per-body**, built in a loop over `paramsById` and stored in a `Map<string, AtmosphereBundle>`. Everything NOT body-specific stays created **once, before the loop, and shared**: the four pipelines (`transmittancePipeline`/`multiScatterPipeline`/`skyViewPipeline`/`shellPipeline`) and their bind-group layouts, the LUT `sampler`, and the proxy-sphere `positionBuffer`/`indexBuffer`/`indexCount`. Per-body bind groups reference the shared sampler + the shared layouts but the body's own textures/buffers. `packScatteringParams(params)` is written into each body's `scatteringBuffer` at construction. Model the structure on `texturedBodyRenderer.ts`'s per-body `Map` + shared-pipeline split.
- **The startup bake** loops every body: for each, record its transmittance pass then its multi-scatter pass into **one** shared `device.createCommandEncoder`, and issue **one** `device.queue.submit([encoder.finish()])` after the loop. The transmittance→multi-scatter ordering per body is the compute-pass barrier WebGPU inserts between passes in one encoder (unchanged); the loop repeats the pair per body inside the same encoder. Do NOT submit per body.
- **`encodeSkyView(encoder, bodyId, skyViewUniforms)`** and **`draw(pass, bodyId, uniforms)`** look up `bundles.get(bodyId)`; **throw** on `undefined` (`throw new Error(\`atmosphereShellRenderer: unknown body id '${bodyId}'\`)` or equivalent) — an unknown id is a programming error since callers pass only `atmosphereDrawList` ids. Each then writes to / binds that bundle's buffers + bind groups exactly as the single-body version does today.
- **`destroy`** loops the bundles destroying each body's textures + buffers, then destroys the shared `positionBuffer`/`indexBuffer`.
- **`AtmosphereShellRenderer.d.ts`:** update `encodeSkyView`/`draw` signatures to the leading `bodyId`; replace the "One baked set in v1" section with "one bundle per `paramsById` row" (per-body buffers so no shared mid-frame write, shared pipelines/sampler/mesh); **also refresh the stale `cullMode: 'front'` / back-face-only prose** — the shipped pipeline is `cullMode: 'none'` with a `front_facing` duty split (near wall = over-disc aerial perspective, far wall = limb + sky), a pre-existing doc drift this PR corrects (the renderer's own `.ts` header already documents the shipped `cullMode: 'none'` behavior — match it).
- **`initGpu.ts`** (line ~580): pass `ATMOSPHERE_PARAMS` whole instead of `ATMOSPHERE_PARAMS['earth']!`. Update the adjacent comment: it bakes ONE bundle per row (Earth today), not "a second atmosphere body would want a second instance".
- **`atmosphereShellLayer.ts`** `draw`: pass `body.id` — `renderer.draw(pass, body.id, packAtmosphereUniforms(...))`.
- **`encodeAtmosphereSkyView.ts`**: pass `body.id` — `renderer.encodeSkyView(encoder, body.id, new Float32Array([...]))`.
- **`encodeAtmosphereSkyView.test.ts`:** the spy `encodeSkyView` is now called `(encoder, bodyId, uniforms)`; update the `mock.calls[0]` destructure to `[encoderArg, bodyIdArg, uniforms]`, assert `bodyIdArg === SCENE_EARTH.id` (or `'earth'`), and keep every packing assertion on the (now third-slot) `uniforms`.

**Steps:**

- [ ] Reshape `atmosphereShellRenderer.ts` to `paramsById` + per-body `Map<string, AtmosphereBundle>`, shared pipelines/sampler/mesh, one-encoder bake loop, `bodyId`-selecting `encodeSkyView`/`draw` (throw on unknown), bundle-looping `destroy`. Update the module header (per-body bundles; the shared-vs-per-body split rationale).
- [ ] Update `AtmosphereShellRenderer.d.ts`: per-`bodyId` signatures, "one bundle per `paramsById` row" prose, corrected `cullMode: 'none'` + `front_facing` description.
- [ ] `initGpu.ts`: pass the whole `ATMOSPHERE_PARAMS` table; update the comment.
- [ ] `atmosphereShellLayer.ts` + `encodeAtmosphereSkyView.ts`: pass `body.id` at the `draw` / `encodeSkyView` call sites.
- [ ] `encodeAtmosphereSkyView.test.ts`: update the spy-call destructure to the 3-arg shape; assert the `bodyId`.
- [ ] `npx tsc --noEmit` clean; `npm test -- encodeAtmosphereSkyView` green; `npm run build` clean (the WESL relinks — watch the shared-encoder frame-drop failure mode).
- [ ] Commit (renderer, `.d.ts`, `initGpu`, both consumers, the test — stage each path explicitly).

---

## Task 4: entanglement-radar review pass

**Files:** none (review).

- [ ] Run the `entanglement-radar` skill over the whole branch diff (house convention `feedback_operationalize_simplicity`). Pay attention to:
  - `atmosphereDrawList` being the **single** home for the `bodies.earth`+gate derivation — confirm NO residual `bodies.earth` read or gate copy survives in `atmosphereShellLayer` / `encodeAtmosphereSkyView` (the whole point of the consolidation; a leftover copy re-braids the two sites);
  - the bake↔draw relation being **equality** by construction (both read the same list), not two prose-linked copies — confirm no separate bake gate remains and the "superset" prose is gone from both headers;
  - the renderer's **shared-vs-per-body** split being clean — pipelines/sampler/mesh created once, only textures/buffers/bind-groups per body (no accidental per-body pipeline, which would be the `'auto'`-layout-style duplication);
  - `paramsById` staying pure data with **no per-body branch** in the renderer (a body is a `Map` entry, never an `if (id === …)`);
  - the exposure/sunIrradiance reads still being the unchanged Earth-row values (no premature feature-PR `body.id === 'earth' ? …` branch crept in).
- [ ] Address findings (or record why deferred); keep the suite green.

---

## Task 5: Final verification + neutrality visual check

**Files:** none.

- [ ] `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [ ] **Neutrality visual pass — ask the USER** (do NOT start or kill the dev server; it is left running for HMR): fly close to Earth on the running dev server and confirm the Earth limb, sunset/terminator arc, and over-disc haze read **exactly as on `main`** before this PR — the prep is behavior-neutral (spec §2.3). Explicitly ask the user to confirm on **iOS/WebKit** as well (the per-body bundle loop multiplies the LUT bakes; the risk is only the bundle count — navigation + the limb must both still present, no whole-frame drop).
- [ ] Report the verification results (test/typecheck/build output + the user's visual confirmation) back before marking the plan done.
