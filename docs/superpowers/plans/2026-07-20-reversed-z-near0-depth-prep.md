# Reversed-Z NEAR0 depth — PREP PR (derive the convention) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) to run this task-by-task. Checkbox (`- [ ]`) steps track progress. **No `.wesl` edits in this PR** — the shader-form flips (`sceneDepth.wesl`, pick bands, `cloudShell` bias) all live in the *feature* PR, not here.

**Goal:** Turn the implicit NEAR0 depth convention — *smaller-z-wins, clear `1.0`, `perspective` projection* — into a **derived per-slab attribute** (`Slab.reversedZ`, `false` everywhere in prep), read by every pipeline `depthCompare`, every depth clear, and the foreground projection builder. This is a **behavioural no-op**: with `reversedZ === false` at every site, every GPU pipeline descriptor and clear value is **byte-identical to today**, so the entire existing depth suite stays green *unchanged* — that green suite is the acceptance proof. This PR does **not** flip NEAR0 to reversed-Z; that is the separate feature plan (`SLAB_REVERSED_Z[NEAR0] = true` + the shader flips).

**Rides the docs PR:** this plan file + its spec (`docs/superpowers/specs/2026-07-20-reversed-z-near0-depth.md`) ride the first PR of the effort (the prep PR), per house convention (docs travel with the first feature/prep PR, not a separate docs PR).

**Spec:** `docs/superpowers/specs/2026-07-20-reversed-z-near0-depth.md` — this plan implements its **"Architecture → Prep PR — derive the convention (behavioural no-op)"** section and the **"Ground preparation"** table. Read current source before editing; **verify every line number below against the live file** — offsets drift.

## Ground preparation

**This PR *is* the ground preparation** for the reversed-Z feature (refactor-ground checkpoint signed off 2026-07-20; verdict table in the spec's "Ground preparation" section). It lands `reversedZ = false` everywhere — a pure, independently-reviewable no-op that converts the implicit *smaller-z-wins/clear-1.0* global into one derived per-slab attribute so the later flip touches **one constant, not ~14 sites**, and a partial flip becomes impossible. No separable sub-prep; the feature PR builds on this.

**Adjacent finding (NOT folded in — backlog):** the NEAR0 *pick* renderers (`bodyPickRenderer`, `starCatalogPickRenderer`, `milkyWayPickRenderer`) hardcode their depth **format** (`'depth32float'`) rather than receiving it like the body renderers receive `depthFormat`. That parallel inconsistency is out of scope; this plan only adds `reversedZ` to those factories, it does **not** also thread `depthFormat` into them.

## Global constraints

Binding for every task.

- **The no-op guard — DO NOT EDIT these tests.** The proof that prep changed no descriptor is that the following stay **unchanged and green**. If any needs editing to pass, something in the prep is wrong — stop and fix the code, not the test:
  - `tests/services/gpu/renderers/bodies/starRenderer.test.ts:76` (`depthCompare: 'less'`)
  - `tests/services/gpu/renderers/bodies/planetRenderer.test.ts`, `ringRenderer.test.ts` (depth-stencil assertions)
  - `tests/services/engine/frame/executeFrame.test.ts:510` (`depthClearValue` === `1`)
  - `tests/services/engine/frame/pickProgram.test.ts:356` (`depthClearValue` === `1.0`)
  - `tests/services/gpu/renderTargets.test.ts:106`
- **One symbol per file in `src/utils/` and `src/@types/`** — filename = export name. `DepthIntent.d.ts`, `resolveDepthCompare.ts`, `depthClearValueFor.ts` each export exactly one symbol.
- **`type` aliases, never `interface`**; deep relative imports, no barrels; didactic multi-paragraph module headers (explain *why* + the rejected alternative).
- **No `.wesl` edits, no `.bin`/registry/store/data-format change, `foregroundFrustum` untouched.**
- **No TS file moves** — no `npm run move-files` needed.
- **Commits:** stage specific paths (never `git add -A`/`.`); format only touched files; the main thread runs `npm test` + `npm run typecheck` + `npm run build` and commits. Background implementers may self-run `npx tsc --noEmit` as a pre-flight only.
- **Dev server** stays running for HMR; never start/kill it. No visual pass in prep (nothing changes visually).

---

## Task 1: `DepthIntent` type + `resolveDepthCompare` helper

**Files:** create `src/@types/rendering/DepthIntent.d.ts`, `src/utils/gpu/resolveDepthCompare.ts`, `tests/utils/gpu/resolveDepthCompare.test.ts`.

**Type (contract):**

```ts
// @types/rendering/DepthIntent.d.ts — one type per file
export type DepthIntent = 'nearer' | 'nearer-or-equal';
```

**Signature (contract):**

```ts
resolveDepthCompare(intent: DepthIntent, reversedZ: boolean): GPUCompareFunction
```

**Mapping (the whole truth table — the four cells):**

| intent | reversedZ | → |
|---|---|---|
| `'nearer'` | `false` | `'less'` |
| `'nearer'` | `true` | `'greater'` |
| `'nearer-or-equal'` | `false` | `'less-equal'` |
| `'nearer-or-equal'` | `true` | `'greater-equal'` |

Didactic header: this is the **single source of the occlusion direction** for depth-drawing pipelines. An inverted entry silently flips every NEAR0 body's occlusion with **no type error** (both sides are valid `GPUCompareFunction`s) — which is exactly why the truth table earns a unit test rather than being a mere constant restatement. `intent` names *what the pipeline wants* (draw the nearer fragment; or nearer-or-tied for the coplanar atmosphere shell); `reversedZ` is *how depth is encoded on this slab*.

**Test — `resolveDepthCompare.test.ts` (pure, no device):**

```
test('resolveDepthCompare maps every (intent, reversedZ) to the right GPUCompareFunction')
```
asserts all four cells above in one test (this is the occlusion-direction truth table, not a boundary/mirror restatement).

**Steps:**
- [x] Create `DepthIntent.d.ts` with the single type.
- [x] Write the failing test asserting the four-cell table.
- [x] Implement `resolveDepthCompare` (a 2×2 lookup; no `SOURCE_REGISTRY`-style dependency). Green.
- [x] `npm test -- resolveDepthCompare` green; `npm run typecheck` clean.
- [x] Commit (stage the three paths).

---

## Task 2: `depthClearValueFor` helper

**Files:** create `src/utils/gpu/depthClearValueFor.ts`, `tests/utils/gpu/depthClearValueFor.test.ts`.

**Signature (contract):**

```ts
depthClearValueFor(reversedZ: boolean): number   // false → 1, true → 0
```

Didactic header: the clear value is the far-plane depth. Non-reversed depth clears to `1` (far), reversed-Z clears to `0` (far after the near↔far swap). Single-sourced here so the two clear sites (`executeFrame` foreground pass, `pickProgram` per-slab pick) can never disagree with the `depthCompare` direction — same rationale as `resolveDepthCompare`.

**Test — `depthClearValueFor.test.ts` (pure):**

```
test('depthClearValueFor returns 1 for non-reversed and 0 for reversed depth')
```
asserts `depthClearValueFor(false) === 1` and `depthClearValueFor(true) === 0`.

**Steps:**
- [x] Write the failing test.
- [x] Implement (one ternary). Green.
- [x] `npm test -- depthClearValueFor` green; `npm run typecheck` clean.
- [x] Commit (stage both paths).

---

## Task 3: `computeForegroundViewProj` gains a `reversedZ` param

**Files:** modify `src/utils/camera/computeForegroundViewProj.ts` (input object + the projection line + the `### Projection matrix` docblock).

**Change:** add `readonly reversedZ: boolean;` to the input object (`computeForegroundViewProj.ts:91-100`). Select the projection builder by the flag at the `mat4d.perspective(...)` call (`:126`):

```
// before
const proj = mat4d.perspective(fovYRad, aspect, near, far);
// after — reversed-Z is INFINITE-far (zFar omitted); non-reversed keeps finite far
const proj = reversedZ
  ? mat4d.perspectiveReverseZ(fovYRad, aspect, near)     // infinite far, near→1, ∞→0
  : mat4d.perspective(fovYRad, aspect, near, far);
```

`mat4d.perspectiveReverseZ` exists in wgpu-matrix (`node_modules/wgpu-matrix/dist/3.x/mat4-impl.d.ts:41`, signature `(fieldOfViewYInRadians, aspect, zNear, zFar?, dst?)`) — **`zFar` is optional; omitting it yields the infinite-far reversed projection**, which is the chosen variant (see spec "Reversed-Z semantics — infinite-far"). The `far` param stays in the input object (still used by the non-reversed branch); note in the docblock that the reversed branch ignores it. Update the `### Projection matrix — mat4d.perspective` docblock passage (`:38-42`) to note the reversed-Z branch (near→1, ∞→0, infinite far) selected by `reversedZ`; keep the ZO-depth rationale for the non-reversed default.

**No new test.** The existing `computeForegroundViewProj` test is the no-op guard — its callers pass `reversedZ: false` (Task 4), so the `mat4d.perspective` branch is taken and the matrix is byte-identical. (The ulp-precision regression test belongs to the *feature* PR, where `reversedZ` goes true.) A prep test asserting "false → same as before" would be a mirror restatement — omit it.

**Steps:**
- [x] Add `reversedZ: boolean` to the input type; branch the projection builder; update the docblock.
- [x] `npm run typecheck` clean; `npm test -- computeForegroundViewProj` green **unchanged** (no-op guard).
- [x] Commit (stage the one path).

> NOTE: this task leaves `deriveSlabs` (its only caller) not yet passing `reversedZ` — the param is required, so `npm run typecheck` will flag `slabs.ts` until Task 4 lands. Run Task 4 immediately after; do **not** commit a red typecheck. (If you prefer a green intermediate, make the param required and land Tasks 3+4 as one commit — either is fine, but never commit a failing typecheck.)

---

## Task 4: `Slab.reversedZ` field + `SLAB_REVERSED_Z` const + `deriveSlabs` echo

**Files:** modify `src/@types/engine/frame/Slab.d.ts`, `src/services/engine/frame/slabs.ts`, `tests/services/engine/frame/slabs.test.ts`.

**Type — add to `Slab` (`Slab.d.ts:30-43`):**

```ts
/** true ⇒ this slab clears depth to 0, greater-wins, perspectiveReverseZ projection. */
reversedZ: boolean;
```

**Const — in `slabs.ts`, beside `NEAR0`/`COSMO`/`SLAB_NAME` (`:30-48`):**

```ts
export const SLAB_REVERSED_Z: Readonly<Record<number, boolean>> = {
  [NEAR0]: false,
  [COSMO]: false,
};
```

Didactic header on the const: the single source of each slab's depth convention. **Both `false` in prep** (byte-identical to the implicit global). The feature PR flips `[NEAR0]` to `true` — that one edit propagates to every pipeline compare, both clears, and the foreground projection, because all read this constant (directly at construction, or echoed onto the runtime `Slab`).

**`deriveSlabs` (`slabs.ts:83-125`):**
- Add `reversedZ: SLAB_REVERSED_Z[NEAR0]` to the `near0` slab literal (`:102-115`) and `reversedZ: SLAB_REVERSED_Z[COSMO]` to the `cosmo` literal (`:116-123`).
- Pass the near-field flag into `computeForegroundViewProj({ …, reversedZ: SLAB_REVERSED_Z[NEAR0] })` at `:91-100` (Task 3's new param).

**Test — extend `slabs.test.ts` (mirror the existing `originRelative`/`precision` assertions at `:58-61`):**

```
test(... existing deriveSlabs test ...)
  expect(slabs[NEAR0]?.reversedZ).toBe(false);
  expect(slabs[COSMO]?.reversedZ).toBe(false);
```
This pins that each derived `Slab` carries `reversedZ` from `SLAB_REVERSED_Z` — the echo a refactor could silently drop, leaving the clear sites reading `undefined`.

**Steps:**
- [x] Add `reversedZ` to the `Slab` type.
- [x] Add `SLAB_REVERSED_Z` (both `false`) beside the slab index constants.
- [x] Extend the `deriveSlabs` test with the two `reversedZ === false` assertions (red — field/const not wired yet).
- [x] Echo `SLAB_REVERSED_Z[...]` onto both slab literals and pass `SLAB_REVERSED_Z[NEAR0]` into `computeForegroundViewProj`. Green.
- [x] `npm test -- slabs` green; `npm run typecheck` clean (resolves the Task-3 note).
- [x] Commit (stage the three paths).

---

## Task 5: Thread `reversedZ` into every depth-drawing renderer factory + its `initGpu` call site

**One atomic commit** — `reversedZ` is a required factory param, so the factory signatures and the `initGpu` call sites must change together to keep `npm run build` green. Mechanical, but touches ~14 factories + `initGpu.ts`. **The no-op guard tests (`starRenderer`/`planetRenderer`/`ringRenderer` depth-stencil) must stay green *unchanged* — each `resolveDepthCompare(<intent>, false)` returns the exact literal the test still asserts.**

**Per factory:** add a `reversedZ: boolean` param (beside the existing `depthFormat` param where one exists; for the pick + COSMO factories that hardcode their format, just add `reversedZ` — do **not** also thread `depthFormat`, per the Ground-preparation adjacent-finding note). Replace the literal `depthCompare: '...'` at each `depthStencil` block with `resolveDepthCompare(<its fixed intent>, reversedZ)`. Import `resolveDepthCompare` + `DepthIntent` as needed.

**Intent per site** — `atmosphereShellRenderer` → `'nearer-or-equal'` (currently `'less-equal'`); **every other site** → `'nearer'` (currently `'less'`). Sites (verify current line numbers):

NEAR0 (receive `SLAB_REVERSED_Z[NEAR0]` from `initGpu`):
- `bodies/planetRenderer.ts:183` — `'nearer'`
- `bodies/starRenderer.ts:148` — `'nearer'`
- `bodies/earthRenderer.ts:465` — `'nearer'`
- `bodies/texturedBodyRenderer.ts:221` — `'nearer'`
- `bodies/ringRenderer.ts:214` — `'nearer'`
- `bodies/cloudShellRenderer.ts:250` — `'nearer'` (leave the `depthBias` block `:266+` alone — its sign flips in the *feature* PR)
- `atmosphere/atmosphereShellRenderer.ts:397` — **`'nearer-or-equal'`**
- `bodies/bodyPickRenderer.ts:254` **and** `:310` — both `'nearer'` (two pipelines, one `reversedZ` param)
- `starCatalog/starCatalogPickRenderer.ts:131` — `'nearer'`
- `milkyWay/milkyWayPickRenderer.ts:158` — `'nearer'`

COSMO (receive `SLAB_REVERSED_Z[COSMO]` from `initGpu`):
- `galaxyCatalog/pickRenderer.ts:140` — `'nearer'`
- `galaxyCatalog/proceduralDiskRenderer.ts:201` — `'nearer'`
- `structureMarker/structureMarkerRenderer.ts:329` — `'nearer'`

**`initGpu.ts` call sites** — pass the slab's flag per renderer (import `SLAB_REVERSED_Z`, `NEAR0`, `COSMO` from `../frame/slabs`):
- NEAR0 body factories (`:427` star, `:428` planet, `:542` earth, `:553` texturedBody, `:567` ring, `:578` cloudShell, `:592` atmosphere): add `SLAB_REVERSED_Z[NEAR0]` **after** the existing `'depth32float'` arg (the param order is `(device, format, depthFormat, reversedZ, …)` — confirm each factory's exact arg list after editing it; `atmosphereShellRenderer` takes `ATMOSPHERE_PARAMS` last, so `reversedZ` slots before it).
- NEAR0 pick factories: `bodyPickRenderer` (`:479` — currently `createBodyPickRenderer(device)` → add `SLAB_REVERSED_Z[NEAR0]`), `starCatalogPickRenderer` (`:466-469` — add `SLAB_REVERSED_Z[NEAR0]`), `milkyWayPickRenderer` (`:234` — add `SLAB_REVERSED_Z[NEAR0]`).
- COSMO factories: `structureMarkerRenderer` (`:225-229`), `proceduralDiskRenderer` (`:291-297`, an `Init` object — add `reversedZ: SLAB_REVERSED_Z[COSMO]` to the object), `galaxyCatalog` `createPickRenderer` (find its `initGpu` call site — verify it exists and takes the new arg / object key).

> The point-cloud `pointRenderer`, `starPointRenderer`, `bodyGlintRenderer`, `starCatalogRenderer`, `orbitTrailRenderer`, `milkyWayCloudRenderer`, `filamentRenderer`, thumbnails etc. draw into **depthless** HDR targets (`depth: null`) — they have **no** `depthStencil` block and get **no** `reversedZ`. Only the ~14 sites above own depth.

**No new tests.** The existing per-renderer depth-stencil tests are the no-op guard (Global constraints) — they must pass **unmodified**.

**Steps:**
- [x] Add `reversedZ` param + `resolveDepthCompare(<intent>, reversedZ)` to each of the ~14 factories above (double-check `atmosphereShellRenderer` uses `'nearer-or-equal'`, all others `'nearer'`; `bodyPickRenderer` edits **both** pipelines).
- [x] Update every matching `initGpu.ts` call site to pass `SLAB_REVERSED_Z[NEAR0]` / `SLAB_REVERSED_Z[COSMO]`.
- [x] `npm run typecheck` clean; `npm run build` clean; `npm test` — the no-op guard renderer tests pass **unchanged**.
- [x] Commit (stage the touched renderer files + `initGpu.ts`).

---

## Task 6: Clear sites read `depthClearValueFor(slab.reversedZ)`

**Files:** modify `src/services/engine/frame/executeFrame.ts`, `src/services/engine/frame/pickProgram.ts`.

**`executeFrame.ts` — the `foreground:0` clear (`depthAttachment`, `:124-138`, literal `depthClearValue: 1` at `:134`):** `depthAttachment` is called from `renderGroup` (`:260`, `:279`), which holds the `view: SlabView` (`:251`). Thread the slab's flag in: add a `reversedZ: boolean` param to `depthAttachment` and pass `view.slab.reversedZ` at both call sites; replace `depthClearValue: 1` with `depthClearValue: depthClearValueFor(reversedZ)`. (In prep `view.slab.reversedZ` is `false` → `1`, byte-identical; `executeFrame.test.ts:510` stays green unchanged.)

**`pickProgram.ts` — the per-slab pick clear (`recordSlabPass`, `:200-205`, literal `depthClearValue: 1.0` at `:202`):** `recordSlabPass` already resolves `slabViewOf(ctx, slabIndex)` (`:188`) — read `.slab.reversedZ` off it and replace `depthClearValue: 1.0` with `depthClearValue: depthClearValueFor(view.slab.reversedZ)`. (`pickProgram.test.ts:356` stays green unchanged.)

**No new tests** — the two existing clear-value assertions are the no-op guard.

**Steps:**
- [x] `executeFrame`: thread `view.slab.reversedZ` into `depthAttachment`; clear via `depthClearValueFor`.
- [x] `pickProgram`: clear via `depthClearValueFor(view.slab.reversedZ)`.
- [x] `npm run typecheck` clean; `npm test -- executeFrame pickProgram` green **unchanged**.
- [x] Commit (stage both paths).

---

## Task 7: Prep-complete checkpoint (no-op proven green)

> **Single PR:** prep + feature land in ONE PR (user decision). This task is the
> mid-point checkpoint proving the derive-the-convention half is a byte-identical
> no-op **before** the feature plan flips the flag. Do NOT open a separate PR here;
> continue into the feature plan on the same branch. (The draft PR is opened when
> the first prep task lands — see execution setup.)

- [x] `npm test` — **entire** suite green (the no-op guard tests all pass unmodified; the three new helper/slab tests pass).
- [x] `npm run typecheck` — both tsconfigs clean.
- [x] `npm run build` — `tsc --noEmit` + `vite build` clean.
- [x] Confirm the no-op guard list (Global constraints) shows **zero diffs** to those test files in this branch — proof prep changed no descriptor.
- [ ] Proceed to `2026-07-20-reversed-z-near0-depth-feature.md` Task 1 on the same branch.

## Task order dependencies

- Tasks 1, 2 are independent (pure helpers).
- Task 3 before Task 4 (Task 4 passes the new `computeForegroundViewProj` param).
- Task 4 before Tasks 5, 6 (both read `Slab.reversedZ` / `SLAB_REVERSED_Z`).
- Task 5 needs `resolveDepthCompare` (Task 1); Task 6 needs `depthClearValueFor` (Task 2).
- Task 7 last.

## Interfaces produced by this plan

- **`@types/rendering/DepthIntent.d.ts`** — NEW: `export type DepthIntent = 'nearer' | 'nearer-or-equal'`.
- **`utils/gpu/resolveDepthCompare.ts`** — NEW: `resolveDepthCompare(intent: DepthIntent, reversedZ: boolean): GPUCompareFunction`.
- **`utils/gpu/depthClearValueFor.ts`** — NEW: `depthClearValueFor(reversedZ: boolean): number`.
- **`Slab.d.ts`** — `Slab` gains `reversedZ: boolean`.
- **`slabs.ts`** — NEW `SLAB_REVERSED_Z: Readonly<Record<number, boolean>>` (both `false`); `deriveSlabs` echoes it onto each `Slab` and passes the NEAR0 flag to `computeForegroundViewProj`.
- **`computeForegroundViewProj`** — input gains `reversedZ: boolean`, selecting `mat4d.perspectiveReverseZ` vs `mat4d.perspective`.
- **~14 depth-drawing renderer factories** — each gains a `reversedZ: boolean` param and derives `depthCompare` via `resolveDepthCompare(<fixed intent>, reversedZ)`; `initGpu.ts` passes `SLAB_REVERSED_Z[NEAR0|COSMO]` per renderer.
- **`executeFrame.ts` / `pickProgram.ts`** — depth clears derive from `depthClearValueFor(slab.reversedZ)`.
