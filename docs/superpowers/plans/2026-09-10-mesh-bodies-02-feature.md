# Mesh bodies — feature: whale and petunias in Earth orbit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A `MeshBody` scene body renders as a real, lit triangle mesh (the
whale and the petunia pot) attached to Earth's own body-slab row, searchable /
pickable / fly-to-able, with a static InfoCard description. Below 3 px
apparent diameter it is a tinted glint, exactly like a planet.

**Spec:** `docs/superpowers/specs/2026-09-10-mesh-bodies-design.md` — this plan
implements P3, P4, P5 of "Ground preparation" (P1/P2 already shipped via
`docs/superpowers/plans/2026-09-10-mesh-bodies-01-prep.md`) plus the whole
feature.

**Depends on:** the prep PR (P1/P2) merged to `main` — see "Prep contract" below.

> **RENAME NOTICE — read before touching `src/services/engine/frame/`.**
> `refactor(frame): ContentLayer → ContentPass (#674)` is merged: every
> `frame/passes/*Layer.ts` file is now `*Pass.ts` (`planetsLayer.ts` →
> `planetsPass.ts`, `texturedBodiesLayer.ts` → `texturedBodiesPass.ts`, etc.),
> the `ContentLayer` type is `ContentPass`, `CONTENT_LAYERS` is
> `CONTENT_PASSES`, and every pass's `enabled`/`draw` takes a resolved
> `SlabView` (a `pickEnabled`/`drawPick` pair sits alongside `enabled`/`draw`
> — `src/@types/engine/frame/ContentPass.d.ts:85-120`). **This plan is written
> against the post-rename names and shapes** (`meshBodiesPass.ts`,
> `MeshBodyRenderer` implementing `drawPick`, etc.).
>
> **Every citation below was re-verified against `origin/main` at
> `89d71643896ae493b57b518b2d961dec61fa265e` (2026-09-10)** — NOT against this
> worktree's tree, which sits on an older commit. Before executing, re-run
> `git log origin/main -- src/services/engine/frame/`: if a second rename has
> landed, translate every file/type name the same mechanical way and proceed —
> the architecture (per-body `'body'`-slab rows, `sceneBodyPartition`,
> `bodySlabFlooredPick`, `ctx.bodyPose`) is stable; only names may have moved.

## Prep contract (what `2026-09-10-mesh-bodies-01-prep.md` lands)

Read that plan's Definition of Done before starting Task 7 — this plan is
written against its output, not against today's `origin/main`:

- **`src/data/bodies/bodyPickRows.ts` exports
  `BODY_PICK_ROWS: Readonly<Record<BodyId, readonly { readonly id: string }[]>>`**
  — `PICK_SEEDS_BY_BODY_ID` moved verbatim (same five rows: `earth`, `planet`,
  `sun`, `sgr-a-star`, `s-star`), the value IS the seed array. No wrapper type,
  no stored source code: the code a row packs with is read off that row's own
  `SOURCE_ENTRIES` entry at the pack site. `PICK_SEEDS_BY_BODY_ID` no longer
  exists; `resolvePickTable`'s body arm reads
  `BODY_PICK_ROWS[entry.id as BodyId][pick.localIdx]`.
- **`sceneBodyPickId` becomes a scan** over the `type: 'body'` `SOURCE_ENTRIES`
  rows, packing with `entry.code` on the first `seedIndexOfBody` hit — the
  `sun` row deliberately SKIPPED (its seeds are drawn and stamped by the star
  layers as `Source.FamousStar`), with `starPickId(id)` unchanged as the tail
  fallback. **`starPickId.ts` is NOT deleted**, and `starPointsPass` /
  `starSpheresPass` are untouched. Task 7 therefore adds exactly ONE row and
  no pack-side edit at all — that is the whole point of the prep.
- **`orientationForBody` gated on `ROTATION_ELEMENTS` row presence** (via
  `rotationRowById`), not on `bodyTextureSpec(id)`. Without this every mesh
  body silently gets `IDENTITY_MAT3` and never tumbles.
- **`tests/data/bodies/rotationElements.test.ts` already carries no row-count
  assertion** — the prep plan deletes it. Task 6 does not need to.

## Task dependency table

| #   | Task                                                                                                     | Depends on                   | Parallelizable with |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------- |
| 1   | P5 — extract `rotateByTranspose`                                                                         | prep PR                      | 2, 3, 6, 8, 9, 14   |
| 2   | P3 — `bodySlabRow` near-plane widening                                                                   | prep PR                      | 1, 3, 6, 8, 9, 14   |
| 3   | P4 — partition widens + `MeshBody.d.ts`                                                                  | prep PR                      | 1, 2, 6, 8, 9, 14   |
| 4   | `meshAssets.generated.ts` + `BodyStore` slot + empty `SCENE_MESH_BODIES` + `sceneBodyPartition` widening | 3                            | 6, 8, 9, 14         |
| 5   | `meshBody` maker                                                                                         | 4                            | 6, 7, 8, 9, 14      |
| 6   | Orbit + rotation rows + the `SCENE_BODIES`→`BodyState` invariant                                         | prep PR only                 | 1–5, 7, 8, 9, 14    |
| 7   | `MESH_BODY_ENTRY` + registry row + pick tables + search aliases                                          | 4                            | 5, 6, 8, 9, 14      |
| 8   | Description threading (InfoCard)                                                                         | — (no `MeshBody` dependency) | 1–7, 9, 14          |
| 9   | `.mesh` decoder + `MeshReq`/`MeshAsset` types                                                            | —                            | 1–8, 14             |
| 10  | Tool: `buildMeshes` + helpers + `RAW_DATA`/`meshSources`                                                 | 4, 9                         | 11, 13, 14          |
| 11  | `meshFetcher`                                                                                            | 9                            | 10, 13, 14          |
| 12  | `meshSlotRegistry` + demand row + `meshBodyLoadRadius`                                                   | 5, 11, 15                    | 16                  |
| 13  | `bodyStateInHostFrame` + `meshBodiesAttachedTo` + `deriveSlabs` wiring                                   | 1, 2, 4, 6                   | 10, 11, 14, 15      |
| 14  | `sunVisibleFraction`                                                                                     | — (pure math)                | 1–13                |
| 15  | `meshBodyRenderer` + uniform packer + `EngineState.gpu` field                                            | 4, 9                         | 13, 14              |
| 16  | WESL shaders                                                                                             | 15                           | 12                  |
| 17  | `meshBodiesPass` + registration + pick + boot construction + `wireSlots`                                 | 7, 12, 13, 14, 15, 16        | —                   |
| 18  | Real seed rows (asset-gated) — provenance, tool run, perf, visual pass, credits                          | 5, 6, 10, 17                 | —                   |

Independent-worktree candidates at plan start: **{1, 2, 3, 8, 9, 14}** (all
touch disjoint files, none reads another's output), then **{4}** — the one
serializing hinge — unblocks **{5, 6, 7}** and, with 9, **{10, 11, 15}**; then
the rendering chain **{13, 15 → 16}** and **{12}** off 11+15 converge on
**{17}**, and finally the asset-gated **{18}** alone.

Sequencing note: Task 3 and Task 4 both edit
`src/services/engine/frame/sceneBodyPartition.ts`. To keep them disjoint,
**Task 3 does not touch that file at all** — it ships `MeshBody.d.ts` plus the
`partitionBodiesByPresentation` widening, and Task 4 (which introduces
`BodyStore.meshBodies`) makes the adapter edit in the same commit that makes
`state.data.bodies.meshBodies` exist. No stub, no `// TODO`.

## Global Constraints

- **Conventions:** `type` aliases never `interface`; one symbol per file in
  `src/utils/`/`src/@types/`/`tools/utils/`; deep relative imports, no
  barrels; comment budget (module header ≤ 10 lines, comment lines ≤ half the
  code lines); `Vec3`/`Mat3` aliases never raw tuples; explicit WebGPU
  bind-group layouts, never `'auto'`; stage specific paths on commit.
- **WESL (Task 16):** read `.claude/skills/wesl-shaders/SKILL.md` FIRST. No
  backticks in comments, `package::` import prefix, one import per line at
  the top of the file, no brace-list imports, label every GPU resource.
- **Testing (`docs/superpowers/conventions/testing.md`):** tests only where
  listed per-task below — this mirrors the spec's own "Testing" section
  exactly; do not add renderer/shader/tool-wiring unit tests beyond what is
  listed. No constant/registry restatements, no mirrors, no type-shape tests.
- **Asset sourcing is NOT a code task.** `data/raw/meshes/<key>/` gets real
  source GLBs ONLY after the user approves provenance (licence, URL, author,
  fetch date, checksum) — a separate human gate, not part of any task's
  "done" criterion until Task 18. Every earlier task that touches mesh
  content (the tool, the binary format, the maker) is written and tested
  against a **tiny synthetic GLB fixture built in-test via
  `@gltf-transform/core`**, never the real assets.
- **Perf (Task 18):** `npm run perf` before AND after, per the `perf` skill —
  in this worktree, pass `--url` for this worktree's own dev-server port
  (read the `Local:` line of `npm run dev`'s output). A neutral-or-negative
  measurement halts the landing pipeline; land/park is the user's ruling.
- **`npm run typecheck:fast` is the inner-loop check; confirm every task's
  final state against real `npx tsc --noEmit` before committing** (per
  CLAUDE.md, `tsgo` is an exact-pinned dev build, not the CI gate).

### Standing landmines (repeated in the tasks they bite)

1. **The model matrix is f64 and eye-relative.** Every mesh vertex is placed
   through the `bodyRelativePose` seam — host-frame metres, composed in f64,
   narrowed to f32 only at the staging-buffer write. NEVER build it in f32,
   and never from a heliocentric Mpc position directly (Tasks 13, 15, 17).
2. **Normal maps decode LINEAR, never sRGB** — the same rule
   `isLinearTextureKind` already encodes for the planet-texture pipeline. Both
   the tool's PNG write (Task 10) and the fetcher's `createImageBitmap`
   (Task 11, `colorSpaceConversion: 'none'`) must honour it.
3. **No shadow map of any kind.** Umbra/penumbra is the analytic
   `sunVisibleFraction` scalar (Task 14), Earthshine an analytic fill term
   (Task 16). No depth pass, no light-space matrix, no cascade.
4. **A missing normal map is substituted at BAKE time, not at runtime.** The
   tool writes a 1×1 flat normal, prints a warning naming the asset, and sets
   `normalMapSubstituted: true` on the generated row (Task 10). The runtime
   has exactly ONE path: three textures, always present. No header flag, no
   `if (hasNormalMap)` branch in the shader or renderer.
5. **The runtime never parses glTF.** `@gltf-transform/*` is a `tools/`-only
   devDependency; the browser bundle sees only `.mesh` + three PNGs
   (Tasks 9, 10, 11).
6. **Attached mesh bodies draw in the HOST's `body-m` slab row.** They never
   get a row of their own: `slabBodyCandidates`
   (`src/services/engine/frame/frameContext.ts:204-207`) and
   `BODY_SLAB_CAPACITY` (`frameProgram.ts:89`) are **untouched by this plan**.
   A diff that edits either has taken the wrong turn (Tasks 13, 17).
7. **`description?` is a THIRD, independent field.** It threads
   `BodyInfo` → `SelectionRow` → `extractSelectionRow` → `buildFocusable` →
   `BodyDetailCard`. It must never route through `BODY_FACTS` or the
   `famous_stars_meta.json` sidecar — both stay keyed to their own body sets
   (Task 8).

---

## Task 1 — P5: extract `rotateByTranspose`

**Files:**

- Create `src/utils/math/rotateByTranspose.ts`
- Create `tests/utils/math/rotateByTranspose.test.ts`
- Modify `src/services/engine/camera/bodyRelativePose.ts` (the private
  `rotateByTranspose`, comment + declaration at lines 18-27; drop it, import
  the extracted one)

**Interfaces — Produces:**

```ts
// src/utils/math/rotateByTranspose.ts
// orientationᵀ · v — orientation is orthonormal, so its transpose is its
// inverse; column c of a transpose is row c of the original, so this is the
// three column·v dot products with no separate transpose step.
export function rotateByTranspose(orientation: Readonly<Mat3>, v: Readonly<Vec3>): Vec3;
```

Identical body to the one being extracted (`bodyRelativePose.ts:21-27`) — a
pure move, not a rewrite. `bodyRelativePose.ts` imports it and drops its own
private declaration; every one of its four call sites
(`bodyRelativePose.ts:47, 49-53, 54, 55-59`) is unchanged syntactically (same
name, same arg order).

- [ ] Add the test `rotateByTranspose applies the inverse rotation` to
      `tests/utils/math/rotateByTranspose.test.ts`: hand-compute the expected
      vector for a non-identity `Mat3` (e.g. a 90° rotation about one axis)
      independently of the function under test (rotate by hand, don't call
      `multiply3x3`/the function itself to build the expectation). Add
      `rotateByTranspose returns v unchanged under the identity` as a second
      case.
- [ ] Extract the function into `src/utils/math/rotateByTranspose.ts`.
- [ ] Update `bodyRelativePose.ts` to import and drop the local declaration;
      trim the module header's rotate-by-transpose parenthetical if it now
      duplicates the extracted file's own docblock.
- [ ] `npm test -- rotateByTranspose bodyRelativePose` — new test green,
      `bodyRelativePose`'s existing suite (`tests/services/engine/camera/bodyRelativePose.test.ts`)
      unchanged and green (this IS the extraction's own regression proof —
      see spec's Testing section: "P5 is a pure extraction, so
      `bodyRelativePose`'s existing tests staying green is its test").
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/utils/math/rotateByTranspose.ts`,
      `tests/utils/math/rotateByTranspose.test.ts`,
      `src/services/engine/camera/bodyRelativePose.ts`.

---

## Task 2 — P3: `bodySlabRow` near-plane widening

**Files:**

- Modify `src/services/engine/frame/slabs.ts` (`bodySlabRow` at lines 234-332
  of the current file; the `near` computation at line 284; `SLAB_REVERSED_Z`
  at line 175 is read, not touched)
- Modify `tests/services/engine/frame/slabs.test.ts`

**Interfaces — Consumes:** nothing new (no import of `bodyStateInHostFrame` or
`meshBodiesAttachedTo` — those don't exist yet; see Task 13, which is where
`deriveSlabs` is wired to actually SUPPLY this data every frame). This task
only widens `bodySlabRow`'s own signature and proves the near-plane maths
against hand-built fixture data.

**Produces (signature delta):**

```ts
// src/services/engine/frame/slabs.ts — bodySlabRow's input grows one optional field
function bodySlabRow(input: {
  readonly body: SceneBody;
  readonly pose: BodyPoseProvider;
  readonly fovYRad: number;
  readonly aspect: number;
  readonly viewportPx: Readonly<Vec2>;
  /**
   * Mesh bodies riding THIS row's slab (see `meshBodiesAttachedTo`, Task 13):
   * already resolved into this host's fixed-axis frame, in metres. Each
   * face is `|posM − eyeRelBodyM| − radiusM`; the row's `near` is lowered to
   * the nearest such face when it undercuts the host's own margin.
   */
  readonly attachedBodies?: readonly {
    readonly posM: Readonly<Vec3>;
    readonly radiusM: number;
  }[];
}): /* return shape unchanged */
```

`deriveSlabs` (`slabs.ts:368`) and its one `bodySlabRow` call site
(`slabs.ts:453`) are UNCHANGED in this task — `attachedBodies` is simply
never passed, so `deriveSlabs`'s output is byte-identical to today for every
existing body (behavioral no-op, matching the spec's "P1 to P4 are growth...
the joints already exist").

**Behavior:** after computing `near` exactly as today (the
`viewZ`/`marginM`/altitude-term `Math.max(...)` at line 284), fold in each
attached body: `faceM = hypot(posM − eyeRelBodyM) − radiusM`; the row's
`near` becomes `Math.max(Math.min(near, ...faceMValues), MIN_NEAR_M)` when
`attachedBodies` is non-empty — i.e. an attached body's near face LOWERS
`near` only when it undercuts the host's own margin, floored the same way
the host's own `near` already is. `eyeRelBodyM` is already in scope in this
function (destructured from `relPose` at line 252).

- [ ] Add the failing test `bodySlabRow lowers near for an attached body
ahead of the host` to `tests/services/engine/frame/slabs.test.ts`
      (model the fixture on this file's existing `bodySlabRow`/`deriveSlabs`
      cases — a camera pose at a known altitude, a host body, and an
      `attachedBodies` entry whose `posM` sits ~50 m closer to the eye than
      the host's own near margin) asserting the returned `near` is `< 50`
      (in metres) — strictly less than what the same fixture produces with
      `attachedBodies` omitted.
- [ ] Add `bodySlabRow leaves near unchanged for an attached body behind the
host` — same fixture, `posM` placed on the FAR side of the host
      (beyond the host's own drawn radius along view-axis), asserting `near`
      is unchanged from the no-`attachedBodies` case.
- [ ] Run — both fail (current `bodySlabRow` has no `attachedBodies` param).
- [ ] Implement the widening.
- [ ] Run — both green; the rest of `slabs.test.ts` (every existing
      `bodySlabRow`/`deriveSlabs` case, called with no `attachedBodies`)
      stays green unmodified — the no-op proof.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/services/engine/frame/slabs.ts`,
      `tests/services/engine/frame/slabs.test.ts`.

---

## Task 3 — P4: partition widens to a fourth `meshes` branch (+ `MeshBody.d.ts`)

**Files:**

- Create `src/@types/scene/MeshBody.d.ts`
- Modify `src/services/engine/frame/partitionBodiesByPresentation.ts`
  (currently 114 lines; the exported function at 72-114, `BODY_GLINT_MAX_PX`
  at 48)
- Modify `tests/services/engine/frame/partitionBodiesByPresentation.test.ts`

**NOT in this task:** `src/services/engine/frame/sceneBodyPartition.ts`
(currently 57 lines; the `bodies:` argument at line 44) — its widening rides
Task 4's commit, because it reads `state.data.bodies.meshBodies`, which Task 4
is what creates. `sceneBodyPartition` has no dedicated test file today (it is
a thin adapter); none is added.

**Interfaces — Produces:**

```ts
// src/@types/scene/MeshBody.d.ts — exact spec text, verbatim
export type MeshBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number;
  readonly albedo: Vec3;
  readonly meshKey: string;
  readonly description: string;
};
```

```ts
// partitionBodiesByPresentation.ts — signature delta
export function partitionBodiesByPresentation(input: {
  bodies: readonly (PlanetBody | MeshBody)[]; // was: readonly PlanetBody[]
  bodyStates: ReadonlyMap<string, BodyState>;
  camPosMpc: Readonly<Vec3>;
  viewportHeightPx: number;
  fovYRad: number;
  isTextureResident: (id: string) => boolean;
}): {
  glints: readonly (PlanetBody | MeshBody)[];
  flat: readonly PlanetBody[];
  textured: readonly PlanetBody[];
  meshes: readonly MeshBody[]; // NEW
};
```

**Behavior:** for each body, after the existing sub-pixel gate (`!resolved →
glints`, unchanged), route on TYPE before the texture-residency check — a
`MeshBody` at or above `BODY_GLINT_MAX_PX` always lands in `meshes` (it
carries no `bodyTextureSpec` entry, so under the OLD branch order it would
silently fall into `flat`; routing on type first is the fix). Discriminate
`MeshBody` from `PlanetBody` structurally (`'meshKey' in body`) — no new enum
or tag field, matching the file's existing "never an `if (id === …)` chain"
discipline.

- [ ] Add `MeshBody.d.ts`.
- [ ] Add the failing test `partitionBodiesByPresentation routes a
sub-pixel MeshBody to glints` (fixture: one `MeshBody`, apparent
      diameter below `BODY_GLINT_MAX_PX`) to
      `tests/services/engine/frame/partitionBodiesByPresentation.test.ts`.
- [ ] Add `partitionBodiesByPresentation routes a resolved MeshBody to
meshes, never textured or flat` (same body, apparent diameter at/above
      the threshold) — asserts it lands in `meshes` and is absent from
      `flat`/`textured`.
- [ ] Add `partitionBodiesByPresentation keeps the four branches disjoint
and covering` over a fixture mixing a resolved `PlanetBody`
      (textured), a resolved `PlanetBody` (flat), a sub-pixel `PlanetBody`
      (glint), and a resolved `MeshBody` (mesh) — assert every input body
      appears in exactly one output array.
- [ ] Run — new cases fail.
- [ ] Implement the widened `partitionBodiesByPresentation` + `MeshBody`
      discriminant.
- [ ] Run — all green; every existing case in
      `partitionBodiesByPresentation.test.ts` stays green unmodified (a
      `PlanetBody`-only input still partitions three ways, `meshes` empty).
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/@types/scene/MeshBody.d.ts`,
      `src/services/engine/frame/partitionBodiesByPresentation.ts`, the test
      file.

---

## Task 4 — `meshAssets.generated.ts` contract + `BodyStore` slot + empty `SCENE_MESH_BODIES`

**Files:**

- Create `src/data/bodies/meshAssets.generated.ts` (empty table — see below)
- Create `src/data/bodies/sceneMeshBodies.ts` (empty seed list — see below)
- Modify `src/@types/scene/SceneBody.d.ts` (import block at 15-18, the union
  at line 20)
- Modify `src/@types/engine/data/BodyStore.d.ts` (add the fourth slot; the
  type is lines 27-40)
- Modify `src/data/bodies/sceneBodies.ts` (append `...SCENE_MESH_BODIES`,
  lines 22-28)
- Modify `src/services/engine/frame/sceneBodyPartition.ts` (Task 3's deferred
  half: widen `bodies` to
  `[...state.data.bodies.planets, ...state.data.bodies.meshBodies]` at line
  44, and widen the declared return shape with `meshes`)
- Modify wherever `state.data.bodies.setPlanets(SCENE_PLANETS)` is called at
  boot (grep for `setPlanets(` — add the sibling `setMeshBodies` call beside
  it)

**Interfaces — Produces:**

```ts
// src/data/bodies/meshAssets.generated.ts — exact spec shape, EMPTY content
// !!! GENERATED FILE, DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-meshes
// Source of truth:  data/raw/meshes/**
export type MeshAssetRow = {
  readonly key: string;
  readonly path: string;
  readonly boundingRadiusM: number;
  readonly meanAlbedo: Vec3;
  readonly triangleCount: number;
  readonly normalMapSubstituted: boolean;
  readonly source: string;
  readonly licence: string;
  readonly attribution: string; // author + URL; empty string for CC0
};
export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = {};
```

`attribution` is load-bearing, not decoration: the spec permits CC0 **or**
CC BY 4.0 sources, and a CC BY asset must be credited. Carrying author+URL on
the generated row is what lets the credit surface (Task 18) read one table
instead of a second hand-maintained list that can drift from the assets.
Empty string means CC0 / no attribution required.

The file is committed EMPTY (no 'whale'/'petunias' keys) — legitimate,
type-correct, and asset-free. Task 10's tool run (against the human-approved
assets, Task 18) is the only thing that ever writes real rows into it; this
task only establishes the type + an empty starting table so every downstream
consumer typechecks now.

```ts
// src/data/bodies/sceneMeshBodies.ts — EMPTY seed list, asset-free
export const SCENE_MESH_BODIES: readonly MeshBody[] = [];
```

Task 18 is the only task that adds real entries here (see that task).

```ts
// src/@types/scene/SceneBody.d.ts
export type SceneBody = EarthBody | StarBody | PlanetBody | AnchorPointBody | MeshBody;
```

```ts
// src/@types/engine/data/BodyStore.d.ts — delta
export type BodyStore = {
  readonly stars: readonly StarBody[];
  readonly planets: readonly PlanetBody[];
  readonly meshBodies: readonly MeshBody[]; // NEW
  readonly earth: EarthBody | null;
  setStars(s: readonly StarBody[]): void;
  setPlanets(p: readonly PlanetBody[]): void;
  setMeshBodies(m: readonly MeshBody[]): void; // NEW
  setEarth(e: EarthBody | null): void;
};
```

```ts
// sceneBodyPartition.ts — the adapter's widened return shape (input widens to
// [...planets, ...meshBodies]); mirrors Task 3's partition signature.
export function sceneBodyPartition(
  state: EngineState,
  ctx: ReadyFrameContext,
): {
  glints: readonly (PlanetBody | MeshBody)[];
  flat: readonly PlanetBody[];
  textured: readonly PlanetBody[];
  meshes: readonly MeshBody[];
};
```

- [ ] Add `meshAssets.generated.ts` (empty `MESH_ASSETS`).
- [ ] Add `sceneMeshBodies.ts` (empty `SCENE_MESH_BODIES`).
- [ ] Widen `SceneBody` union.
- [ ] Widen `BodyStore` + its concrete implementation (grep for the factory
      that builds the `BodyStore` closure — mirror `setPlanets`'s shape for
      `setMeshBodies`).
- [ ] Append `...SCENE_MESH_BODIES` to `SCENE_BODIES` (`sceneBodies.ts`).
- [ ] Call `state.data.bodies.setMeshBodies(SCENE_MESH_BODIES)` at boot,
      beside the existing `setPlanets(SCENE_PLANETS)` call.
- [ ] Widen `sceneBodyPartition.ts` (Task 3's deferred half) now that
      `state.data.bodies.meshBodies` exists.
- [ ] `npm test` — no existing test should break (an empty `SCENE_MESH_BODIES`
      changes nothing observable: `SCENE_BODIES.length` is unchanged,
      `BodyStore.meshBodies` is `[]`). No NEW test is required by this task
      — it is pure plumbing with nothing to assert beyond "the app still
      builds and boots," which `npm run build` covers.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit all files above together (they are one coherent, indivisible
      wiring change).

---

## Task 5 — `meshBody` maker

**Files:**

- Create `src/data/bodies/makers/meshBody.ts`
- Create `tests/data/bodies/makers/meshBody.test.ts`

**Interfaces — Consumes:** `MESH_ASSETS` (`data/bodies/meshAssets.generated`),
`MeshAssetRow`, `MeshBody`.

**Produces:**

```ts
// src/data/bodies/makers/meshBody.ts
export type MeshBodySeed = {
  readonly id: string;
  readonly label: string;
  readonly meshKey: string;
  readonly description: string;
};
export function meshBody(seed: MeshBodySeed): MeshBody;
```

**Behavior:** looks up `MESH_ASSETS[seed.meshKey]`; on a hit, returns
`{ id: seed.id, label: seed.label, meshKey: seed.meshKey, description:
seed.description, radiusM: asset.boundingRadiusM, albedo: asset.meanAlbedo
}`; on a miss, throws (mirror `findByIdOrThrow`'s throw-at-import-time
posture — an authoring mistake, or a seed added before its asset landed,
belongs at the site that made the mistake, not silently downstream).

- [ ] Add the failing test `meshBody joins a seed with its MESH_ASSETS row`
      to `tests/data/bodies/makers/meshBody.test.ts`: `vi.mock` the
      `meshAssets.generated` module with a fixture `MESH_ASSETS` (one
      synthetic key, e.g. `'test-mesh'`, with a made-up `boundingRadiusM`/
      `meanAlbedo`), call `meshBody({ id: 'x', label: 'X', meshKey:
'test-mesh', description: '…' })`, assert the returned `radiusM`/
      `albedo` equal the fixture row's `boundingRadiusM`/`meanAlbedo`. The
      bug this catches is a crossed field mapping, which no compiler check
      sees (both sides are `number`/`Vec3`).
- [ ] Add `meshBody throws for an unknown meshKey` — same mock, a seed
      naming a key absent from the fixture table.
- [ ] Run — fails (file doesn't exist).
- [ ] Implement `meshBody.ts`.
- [ ] Run — both green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/data/bodies/makers/meshBody.ts`,
      `tests/data/bodies/makers/meshBody.test.ts`.

---

## Task 6 — Orbit + rotation rows

**Files:**

- Create `src/utils/orbit/periodDaysFromSemiMajorKm.ts`
- Create `tests/utils/orbit/periodDaysFromSemiMajorKm.test.ts`
- Modify `src/data/bodies/orbitalElements.ts` (append two rows via the
  `satellite` maker, `focusId: 'earth'`)
- Modify `src/data/bodies/rotationElements.ts` (append two rows to
  `ROTATION_ELEMENTS`)
- Create `tests/data/bodies/orbitalElements.meshBodies.test.ts` (or extend an
  existing orbit-rows test file if one already covers moon rows similarly —
  grep `tests/data/bodies/orbitalElements.test.ts` first)

**Interfaces — Produces:**

```ts
// src/utils/orbit/periodDaysFromSemiMajorKm.ts
// Kepler's third law against Earth's GM: T = 2π√(a³ / GM). Earth GM =
// 398600.4418 km³/s² (EGM2008 / WGS84 value, the standard geodesy constant).
export function periodDaysFromSemiMajorKm(semiMajorKm: number): number;
```

**Behavior — orbit rows:** both go through the `satellite` maker
(`src/data/bodies/makers/satellite.ts:38-53`), exactly as every moon row does.
That maker's input takes **`semiMajorKm`, not `semiMajorMpc`** — it applies
`SCALE_UNITS.KM_TO_MPC` itself (`satellite.ts:57`) — so the rows pass
`semiMajorKm: SCENE_EARTH.radiusM / 1000 + 400` (`SCENE_EARTH.radiusM =
6371000`, `src/data/bodies/sceneEarth.ts:21`), which is the spec's
`(radiusM + 400_000) * M_TO_MPC` by the time the maker is done. Other fields:
`eccentricity: 0`; `periodDays` from `periodDaysFromSemiMajorKm` on the same
value; `poleRaDeg`/`poleDecDeg` = Earth's own equatorial pole (the whale/pot
need no distinct orbit plane); `apsidalPrecessionYears` /
`nodalPrecessionYears: 0` — safe, because `moonRatesFromPeriods` floors any
period below `MIN_PRECESSION_YEARS` to a zero rate rather than dividing by
≈0 (`src/utils/orbit/moonRatesFromPeriods.ts:53, 64-67`); and `color: Vec3`,
which the maker requires and `orbitTrailsPass` draws the trail ring with
(see Task 18's keep/suppress decision on those rings).

The petunia row's `meanAnomalyDeg` differs from the whale's by a small offset
— the spec's authored "roughly 40 m behind the whale along the orbit", i.e.
`40 / (2π × semiMajorMetres) × 360` degrees, the direct arc-length
approximation at this near-circular radius.

**Behavior — rotation rows:** two new `ROTATION_ELEMENTS` entries, `id:
'whale'` / `id: 'petunias'`, tumble poles (any non-degenerate `poleRaDeg`/
`poleDecDeg` pair — these are decorative, not physically measured, so pick
values that visibly tumble rather than spin about a screen-aligned axis),
`spinRateDegPerDay` for roughly one turn per 3 minutes (whale:
`360 / (3 / 1440)` deg/day) and faster for the pot.

- [ ] Add the failing test `periodDaysFromSemiMajorKm matches a known LEO
period` to `tests/utils/orbit/periodDaysFromSemiMajorKm.test.ts`: a
      hand-computed expectation for a semi-major axis near Earth's radius +
      400 km (ISS-altitude), asserting the result is close to the
      well-known ~92.68-minute ISS period (converted to days) — an
      independent, textbook-value check, not a formula mirror.
- [ ] Run — fails.
- [ ] Implement `periodDaysFromSemiMajorKm`.
- [ ] Run — green.
- [ ] Append the two `ORBITAL_ELEMENTS` rows and two `ROTATION_ELEMENTS`
      rows.
- [ ] Confirm `tests/data/bodies/rotationElements.test.ts` no longer carries
      the `toHaveLength(15)` count restatement — the prep plan deletes it (its
      DoD says so). If it is somehow still there, delete it rather than
      bumping the number: it is the registry-count-restatement pattern
      `docs/superpowers/conventions/testing.md` says to remove. The same
      block's duplicate-id and declination-range checks are structural
      invariants and stay.
- [ ] Add the failing test `the petunia pot trails the whale by the authored
mean-anomaly offset at epoch` (spec's own Testing-section item):
      `deriveBodyStates(CONST_J2000)`, read both bodies' `meanAnomalyRad`,
      assert the difference equals the authored offset (radians), and that
      both bodies' `positionMpc` differ from Earth's own by approximately
      `(SCENE_EARTH.radiusM + 400_000) * SCALE_UNITS.M_TO_MPC` in magnitude
      (a physical sanity check: they're both in a ~400 km orbit, not on top
      of Earth or off at some other radius).
- [ ] Add the failing test `every SCENE_BODIES id resolves a BodyState` —
      the spec's own Testing-section item, guarding
      `extractSelectionRow.ts:56`'s non-null assertion
      (`deriveBodyStates(simDays).get(body.id)!`). Iterate `SCENE_BODIES`,
      assert `deriveBodyStates(CONST_J2000).get(body.id)` is defined for
      every row. It is trivially green for today's bodies and becomes
      load-bearing the moment a seed row is added without its
      `ORBITAL_ELEMENTS` / `SCENE_ANCHORS` counterpart — exactly the mistake
      Task 18 could make. Home it beside the orbit-rows test.
- [ ] Run — green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/utils/orbit/periodDaysFromSemiMajorKm.ts`,
      `tests/utils/orbit/periodDaysFromSemiMajorKm.test.ts`,
      `src/data/bodies/orbitalElements.ts`,
      `src/data/bodies/rotationElements.ts`, the orbit-rows test.

---

## Task 7 — `MESH_BODY_ENTRY` + `SOURCE_REGISTRY` + `BODY_PICK_ROWS` + search aliases

> **RULED — not an open question.** One `Source.MeshBody` registry row covers
> both bodies, `bearsLabel: true`. That means a single SHARED caption toggle
> in Labels & Guides muting the whale and the petunias together, exactly as
> today's one "Planet" row mutes every planet together. A per-body split would
> need a second registry entry; it is out of scope.

**Files:**

- Create `src/data/sources/mesh-body.ts`
- Modify `src/data/source.ts` (append `MeshBody: 32` after `McpmWorkbench: 31`
  at line 250)
- Modify `src/data/sources.ts` — **the step that makes all of this real**:
  `import { MESH_BODY_ENTRY } from './sources/mesh-body'` beside the other
  `*_ENTRY` imports (lines 64-95) and add `[Source.MeshBody]: MESH_BODY_ENTRY`
  to `SOURCE_REGISTRY` (line 132ff). Everything downstream is derived from
  this one row: `BodyId` (`src/@types/data/body/BodyId.d.ts:11` extracts
  `type: 'body'` rows), `BODY_IDS` (`src/data/bodies/bodyIds.ts:14`),
  `LABEL_CATEGORIES`, and the `settings.bodies.items['mesh-body']` seed.
  Omitting it means `MESH_BODY_ENTRY` compiles and does nothing.
- Modify `src/data/bodies/bodyPickRows.ts` (the prep PR's `BODY_PICK_ROWS`) —
  add ONE row, a bare array: `'mesh-body': SCENE_MESH_BODIES`. Nothing in
  `resolvePickTable.ts` or `sceneBodyPickId.ts` needs touching: the unpack arm
  indexes this table, and the pack scan reads the code off `MESH_BODY_ENTRY`
  itself.
- Modify `src/data/bodies/bodySearchNames.ts` (`AUTHORED` array, lines 20-25)

**Interfaces — Produces:**

```ts
// src/data/sources/mesh-body.ts — mirrors planet.ts (src/data/sources/planet.ts:4-29)
export const MESH_BODY_ENTRY = {
  type: 'body',
  code: Source.MeshBody,
  id: 'mesh-body',
  label: 'Mesh body',
  allSky: true,
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Mesh body',
  shortLabel: 'Mesh body',
  plural: 'Mesh bodies',
} as const satisfies BodySourceEntry;
```

`label`/`plural` are what the shared Labels & Guides checkbox reads, so they
name the CATEGORY, not the two occupants — "Whale & Petunias" would read as a
per-body toggle, which this row deliberately is not.

The new `BODY_PICK_ROWS` row's value is `SCENE_MESH_BODIES` — the empty array
from Task 4, real once Task 18 lands; the row's correctness does not depend on
its contents. The row is picked up by `sceneBodyPickId`'s scan automatically
and packs with `MESH_BODY_ENTRY.code`; unlike the `sun` row it is NOT skipped,
because `meshBodiesPass.drawPick` stamps its own picks rather than borrowing a
star layer's code. `BODY_SEARCH_NAMES.AUTHORED` gains `['whale', ['whale']]` and
`['petunias', ['petunias', 'bowl of petunias', 'oh no not again']]`.

- [ ] Add `mesh-body.ts`.
- [ ] Append `Source.MeshBody = 32` with a docblock line matching the
      density of `McpmWorkbench`'s (`source.ts:240-250`) — note the budget:
      after this row, codes 33..62 remain.
- [ ] Register `MESH_BODY_ENTRY` in `SOURCE_REGISTRY` (`src/data/sources.ts`).
- [ ] Add the `'mesh-body'` row to `BODY_PICK_ROWS`.
- [ ] Add the two `AUTHORED` tuples to `bodySearchNames.ts`.
- [ ] No new test: `BODY_PICK_ROWS` is an exhaustively-typed
      `Record<BodyId, readonly { id: string }[]>` — a missing `'mesh-body'`
      row is a `tsc`
      error the moment the registry row widens `BodyId`, not a runtime bug a
      test would catch (the totality check IS the compiler), and restating
      the entry list back at itself is the registry-restatement anti-pattern
      (`conventions/testing.md`). The prep plan's
      `no id appears in two rows' seed tables` invariant already covers the
      new row structurally. `sceneBodyPickId.test.ts` /
      `resolvePickTable.test.ts` stay green unmodified — an empty
      `SCENE_MESH_BODIES` means the scan never matches, so the row is inert
      until Task 18.
- [ ] `npx tsc --noEmit` clean — confirms `BodyId` widened and every
      `Record<BodyId, …>` table stayed total.
- [ ] `npm test` — the settings-slice suite in particular: registering the row
      seeds a new `settings.bodies.items['mesh-body']` entry
      (`src/state/settings/initialState.ts:239-246`) and a new
      `LABEL_CATEGORIES` row. Any test that pins the full body-items key set
      or the category list is a registry restatement — DELETE it rather than
      updating the literal (`conventions/testing.md`).
- [ ] Commit all five files.

---

## Task 8 — Description threading to the InfoCard

**Files:**

- Modify `src/@types/engine/BodyInfo.d.ts` (add `description?: string` after
  `orbit`, around line 31)
- Modify `src/@types/engine/SelectionRow.d.ts` (body arm, lines 28-41 — add
  `description?: string`)
- Modify `src/services/engine/helpers/extractSelectionRow.ts` (body arm,
  lines 51-67)
- Modify `src/services/engine/helpers/buildFocusable.ts` (body arm, lines
  39-49)
- Modify `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx` (new
  block after line 227, before the closing `</>` at line 228)
- Modify `tests/services/engine/helpers/extractSelectionRow.test.ts`
- Modify `tests/services/engine/helpers/buildFocusable.test.ts`

**Interfaces — Produces:**

```ts
// BodyInfo.d.ts — delta
export type BodyInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusM: number;
  readonly orbit?: BodyOrbitInfo;
  readonly description?: string; // NEW
};
```

```ts
// SelectionRow.d.ts — body arm delta (same shape as standoffRadii/focusDistanceRadii)
| {
    readonly type: 'body';
    readonly id: string;
    readonly label: string;
    readonly positionMpc: Vec3;
    readonly radiusM: number;
    readonly standoffRadii?: number;
    readonly focusDistanceRadii?: number;
    readonly description?: string; // NEW
  }
```

**Behavior:** `extractSelectionRow.ts`'s body arm reads `body.description`
off `SCENE_BODIES` the same `'description' in body ? body.description :
undefined` idiom it already uses for `standoffRadii`/`focusDistanceRadii`
(lines 51-67). `buildFocusable.ts`'s body arm carries `description:
row.description` into the `BodyInfo` literal (lines 39-49).
`BodyDetailCard.tsx` renders a THIRD, independent block —
`{target.description && <div className={styles.cardSection}><DescriptionBlock
text={target.description} /></div>}` — placed after the existing
`facts?.description` block (lines 223-227) and before the fragment's closing
tag (line 228). `target.description` must NOT reuse `facts?.description`'s
condition or `BODY_FACTS`/`famous_stars_meta.json` — it is synchronous,
compiled-in `SceneBody` data, independent of both existing description
paths (per the spec's explicit "a third, independent field" framing).

- [ ] Add the failing test `extractSelectionRow carries a body's description
when present` to `tests/services/engine/helpers/extractSelectionRow.test.ts`
      — `vi.mock` `data/bodies/sceneBodies` with a `SCENE_BODIES` fixture
      carrying one `MeshBody`-shaped row (`description` set) plus its
      `ORBITAL_ELEMENTS` counterpart, asserting the extracted
      `SelectionRow.description` matches; add `extractSelectionRow omits
description when absent` against a real body with no `description`
      (Earth), asserting `undefined`. The `in`-operator narrowing is what is
      under test — a wrong idiom silently returns `undefined` for every body.
- [ ] Add the failing test `buildFocusable carries description through to
BodyInfo` to `tests/services/engine/helpers/buildFocusable.test.ts` —
      same fixture shape, asserting `BodyInfo.description` round-trips.
- [ ] Run — both fail.
- [ ] Implement the four type/logic deltas.
- [ ] Run — both green.
- [ ] Add the `target.description` block to `BodyDetailCard.tsx`. No new
      component test — the spec's Testing section lists none for this block,
      and a "renders the text it was handed" assertion is a mirror. Confirm
      no existing `BodyDetailCard` test regresses.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit all files above.

---

## Task 9 — `.mesh` decoder + the loading types (the encoder is Task 10)

**Files:**

- Create `src/data/mesh/meshBinaryFormat.ts` (header constants + `decodeMesh`
  — the RUNTIME reader, mirroring `src/data/filament/filamentBinaryFormat.ts`'s
  `decodeFilaments`)
- Create `src/@types/loading/MeshReq.d.ts`
- Create `src/@types/data/mesh/MeshAsset.d.ts`
- Create `tests/data/mesh/meshBinaryFormat.test.ts`

**Interfaces — Produces:**

```ts
// src/@types/loading/MeshReq.d.ts
export type MeshReq = { readonly meshKey: string };
```

```ts
// src/@types/data/mesh/MeshAsset.d.ts — mirrors FilamentCloud's role: the
// de-interleaved geometry arrays from the .mesh buffer, plus the three
// decoded textures.
export type MeshAsset = {
  readonly boundingRadiusM: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positions: Float32Array; // vertexCount * 3
  readonly normals: Float32Array; // vertexCount * 3
  readonly tangents: Float32Array; // vertexCount * 4, w = handedness
  readonly uvs: Float32Array; // vertexCount * 2
  readonly indices: Uint32Array; // indexCount
  readonly albedo: ImageBitmap;
  readonly metalRough: ImageBitmap;
  readonly normalMap: ImageBitmap;
};
```

```ts
// src/data/mesh/meshBinaryFormat.ts
// Header (little-endian): magic 'SKMH' (u8x4), version (u16), vertexCount
// (u32), indexCount (u32), boundingRadiusM (f32) = 18 bytes, then
// vertexCount interleaved vertices at 48-byte stride (pos f32x3, normal
// f32x3, tangent f32x4, uv f32x2), then indexCount u32 indices. Exact
// table: spec "Assets and the binary format" -> ".mesh binary format".
export const MESH_MAGIC: string; // 'SKMH'
export const MESH_VERSION: number;
export const MESH_HEADER_BYTES: number; // 18 — see the alignment landmine
export const MESH_VERTEX_STRIDE_BYTES: number; // 48
export type DecodedMeshGeometry = Omit<MeshAsset, 'albedo' | 'metalRough' | 'normalMap'>;
export function decodeMesh(buf: ArrayBuffer): DecodedMeshGeometry;
```

**Behavior:** `decodeMesh` throws on bad magic and on unsupported version
(message names the rebuild command — `filamentBinaryFormat.ts`'s "points at
the build script" convention), then de-interleaves the 48-byte-stride vertex
block into four CONTIGUOUS `Float32Array`s in one pass (a strided subview
would need a stride-aware accessor at every read site; contiguous arrays go
straight into GPU buffers), and takes `indices` as a `Uint32Array` view over
the trailing block.

**LANDMINE — the payload is NOT 4-byte aligned.** The header is 18 bytes
(4 + 2 + 4 + 4 + 4), so the vertex block starts at byte 18 and the index block
at `18 + 48·vertexCount` — neither is a multiple of 4. `new Float32Array(buf,
18, n)` and `new Uint32Array(buf, …)` both throw `RangeError: start offset of
Float32Array should be a multiple of 4`. Read every payload element through a
`DataView` (or `buf.slice(...)` first) — the de-interleave already copies, so
this costs nothing for the vertex attributes; `indices` must be copied the
same way rather than viewed in place. The `writeMeshBinary` side (Task 10) has
the mirror constraint and writes through a `DataView` too.

This task has no dependency on Task 4: `MeshAsset` does not reference
`MeshAssetRow`.

The ENCODER (`writeMeshBinary`, the exact inverse) lives in
`tools/meshes/writeMeshBinary.ts` — Task 10, not here — but imports
`MESH_MAGIC`/`MESH_VERSION`/`MESH_HEADER_BYTES`/`MESH_VERTEX_STRIDE_BYTES`
from this module so the two can never drift on the constants, mirroring how
`filamentBinaryFormat.ts` keeps `encodeFilaments`/`decodeFilaments` in one
file — the split here (decode in `src/`, encode in `tools/`) exists ONLY
because `tools/` already imports from `src/` elsewhere (`textureSources.ts`
does), and a tool-only encoder has no business shipping in the browser
bundle.

- [ ] Add the failing test `decodeMesh rejects a bad magic` and `decodeMesh
rejects an unsupported version` to `tests/data/mesh/meshBinaryFormat.test.ts`
      — hand-built `ArrayBuffer`s with the wrong first 4 bytes / wrong
      version u16.
- [ ] Add `decodeMesh recovers a hand-built fixture buffer` — construct a
      tiny (e.g. 3-vertex, 3-index) buffer BY HAND (not via a future
      `writeMeshBinary` — Task 10 doesn't exist yet at this point in
      execution order per the dependency table, so this is a literal
      `DataView`-written fixture), assert `vertexCount`/`indexCount`/
      `boundingRadiusM` and that every typed-array's `.length` matches the
      header fields.
- [ ] Run — fails (module doesn't exist).
- [ ] Implement `meshBinaryFormat.ts`, `MeshReq.d.ts`, `MeshAsset.d.ts`.
- [ ] Run — green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit all four files.

---

## Task 10 — Tool: `buildMeshes` + helpers + `RAW_DATA`/`meshSources`

**Files:**

- Add devDependency `@gltf-transform/core` (+ `@gltf-transform/functions` per
  spec) to `package.json`
- Create `tools/meshes/buildMeshes.ts`
- Create `tools/meshes/writeMeshBinary.ts`
- Create `tools/meshes/generateTangents.ts`
- Create `tools/meshes/meanAlbedo.ts`
- Create `tools/utils/io/meshSources.ts`
- Modify `tools/utils/io/rawDataRegistry.ts` (add `meshes.dir`, `kind:
'directory'`, `source: 'gitignored'`, mirroring the planet-texture block's
  posture at `rawDataRegistry.ts:535-552` — raw source files are gitignored
  build inputs; only the provenance README + `.sha256` sidecar are committed.
  No per-file entries yet; those land in Task 18 alongside the real assets)
- Modify `package.json` `scripts`: `"build-meshes": "tsx
tools/meshes/buildMeshes.ts && npm run build-data-manifest"` (the
  chain-into-`build-data-manifest` convention every other `public/data`
  writer follows — see `build-filaments`, `build-mcpm`)
- Create `tests/tools/meshes/buildMeshes.test.ts`
- Create `tests/tools/meshes/writeMeshBinary.test.ts` (round-trips through
  Task 9's `decodeMesh`)
- Create `tests/tools/meshes/generateTangents.test.ts`
- Create `tests/tools/meshes/meanAlbedo.test.ts`

**Interfaces — Produces:**

```ts
// tools/utils/io/meshSources.ts — mirrors textureSources.ts's TextureSourceEntry
export type MeshSourceEntry = { readonly native: RawDataKey };
export const MESH_SOURCES: Readonly<Record<string, MeshSourceEntry>>; // EMPTY until Task 18
```

```ts
// tools/meshes/writeMeshBinary.ts
export function writeMeshBinary(geometry: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boundingRadiusM: number;
}): ArrayBuffer;
```

```ts
// tools/meshes/generateTangents.ts — uv-gradient accumulation per triangle,
// handedness packed into the tangent's w component.
export function generateTangents(geometry: {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}): Float32Array; // vertexCount * 4
```

```ts
// tools/meshes/meanAlbedo.ts — average linear-RGB colour of a decoded albedo image.
export function meanAlbedo(pixels: Uint8ClampedArray, width: number, height: number): Vec3;
```

```ts
// tools/meshes/buildMeshes.ts — npm run build-meshes
// Reads one mesh key's source GLB via @gltf-transform/core: refuses
// multi-MATERIAL input, strips skins/joints/weights and animation, merges the
// material's primitives into one buffer, keeps native metres, decimates to a
// triangle-budget constant and resizes textures to a texture-size-budget
// constant (both tool constants, not CLI flags), fills in a flat normal and a
// constant metal/rough map when the source has none (with a warning), uses the
// source TANGENT when present and computes one otherwise, then calls
// writeMeshBinary + meanAlbedo, writes public/data/meshes/<key>.mesh plus the
// three PNGs, and writes the key's row into meshAssets.generated.ts. Reports
// provenance (source, licence, attribution) before writing anything.
```

**Four contract details the two real assets pin down** (measured from the
downloads — see Task 18's table; get these wrong and the tool rejects or
mangles an asset that is perfectly fine):

1. **Multiple PRIMITIVES are normal; multiple MATERIALS are the refusal.** The
   whale is 3 `TRIANGLES` primitives that all share ONE material — a routine
   Sketchfab export shape. The tool merges them into a single vertex/index
   buffer (`@gltf-transform/functions`' `joinPrimitives`, then `weld`). Do NOT
   write a "refuses multi-primitive" or "refuses multi-mesh" check; only the
   material count gates.
2. **Skinned input must be de-rigged, not rejected.** The whale is RIGGED: its
   primitives carry `JOINTS_0`/`WEIGHTS_0` and the file has a skin. Clear the
   skin off the nodes and `prune()` (or drop those two attributes explicitly),
   and bake the REST pose — the `.mesh` format has no joint data and the
   runtime has no skinning path, by design.
3. **Native metres in, native metres out — there is no `--length-m` flag.**
   Both approved sources are authored at real-world scale (the whale's bbox
   spans 12.9 m on its long axis, inside Livyatan's real ~13–17 m range; the
   petunia basket ~0.49 × 0.87 × 0.55 m). `boundingRadiusM` therefore falls
   straight out of the bbox, which is what `MeshBody.radiusM` wants. A scale
   knob neither asset uses is speculative surface — do not build it. (The
   spec's "the tool scales to a `--length-m` target" predates the measurement;
   the spec's Raw-sources section now records the correction.)
4. **`TANGENT` is a fallback, not a default.** The whale ships tangents; the
   pre-baked petunia GLB carries only `POSITION`/`NORMAL`/`TEXCOORD_0`. Use
   the source's `TANGENT` accessor verbatim when it exists and call
   `generateTangents` only when it does not — regenerating over a good
   authored tangent frame is a silent way to break normal-mapped shading on an
   asset that was already correct.

**Landmines this task owns:**

- **The emitted `MeshAssetRow` carries `attribution`** (author + URL; empty
  string for a CC0 source), read from the key's `MESH_SOURCES` /
  provenance record. Task 18's credit surface reads this table — a row
  emitted without it silently ships an uncredited CC BY asset.
- **`_normal.png` and `_mr.png` are LINEAR data, `_albedo.png` is sRGB.** The
  tool must not colour-manage the first two on write; the fetcher's
  `colorSpaceConversion: 'none'` (Task 11) is the matching half.
- **Substitution is a BAKE-time decision, not a runtime one.** A missing
  normal map becomes a real 1×1 flat-normal PNG on disk plus
  `normalMapSubstituted: true` on the row (provenance, for the human); a
  missing `metallicRoughness` map likewise becomes a 1×1 constant `_mr.png`
  from the material's scalar factors. The petunia asset has NEITHER
  (baseColor-only, all 11 materials), so it exercises both paths for real.
  There is no header flag and no runtime branch — the renderer always binds
  three textures.
- **`@gltf-transform/core` and `/functions` are `devDependencies`.** They are
  imported only under `tools/`; nothing in `src/` may import them. The
  browser never parses glTF.
- **The one-material refusal is not negotiable and needs no escape hatch.** A
  multi-material source is fixed UPSTREAM of this tool, by a Blender pre-bake
  that flattens it to one material (Task 18 does exactly this for the petunia
  model). Do not add a "pick the first material" fallback or a merge path
  here — the refusal is what forces the problem to the place that can
  actually solve it.

**Behavior — the synthetic-fixture test posture (spec's explicit
constraint):** `buildMeshes.test.ts` builds a tiny synthetic GLB IN-TEST via
`@gltf-transform/core`'s `Document`/`NodeIO` API (one triangle or a simple
box primitive, one material, optionally a normal-map texture), writes it to
a scratch path, runs `buildMeshes` against it, and asserts on the emitted
`.mesh` buffer's header fields + the `meshAssets.generated.ts` row shape.
NEVER against `data/raw/meshes/whale/` or `.../petunias/` — those do not
exist until Task 18's human approval gate.

- [ ] Add the failing test `writeMeshBinary round-trips through decodeMesh`
      to `tests/tools/meshes/writeMeshBinary.test.ts` — a hand-built
      geometry fixture, `decodeMesh(writeMeshBinary(fixture))`, assert every
      typed array equals the input (this is the writer+reader pinning pair
      the spec's Testing section calls for — "writer and reader pinned
      together, the same posture `decodeFilaments`/`filamentFetcher`
      share").
- [ ] Add `generateTangents produces a unit tangent with the expected
handedness` — a hand-built two-triangle quad with a known UV layout,
      hand-computed expected tangent direction + `w` sign.
- [ ] Add `meanAlbedo averages a synthetic image's pixels` — a small
      hand-built `Uint8ClampedArray` (e.g. half red, half blue), hand-computed
      expected mean.
- [ ] Add `buildMeshes refuses a two-material GLB` — a synthetic
      `@gltf-transform` document with two materials, assert the tool throws
      (or exits non-zero) rather than picking one.
- [ ] Add `buildMeshes merges several primitives sharing one material` — a
      synthetic document with two `TRIANGLES` primitives on ONE material;
      assert it is accepted and the emitted header's `vertexCount`/
      `indexCount` cover both. This is the whale's actual shape (3
      primitives), and the case a "multi-mesh" refusal would wrongly reject.
- [ ] Add `buildMeshes drops skin attributes and bakes the rest pose` — a
      synthetic skinned document; assert the emitted `.mesh` is written (not
      refused) and that its vertex count matches the source's, i.e. the
      joint/weight attributes left without taking geometry with them.
- [ ] Add `buildMeshes substitutes a flat normal and a constant mr map when
the source has neither` — a synthetic single-material, baseColor-only
      document; assert the emitted row has `normalMapSubstituted: true`, that
      `_normal.png` and `_mr.png` were both written, and that a warning was
      logged (spy on `console.warn`). This is the petunia asset's shape.
- [ ] Run all seven — fail (files don't exist).
- [ ] Implement `meanAlbedo.ts`, `generateTangents.ts`, `writeMeshBinary.ts`,
      `buildMeshes.ts`, `meshSources.ts`, the `RAW_DATA.meshes.dir` entry,
      the `@gltf-transform/core`(+`/functions`) devDependency, the
      `build-meshes` npm script.
- [ ] Run — all green.
- [ ] `npx tsc --noEmit` clean (both tsconfigs — `tools/` has its own).
- [ ] Commit all files above, `package.json`, `package-lock.json`.

---

## Task 11 — `meshFetcher`

**Files:**

- Create `src/services/loading/fetchers/meshFetcher.ts`

**Interfaces — Produces:**

```ts
// src/services/loading/fetchers/meshFetcher.ts
export const meshFetcher: Fetcher<MeshAsset, MeshReq>;
```

**Behavior:** fetches `dataUrl('meshes/<key>.mesh')` (`dataUrl` is
`src/services/loading/fetchWithProgress.ts:29`) via `fetchWithProgress`,
decodes via `decodeMesh` (Task 9); then fetches + decodes the three PNGs
(`<key>_albedo.png`, `<key>_mr.png`, `<key>_normal.png`). LANDMINE:
`colorSpaceConversion: 'none'` for `_mr` and `_normal` — they carry numeric
channels, not a picture, and the default managed decode gamma-shifts them
(`bodyTextureFetcher.ts:48-57` is the precedent and the reasoning). `_albedo`
takes the default managed decode. No `TextureKind` dispatch: a mesh body has
exactly these three fixed roles, so the linear/sRGB split is a constant here,
not a predicate.

Assembles the full `MeshAsset` from the decoded geometry + three bitmaps.
Non-2xx / non-image-content-type responses throw, matching
`bodyTextureFetcher.ts`'s posture — the renderer has no flat-albedo fallback
for a mesh body the way a sphere does; see Task 12's residency-gated
"invisible, not wrong-shape" behavior instead.

- [ ] Implement `meshFetcher.ts` following the `filamentFetcher.ts` (single
      binary fetch) + `bodyTextureFetcher.ts` (image decode,
      `colorSpaceConversion`) patterns. No dedicated unit test — the spec's
      Testing section lists no fetcher-level test beyond the decoder's own
      (Task 9) and the tool's own (Task 10); a fetcher test would need a
      mocked `fetch`, and this codebase's precedent (`filamentFetcher.ts`,
      `bodyTextureFetcher.ts`) carries none either.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `src/services/loading/fetchers/meshFetcher.ts`.

---

## Task 12 — `meshSlotRegistry` + demand row + `meshBodyLoadRadius`

**Files:**

- Create `src/services/engine/wiring/meshSlotRegistry.ts`
- Create `src/services/engine/frame/meshBodyLoadRadius.ts`
- Modify `src/@types/engine/state/EngineAssetSlots.d.ts` (add `meshBodies:
Map<string, AssetSlot<MeshAsset, MeshReq>>` beside `bodyTextures` at line
  85, following that field's doc pattern — "the Maps are declared empty and
  need no null check", header line 8)
- Modify `src/services/engine/wiring/assetWiring.ts` (add a mesh-body demand
  row per `SCENE_MESH_BODIES` entry, mirroring `bodyTextureRow` at lines
  144-162)
- Modify `src/services/engine/phases/wireSlots.ts` (add
  `wireMeshBodySlots(state)` beside the `wireBodyTextureSlots(state)` call at
  line 117)
- Modify **every site that builds a literal `EngineAssetSlots` object**, each
  of which needs `meshBodies: new Map()` added alongside its
  `bodyTextures: new Map()` line — otherwise the literal under-satisfies the
  widened type and `tsc` fails at the fixture, not at any code this task
  wrote. The complete list on `origin/main`
  (`git grep -l 'bodyTextures: new Map()'`), 8 files:
  - `src/services/engine/engine.ts:567` — **the real construction site, not a
    fixture; do not miss it**
  - `tests/services/engine/frame/passes/bodyGlintsPass.test.ts`
  - `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts`
  - `tests/services/engine/phases/wireSlots.test.ts`
  - `tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts`
  - `tests/services/engine/wiring/createSyntheticFallback.test.ts`
  - `tests/services/engine/wiring/demandTable.test.ts`
  - `tests/services/engine/wiring/engineSliceDispatches.test.ts`

  (`tests/services/engine/wiring/reevaluateDemand.test.ts` does NOT build one
  — re-run the grep before editing in case the set has moved.)

**Interfaces — Produces:**

```ts
// src/services/engine/frame/meshBodyLoadRadius.ts — mirrors bodyTextureLoadRadius.ts,
// simpler: no ring-host indirection, the id IS a SCENE_MESH_BODIES id.
export function loadRadiusMpc(id: string): number;
```

```ts
// src/services/engine/wiring/meshSlotRegistry.ts
export function wireMeshBodySlots(state: EngineState): void;
```

**Interfaces — Consumes:** `meshFetcher` (Task 11) and
`state.gpu.meshBodyRenderer` — the `EngineState.gpu` field Task 15 declares.
That is why this task depends on 15 as well as 11: without the field, the
commit closure's `state.gpu.meshBodyRenderer?.setMesh(...)` is a `tsc` error.

**Behavior:** `loadRadiusMpc` scales off the body's own `radiusM` (looked up
via `SCENE_MESH_BODIES`, `src/utils/object/findByIdOrThrow.ts`), the same
`radiusM · M_TO_MPC · MULTIPLIER` shape `bodyTextureLoadRadius.ts:60-64` uses.
Use `LOAD_RADIUS_BODY_RADII = 1e5` (one order above the planets' `1e4`,
`bodyTextureLoadRadius.ts:60`): a ~10 m body at 1e4 radii demands only inside
100 km, well past the 3 px partition boundary, so the mesh would still be
fetching when it is already meant to be drawn. 1e5 puts the demand edge at
~1000 km — comfortably outside the boundary, and still a rounding error
against Earth's own texture radius. It is one constant, in one file; tune it
at the Task 18 visual pass if the handoff still pops.

`wireMeshBodySlots` mints one `AssetSlot<MeshAsset, MeshReq>` per
`SCENE_MESH_BODIES` entry via `createAssetSlot`, `commit` routing to
`state.gpu.meshBodyRenderer?.setMesh(id, asset)`, `onRelease` calling
`clearMesh(id)` — mirroring `bodyTextureSlotRegistry.ts`'s shape but
un-keyed (one slot per body id, not per `(bodyId, kind)` pair, since one
fetch resolves the whole `MeshAsset`).

The `assetWiring.ts` demand row per mesh body: `built: 'external'`, `factory`
a throwing guard (matching `bodyTextureRow`'s externally-built posture),
`req: () => ({ meshKey: body.meshKey })`, `demand`/`release` using
`distanceMpc(ctx.cameraPosMpc, deriveBodyStates(ctx.simDays).get(body.id)!.positionMpc)`
against `loadRadiusMpc(body.id)` / `2 * loadRadiusMpc(body.id)` — SIMPLER
than `bodyTextureRow`'s `bodyPosOf` (which resolves a texture's HOST via
`hostBodyId` for the ring case): a mesh body has its own `ORBITAL_ELEMENTS`
row, so its position comes straight off `deriveBodyStates`, no host
indirection.

- [ ] Widen `EngineAssetSlots.d.ts` with the `meshBodies` Map field.
- [ ] Add `meshBodies: new Map()` to every fixture file listed above.
- [ ] Implement `meshBodyLoadRadius.ts`, `meshSlotRegistry.ts`, the
      `assetWiring.ts` demand row(s), the `wireSlots.ts` call site. No new
      unit test — this mirrors `bodyTextureSlotRegistry.ts`/`bodyTextureRow`,
      neither of which carries a dedicated test in this codebase (asset-slot
      wiring is exercised by the loading-subsystem integration tests, if
      any exist — confirm none regress).
- [ ] `npm test` — full suite green (confirms no import-time regression in
      `assetWiring.ts`'s existing rows and that every widened fixture still
      satisfies `EngineAssetSlots`).
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit `EngineAssetSlots.d.ts`, `meshBodyLoadRadius.ts`,
      `meshSlotRegistry.ts`, `assetWiring.ts`, `wireSlots.ts`, and every
      touched fixture file.

---

## Task 13 — `bodyStateInHostFrame` + `meshBodiesAttachedTo` + `deriveSlabs` wiring

**Files:**

- Create `src/utils/scene/bodyStateInHostFrame.ts`
- Create `tests/utils/scene/bodyStateInHostFrame.test.ts`
- Create `src/utils/scene/meshBodiesAttachedTo.ts`
- Create `tests/utils/scene/meshBodiesAttachedTo.test.ts`
- Modify `src/services/engine/frame/slabs.ts` (`deriveSlabs` at line 368 gains
  one input field, threaded into the `bodySlabRow` call at line 453 as Task
  2's `attachedBodies` param)
- Modify `src/services/engine/frame/frameContext.ts` (build the
  `attachedBodiesByHostId` map between the `bodyPose` closure at lines 236-240
  and the `deriveSlabs` call at lines 265-273; `bodyStates` is already in
  scope from line 192, `slabBodyCandidates` from lines 204-207)

**Interfaces — Produces:**

```ts
// src/utils/scene/meshBodiesAttachedTo.ts
export function meshBodiesAttachedTo(hostId: string): readonly MeshBody[];
```

Maps `hostId` to every `SCENE_MESH_BODIES` entry whose
`elementsById(id).focusId === hostId` (`elementsById`,
`src/data/bodies/orbitalElements.ts:38`). The host is derived from the
body's own orbital row and never stored a second time on the `MeshBody` —
a second copy could only drift from it.

```ts
// src/utils/scene/bodyStateInHostFrame.ts
export function bodyStateInHostFrame(
  body: BodyState,
  host: BodyState,
): { readonly posM: Vec3; readonly rotM: Mat3 };
```

**LANDMINE — cancel before you scale.** Subtract the two heliocentric
`positionMpc`s in f64 **Mpc first**, then scale the (now-small) remainder to
metres via `SCALE_UNITS.MPC_TO_M`. Scaling each operand to metres first
inflates the shared heliocentric rounding error by that same factor before
the cancellation ever happens. This is the identical order and reasoning
`bodyRelativePose.ts:37-46` documents in its own header (lines 5-9).

**Contract:**

- `posM` — the delta above, expressed in the host's fixed axes via
  `rotateByTranspose(host.orientation, deltaM)` (Task 1's extracted util).
- `rotM` — the body's own `orientation` expressed in the host's frame, i.e.
  `hostᵀ · body.orientation`. Composing `rotM` with a mesh-local vector must
  yield that vector in the HOST's fixed axes; that is the contract the
  shader's normal transform (Task 16) and the pass's model matrix (Task 17)
  both depend on. Implementation is free (`rotateByTranspose` per column, or
  the shared `multiply3x3`).

**`deriveSlabs` wiring** — the growth `bodySlabRow`'s Task-2 signature was
built for. In `frameContext.ts`, once per frame between the `bodyPose`
closure (:236-240) and the `deriveSlabs` call (:265-273), build

```ts
// host body id → the attached-body faces `bodySlabRow` lowers its near plane against
const attachedBodiesByHostId: ReadonlyMap<
  string,
  readonly { readonly posM: Vec3; readonly radiusM: number }[]
>;
```

by walking `slabBodyCandidates` (:204-207), calling `meshBodiesAttachedTo` per
host, and mapping each attached body through `bodyStateInHostFrame` against
the shared `bodyStates` snapshot (:192). Skip hosts with no attachments — for
every body but Earth the map has no entry, so `deriveSlabs`'s output is
byte-identical to today. `deriveSlabs` then threads
`attachedBodiesByHostId.get(body.id)` into each `bodySlabRow` call's
`attachedBodies` param.

**LANDMINE — do not grow the slab table.** `slabBodyCandidates` (:204-207)
and `BODY_SLAB_CAPACITY` (`frameProgram.ts:89`) are UNTOUCHED. A mesh body
rides its host's existing `body-m` row, the way a ring rides its planet's; it
never becomes a candidate itself. A diff that edits either constant has taken
the wrong turn.

This is the ONE per-frame call site for `bodyStateInHostFrame` on the SLAB
side; `meshBodiesPass.draw` (Task 17) calls it a second time for the actual
vertex placement, reading the SAME `bodyStates` snapshot, so the two cannot
disagree — `deriveBodyStates` memoizes one deep on `simDays`
(`frameContext.ts:189-192`).

- [ ] Add the failing test `bodyStateInHostFrame places an attached body in
the host's fixed axes` to `tests/utils/scene/bodyStateInHostFrame.test.ts`
      — a host at a known `positionMpc`/identity `orientation` and a body
      offset from it by a known small Mpc delta; hand-compute the expected
      `posM` (the delta in metres, unrotated since the host orientation is
      identity) and assert equality; add a SECOND case with a non-identity
      host `orientation` (a 90° rotation) and hand-compute the rotated
      expectation independently (rotate the delta by hand, not via the
      function's own `rotateByTranspose` call).
- [ ] Add the failing test `meshBodiesAttachedTo returns the mesh bodies
whose focus matches the host id`. **`SCENE_MESH_BODIES` is EMPTY until
      Task 18**, so this test must `vi.mock('…/data/bodies/sceneMeshBodies')`
      with two fixture `MeshBody` rows whose ids match Task 6's real
      `ORBITAL_ELEMENTS` entries (`elementsById` reads the real table, which
      Task 6 has already populated with `focusId: 'earth'` rows). Assert
      `meshBodiesAttachedTo('earth')` returns both and
      `meshBodiesAttachedTo('mars')` returns `[]`. Running against the real
      (empty) seed table would make the first assertion vacuously wrong and
      the second vacuously right.
- [ ] Run — both fail.
- [ ] Implement `bodyStateInHostFrame.ts`, `meshBodiesAttachedTo.ts`.
- [ ] Run — green.
- [ ] Wire `deriveSlabs`/`frameContext.ts` per the shape above. No new test
      for the wiring itself — Task 2's `bodySlabRow` tests already prove the
      near-plane maths; this step only proves data reaches it, which
      `slabs.test.ts`'s existing `deriveSlabs`-level cases (still passing,
      since `attachedBodiesByHostId` is empty for every host with no
      mesh-body match) cover as a no-regression check.
- [ ] `npm test` — full suite green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit all six files.

---

## Task 14 — `sunVisibleFraction`

**Files:**

- Create `src/utils/scene/sunVisibleFraction.ts`
- Create `tests/utils/scene/sunVisibleFraction.test.ts`

**Interfaces — Produces:**

```ts
// src/utils/scene/sunVisibleFraction.ts
// Fraction of the Sun's disc NOT occluded by the host sphere, as seen from
// the body: 1 on the day side, 0 deep in umbra, ramping through the
// penumbra — from the two angular radii and the angular separation between
// Sun and host as seen from the body. New, self-contained: no existing
// angular-overlap/eclipse-fraction helper to build on (spec, "Umbra and
// Earthshine").
export function sunVisibleFraction(input: {
  readonly bodyPosMpc: Readonly<Vec3>;
  readonly sunPosMpc: Readonly<Vec3>;
  readonly hostPosMpc: Readonly<Vec3>;
  readonly sunRadiusM: number;
  readonly hostRadiusM: number;
}): number;
```

**Behavior:** angular radius of the Sun as seen from the body =
`asin(sunRadiusM / |sunPosMpc − bodyPosMpc| in metres)` (clamp the asin
argument, since the body can in principle sit inside the Sun's disc at
absurd test distances — not a real in-scene case, but a defensive clamp
costs nothing); angular radius of the host similarly; angular separation
between the Sun and host directions as seen from the body via the dot
product of their two unit direction vectors. Standard two-circles angular
overlap: full occlusion (`0`) when the separation is ≤ `|hostAngRad −
sunAngRad|` and the host is the larger (nearer) disc; no occlusion (`1`)
when separation ≥ `hostAngRad + sunAngRad`; **linear** ramp between — not
smoothstep. The real penumbra profile is the area-overlap integral of two
discs, which is neither; linear is the honest cheap approximation and, at a
400 km orbit, the whole penumbra crossing takes about a second of sim time,
so the ramp shape is not observable. A smoothstep would be a second
undocumented artistic constant with nothing to justify it.

- [ ] Add the failing test `sunVisibleFraction is 1 on the day side` — a
      body positioned such that the host is far off to one side (angular
      separation well beyond the sum of the two angular radii), assert
      `=== 1`.
- [ ] Add `sunVisibleFraction is 0 deep in umbra` — body directly behind the
      host from the Sun's perspective, separation well under
      `|hostAngRad − sunAngRad|`, assert `=== 0`.
- [ ] Add `sunVisibleFraction sits strictly inside (0, 1) at a
penumbra-edge point` — a hand-computed geometry where the separation
      sits exactly between the two thresholds, assert `0 < result < 1`
      (spec's own Testing-section wording — the three cases named there
      exactly).
- [ ] Run — fail (file doesn't exist).
- [ ] Implement `sunVisibleFraction.ts`.
- [ ] Run — all three green.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit both files.

---

## Task 15 — `meshBodyRenderer` + uniform packer

**Files:**

- Create `src/services/gpu/renderers/bodies/meshBodyRenderer.ts`
- Create `src/@types/rendering/MeshBodyRenderer.d.ts`
- Create `src/utils/gpu/packMeshBodyUniforms.ts`
- Modify the `EngineState.gpu` shape to declare
  `meshBodyRenderer: MeshBodyRenderer | null` beside `texturedBodyRenderer`
  (grep `texturedBodyRenderer:` under `src/@types/engine/`). The FIELD is
  declared here — seeded `null` — so Task 12's slot commit can reference it;
  its CONSTRUCTION at boot is Task 17.

**Interfaces — Produces:**

```ts
// src/@types/rendering/MeshBodyRenderer.d.ts
export type MeshBodyRenderer = Renderer & {
  setMesh(id: string, asset: MeshAsset): void;
  clearMesh(id: string): void;
  hasMesh(id: string): boolean;
  draw(pass: GPURenderPassEncoder, id: string, uniforms: Float32Array): void;
};
```

```ts
// src/services/gpu/renderers/bodies/meshBodyRenderer.ts
export function createMeshBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean, // caller passes SLAB_REVERSED_Z[NEAR0] — never hard-coded
): MeshBodyRenderer;
```

One shared pipeline, explicit bind-group layout (never `'auto'`); a
`Map<string, MeshBodyResources>` — vertex buffer, index buffer, index count,
three textures + views, one uniform buffer, one bind group PER mesh body id
— mirroring `texturedBodyRenderer.ts`'s per-body `Map` + shared-pipeline
split. **Unlike `texturedBodyRenderer`, this is a REAL triangle mesh, not a
ray-traced proxy shell**: `cullMode: 'back'` (standard back-face culling —
never `'front'`, and no `PROXY_SCALE` inflation of any kind — the mesh's own
authored geometry, in metres, IS the drawn surface). `draw(pass, id,
uniforms)` writes that body's uniform buffer immediately before its indexed
draw call (the same writeBuffer-vs-submit race avoidance
`texturedBodyRenderer.draw` follows).

```ts
// src/utils/gpu/packMeshBodyUniforms.ts
// Byte layout (matches MeshBodyUniforms, shaders/bodies/meshBody/io.wesl):
//
//   offset 0..63:    mvp            (mat4x4<f32>)
//   offset 64..75:   sunDirLocal    (vec3<f32>, 16-byte aligned)
//   offset 76..79:   sunVisibleFraction (f32 — fills sunDirLocal's trailing
//                    pad slot; the RingUniforms.planetRadiusRatio trick)
//   offset 80..127:  model          (mat3x3<f32> — 3 columns × vec4, w unused
//                    per column; the body's own tumble rotation, host-local
//                    axes, for transforming normal/tangent — NOT the same
//                    rotation baked into mvp, which also carries the view)
//   offset 128..139: camPosLocal    (vec3<f32>, 16-byte aligned)
//   offset 140..143: earthshineStrength (f32 — fills camPosLocal's trailing pad)
//   offset 144..155: earthshineColor (vec3<f32>, 16-byte aligned)
//   offset 156..159: _pad0          (f32)
//   offset 160..171: dirToHost      (vec3<f32>, 16-byte aligned — unit, host
//                    axes, body centre toward host centre; see Task 16)
//   offset 172..175: _pad1          (f32 — rounds the struct to 176 / 16)
//   total: 176 bytes (44 f32s)
export const MESH_BODY_UNIFORM_FLOATS = 44;
export function packMeshBodyUniforms(args: {
  readonly mvp: Float32Array; // 16 elements, already narrowed to f32
  readonly sunDirLocal: Readonly<Vec3>;
  readonly sunVisibleFraction: number;
  readonly model: Readonly<Mat3>;
  readonly camPosLocal: Readonly<Vec3>;
  readonly earthshineStrength: number;
  readonly earthshineColor: Readonly<Vec3>;
  readonly dirToHost: Readonly<Vec3>;
}): Float32Array;
```

The layout does NOT call `packLitBodyUniforms` (`src/utils/gpu/packLitBodyUniforms.ts`)
— it packs `sunVisibleFraction` into a pad slot that packer never writes —
but it MATCHES that packer's first 80 bytes byte-for-byte, following the same
"fill the trailing pad with a real field" convention its siblings use. Say so
in both the `.wesl` struct's header (Task 16) and this packer's docblock, so a
future reader doesn't try to call `packLitBodyUniforms` here and find a fifth
argument with nowhere to go.

- [ ] Implement `MeshBodyRenderer.d.ts`, `meshBodyRenderer.ts`,
      `packMeshBodyUniforms.ts`, and the `EngineState.gpu` field.
- [ ] Add `tests/utils/gpu/packMeshBodyUniforms.test.ts` pinning the byte
      layout above: one call with distinguishable values per field, asserting
      each lands at its documented float index (16 → `sunDirLocal.x`, 19 →
      `sunVisibleFraction`, 35 → `earthshineStrength`, …) and that the array
      is `MESH_BODY_UNIFORM_FLOATS` long. This is the WGSL/TS uniform
      byte-layout keep-rule (`conventions/testing.md`), not a constant
      restatement: a mislaid uniform is invisible in Chrome and silently
      drops the whole frame on WebKit. **`packTexturedBodyUniforms` carries
      exactly this test today** (`tests/utils/gpu/packTexturedBodyUniforms.test.ts`)
      — follow it.
- [ ] No renderer unit test — construction needs a GPU device and the spec
      excludes it ("No renderer or shader unit tests").
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test -- packMeshBodyUniforms` green.
- [ ] `npm run build` clean (confirms the renderer file at least compiles
      against real WebGPU types, even though it can't run headlessly here).
- [ ] Commit `MeshBodyRenderer.d.ts`, `meshBodyRenderer.ts`,
      `packMeshBodyUniforms.ts`, its test, and the `EngineState.gpu` file.

---

## Task 16 — WESL shaders

**Files:**

- Create `src/services/gpu/shaders/bodies/meshBody/io.wesl`
- Create `src/services/gpu/shaders/bodies/meshBody/vertex.wesl`
- Create `src/services/gpu/shaders/bodies/meshBody/fragment.wesl`

Read `.claude/skills/wesl-shaders/SKILL.md` before writing any of these — no
backticks in comments, `import package::…` (never the npm name), one import
per line, imports at the TOP of the file, no brace-list imports.

**Interfaces — Produces:**

```wgsl
// io.wesl
struct MeshBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  sunVisibleFraction: f32,
  model: mat3x3<f32>,
  camPosLocal: vec3<f32>,
  earthshineStrength: f32,
  earthshineColor: vec3<f32>,
  _pad0: f32,
  dirToHost: vec3<f32>,
  _pad1: f32,
};

struct MeshBodyVSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) worldNormal: vec3<f32>,
  @location(1) worldTangent: vec4<f32>, // w = handedness, carried through unchanged
  @location(2) uv: vec2<f32>,
  @location(3) localPos: vec3<f32>,
};
```

**Behavior — vertex.wesl:** transforms the authored position by `u.mvp` for
`clip`; transforms normal and tangent.xyz by `u.model` only (NOT `u.mvp` —
normals need the body's own rotation, not the camera's view/projection);
carries `uv` straight through; carries `localPos` (the un-transformed
authored position, for the fragment's Earthshine `dot(n, dirToHost)` term,
computed relative to the body's own centre — see below).

**Behavior — fragment.wesl:** builds the TBN frame from `worldNormal` +
`worldTangent` (bitangent = `cross(normal, tangent.xyz) * tangent.w`),
samples albedo (sRGB, default decode)/mr/normal (all linear — perturbs the
geometric normal by the sampled tangent-space normal), calls
`package::lib::pbr::pbrDirect` with `u.sunDirLocal` — `pbrDirect`'s `f0` is a
SCALAR dielectric reflectance (no metalness mix in the shared function, per
`lib/pbr.wesl`'s signature); for the mesh bodies' mr texture, treat the whale
and pot as dielectric and feed `pbrDirect` a constant `f0` while using only
the mr texture's roughness channel — do NOT invent a metalness mix inside
`pbrDirect` itself (that function is shared with future lit-body work; a
mesh-specific metal/dielectric blend, if ever needed, belongs in THIS
fragment, mixing `pbrDirect`'s dielectric output against a second call or a
simplified metallic term locally — `pbrDirect`'s `f0` is a scalar, confirmed
at `src/services/gpu/shaders/lib/pbr.wesl:282-288`). Multiplies the
direct-lighting result by `u.sunVisibleFraction`.

Adds the Earthshine fill term: `u.earthshineColor * u.earthshineStrength *
saturate(dot(n, dirToHost))`.

**`dirToHost` is a UNIFORM, not a varying — pinned, do not re-derive it.**
`u.dirToHost` is packed once per body per frame by Task 17 as
`normalize(-posM)`: a unit vector in the host's fixed axes pointing from the
body's centre at the host's centre. Deriving it per-fragment from the surface
point would be `normalize(-(posM + localPos))`, and `|posM|` (~6771 km)
dwarfs `|localPos|` (metres) by six orders of magnitude — the difference is
far below any shading-visible tolerance, so the per-fragment form buys
nothing and costs a varying.

`localPos` stays in `MeshBodyVSOut` regardless: `pbrDirect` needs the view
vector `normalize(u.camPosLocal - localPos)`, and at a close-approach camera
a few metres out, `localPos` genuinely matters there.

**LANDMINE — no shadow map.** Occlusion by the host is the CPU-side
`u.sunVisibleFraction` scalar and nothing else. There is no depth pass, no
light-space matrix, no self-shadowing term. Every other body-lighting effect
in this codebase is analytic for the same reason.

- [ ] Write `io.wesl`, `vertex.wesl`, `fragment.wesl` per the contracts
      above.
- [ ] `npm run dev` (already running per CLAUDE.md convention) — confirm no
      WESL parse error in the console the moment `meshBodiesPass` first
      compiles its pipeline (Task 17 is what actually wires the pipeline
      construction; this task's own verification is limited to `npm run
build`'s WESL relink succeeding, since nothing calls these shaders
      yet).
- [ ] `npm run build` clean (WESL relinks).
- [ ] Commit all three `.wesl` files.

---

## Task 17 — `meshBodiesPass` + registration + pick + `wireSlots`

**Files:**

- Create `src/services/engine/frame/passes/meshBodiesPass.ts`
- Modify `src/services/engine/frame/passes/index.ts` — register
  `meshBodiesPass` immediately after `texturedBodiesPass` (line 398) and
  before `ringsPass` (line 404), so it depth-tests against the opaque spheres
  and stays under the translucent ring + `atmosphereShellPass` (line 426)
- Modify wherever `state.gpu.texturedBodyRenderer` is constructed at boot
  (grep `initGpu.ts` or equivalent — add the sibling
  `createMeshBodyRenderer` construction, gated the same way the other body
  renderers are, and register it in the GPU handle registry). The
  `EngineState.gpu.meshBodyRenderer` FIELD already exists from Task 15; this
  task fills it.
- Modify `src/services/engine/phases/wireSlots.ts` — call
  `wireMeshBodySlots(state)` (Task 12)

**Interfaces — Produces:**

```ts
// src/services/engine/frame/passes/meshBodiesPass.ts
export const meshBodiesPass: ContentPass; // name: 'mesh-bodies', slab: 'body', target: 'foreground:0', blend: 'opaque'
```

**Behavior — `enabled`/`draw` (the visual pass):** `view.slab.frame.kind ===
'body-m'`; `state.gpu.meshBodyRenderer` non-null; `bodyId =
view.slab.frame.bodyId`; `attached = meshBodiesAttachedTo(bodyId)` (Task 13)
intersected with `sceneBodyPartition(state, ctx).meshes` (Task 3/4) — draw
each surviving mesh body that ALSO has `meshBodyRenderer.hasMesh(id)` true
(the demand-driven residency gate; a body inside the glint boundary but not
yet loaded draws nothing, per the spec's explicit "simply invisible rather
than a wrong shape"). For each: `hostPose = ctx.bodyPose(bodyId)`; `{ posM,
rotM } = bodyStateInHostFrame(sceneBodyStates(state, ctx).get(meshId)!,
sceneBodyStates(state, ctx).get(bodyId)!)`; model matrix =
`translate(posM − hostPose.eyeRelBodyM) · rotate(rotM)`, scale 1 (composed
in f64, narrowed only at the staging-buffer write — mirror
`planetsPass.ts:draw`'s narrow-at-write discipline, `narrowMat4`); `mvp =
view.slab.vp * model`; `sunDirLocal` via the existing
`src/utils/camera/sunDirLocal.ts` fed the mesh body's own `positionMpc`,
`RENDER_ORIGIN_MPC`, and the **HOST's** orientation — the same frame `rotM`
and the normal transform land in (Task 16's fragment contract), NOT the mesh
body's own orientation (`planetsPass.ts:111` passes its own only because a
planet IS its own frame); `sunVisibleFraction` from Task 14, fed the
Sun's/host's/mesh body's positions and radii; `camPosLocal =
hostPose.eyeRelBodyM - posM`; `dirToHost = normalize(-posM)` (Task 16).
Pack via `packMeshBodyUniforms` (Task 15), call
`renderer.draw(pass, meshId, uniforms)`.

**Earthshine colour — RULED, not an open item.** `earthshineColor` reads
`ATMOSPHERE_PARAMS[hostId].groundAlbedo` (`src/data/bodies/atmosphereParams.ts:59`
gives Earth `[0.3, 0.3, 0.3]`), falling back to a neutral grey for a host with
no atmosphere row. `EarthBody` carries NO `albedo` field
(`src/@types/scene/EarthBody.d.ts:17-21` - Earth is always textured, so it
never needed one), so the spec's "host albedo" has exactly one existing home
in this codebase and that is it. Do NOT author a second local
`EARTHSHINE_COLOR` constant restating the same three numbers - one canonical
home (`conventions/simplicity.md`). `earthshineStrength` IS a new local
constant in this file: a look knob with no existing home, tuned at the Task 18
visual pass.

**LANDMINE — this pass owns no slab row.** `slabBodyCandidates`
(`frameContext.ts:204-207`) and `BODY_SLAB_CAPACITY` (`frameProgram.ts:89`)
are UNTOUCHED. The pass declares `slab: 'body'` and draws into whichever host
row the executor hands it, exactly as `ringsPass` does.

**LANDMINE for the model compose:** do NOT embed the `Mat3` into a `mat4d`
via `mat4d.fromMat3` — wgpu-matrix's `mat3` is a 12-float PADDED layout
(columns at 0, 4, 8), not the tight 9-float `Mat3` this codebase uses
everywhere else, so feeding it our tuple reads the wrong slots. Build the
4×4 from the tight `Mat3`'s nine elements by hand.
`src/utils/camera/composeBodyMvp.ts:113-120` already hit this and documents
the pattern (and notes that placing the columns transposed mirrors the body —
a failure mode with no compiler check); read that comment first.

**Files, continued:** modify
`tests/services/engine/frame/passes/passes.test.ts`:

- **`:348-357`** — the `'body'`-slab sentinel case. Its loop at `:352` is a
  fixed array `[earthPass, planetsPass, texturedBodiesPass]`; add
  `meshBodiesPass` to it, and update the `it(...)` title at `:348`, which
  names the three passes in prose.
- **`:529-537`** — the `foreground:0` ordering pin. **Verified against
  `origin/main`: inserting `meshBodiesPass` before `ringsPass` does NOT break
  it.** The assertions are `idxAtmosphere > idxRings` (`:533`) and
  `fgIndices[fgIndices.length - 1].layer === atmosphere` (`:537`) — a
  last-element check, not a positional enumeration of the whole group. No
  edit needed here; confirm it still passes rather than pre-emptively
  rewriting it.
- The group-membership check at `:333-346` filters by an explicit
  `FOREGROUND_NAMES` list and by `slab === NEAR0`; `meshBodiesPass` is
  `slab: 'body'` and not in that list, so it is out of scope there too.

**Behavior — `drawPick`:** the pick set equals the draw set here, so
`pickEnabled` is OMITTED entirely — `ContentPass.d.ts:103-120` documents that
default and names the three passes that legitimately override it (none is
this one). `drawPick` reuses `bodyPickRenderer.drawSphere`
(`src/services/gpu/renderers/bodies/bodyPickRenderer.ts:384`) against the
bounding sphere, composed via `bodySlabFlooredPick(view.slab.vp,
hostPose.eyeRelBodyM − posM, meshBody.radiusM, ctx.drawPxPerRad)` — which
returns `{ mvp, camPosLocal }` (`bodySlabFlooredPick.ts:25-35`) — with packed
id `packSelection(Source.MeshBody, seedIndexOfBody(meshId,
SCENE_MESH_BODIES) + PICK_SENTINEL_OFFSET)`. The proxy sphere sits at the
mesh body's own position while riding the host's slab row; that is exactly
what the `hostPose.eyeRelBodyM − posM` argument encodes.

- [ ] Implement `meshBodiesPass.ts`.
- [ ] Register it in `passes/index.ts`, immediately after `texturedBodiesPass`.
- [ ] Construct `meshBodyRenderer` at boot and register the GPU handle (the
      `EngineState.gpu` field itself landed in Task 15).
- [ ] Call `wireMeshBodySlots(state)` in `wireSlots.ts`.
- [ ] Update `passes.test.ts` per the note above (body-sentinel array + its
      `it` title; leave the `foreground:0` ordering pin alone).
- [ ] No new unit test for the pass itself (spec's Testing section: "No
      renderer or shader unit tests" covers this pass too — it is pure GPU
      wiring, exercised by the visual pass in Task 18); `passes.test.ts`'s
      update above is a structural-registry fix, not new coverage.
- [ ] `npm test -- passes` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean.
- [ ] Commit all files above, including `passes.test.ts`.

---

## Task 18 — Real seed rows (asset-gated): provenance, tool run, perf, visual pass

**This task cannot start until the user has downloaded both approved source
models into `data/raw/meshes/whale/` and `data/raw/meshes/petunias/`** —
Sketchfab requires a logged-in browser session, so the download is a manual
human step, not something any task automates. Provenance is already approved
(below); everything else here assumes the files have landed.

### The two approved assets

Both CC BY 4.0, both fetched 2026-09-10, both `source: 'gitignored'`.

| key        | model                   | author                                   | file                                    | bytes      | sha256                                                             |
| ---------- | ----------------------- | ---------------------------------------- | --------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `whale`    | "Livyatan melvillei"    | Major (`majorgalah`)                     | `data/raw/meshes/whale/whale.glb`       | 1,435,168  | `8dcb2f2f471897e638a07c62eb66b972d64ffa8f49ae8278b3bab6b658cbf6f0` |
| `petunias` | "Flowers Petunia White" | Marianne Goudriaan (`mariannegoudriaan`) | `data/raw/meshes/petunias/petunias.glb` | 19,646,792 | `4963f8acc1f648301adfc4338e2c9de09cddf7b093e0d5b0fcdea10106745ca9` |

- whale: <https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba>
- petunias: <https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0>

**Whale, as inspected.** glTF 2.0 Sketchfab export: 3 `TRIANGLES` primitives
sharing ONE material (baseColor + metallicRoughness + normal, all 1024×1024
PNG), 5,598 tris / 3,278 verts, `TANGENT` present. It is **RIGGED** — the
primitives carry `JOINTS_0`/`WEIGHTS_0` and the file has a skin, which Task
10's tool strips before baking the rest pose. Its authored bbox spans
**12.9 m** on the long axis, inside Livyatan's real ~13–17 m range, so the
model is already at real-world scale: it feeds the tool directly in native
metres and `radiusM` falls out of the bbox exactly as designed. (The spec's
"16 m" is approximate prose, not a scale target.)

**Petunias, as inspected.** 781 primitives — 702 `TRIANGLES` (399,895 tris)
and 79 `LINES` primitives, which are SketchUp edge geometry; 11 materials, of
which 6 are textured baseColor-only (`stengel`, `MarianneStonePot2`,
`MarianneSoil2`, `leaf4`, `petunia1`, and `blaadje1` across 417 primitive
instances) and 5 are flat colours (`material`, `Color_007`, and three
`edge_color*` rows covering negligible surface area). **No normal and no
metallicRoughness map anywhere**, so this is the asset that exercises the
tool's flat-normal + constant-mr substitution for real. Textures are JPEG,
8×32 up to 1024×1024. Bbox ~0.49 × 0.87 × 0.55 m — a hanging-basket
silhouette, also already in metres. The 11 materials and the `LINES`
primitives are exactly what the pre-bake below exists to resolve.

The `attribution` string on each generated `MESH_ASSETS` row (Task 4 /
Task 10) is, verbatim:

```
This work is based on "<model name>" (<model url>) by <author> (<profile url>) licensed under CC-BY-4.0
```

**Files:**

- Modify `tools/utils/io/rawDataRegistry.ts` (two `RAW_DATA` entries,
  `meshes.whale`/`meshes.petunias`, `kind: 'file'`, alongside the
  already-landed `meshes.dir`)
- Modify `tools/utils/io/meshSources.ts` (two `MESH_SOURCES` entries — the
  `petunias` row names the PRE-BAKED file, not the Sketchfab download; see
  "Pre-bake" below)
- Create `tools/meshes/prebake/petuniasPrebake.py` (the Blender script) and add
  a `"prebake-petunias"` npm script for it
- Create `data/raw/meshes/whale/LICENSE`, `data/raw/meshes/petunias/LICENSE`,
  and `data/raw/meshes/<key>/README.md` per key — the provenance record
  (licence, URL, author, fetch date, checksum), modelled on
  `data/raw/textures/README.md`, whose `## Attribution` section (line 242)
  carries the exact wording pattern for a CC BY 4.0 source
- Modify `src/data/bodies/sceneMeshBodies.ts` (the two real seed rows,
  replacing the empty array from Task 4)
- **The credit surface** (spec DoD). **Both chosen assets are CC BY 4.0**, so
  both must be credited — this is a licence obligation, not a polish item.
  Four places, all carrying the `attribution` string Task 10's tool wrote onto
  each `MESH_ASSETS` row:
  - `src/components/Splash/Splash.tsx` — the credits paragraph at lines
    196-231, the same surface that already credits Solar System Scope
    (CC BY 4.0) for the planet/moon/ring textures. Add Major and Marianne
    Goudriaan in the same sentence shape.
  - `ATTRIBUTIONS.md` — a `### <asset> — <author>` entry under `## Imagery`
    (the section starts at line 274; `#### Solar System Scope` at 367 is the
    closest analogue).
  - `README.md` — a row in the imagery table under "The data" (table at lines
    83-86).
  - The `data/raw/meshes/<key>/README.md` files above.

  (`attribution: ''` on a generated row means CC0 / no credit required — the
  field supports that, but neither of these two assets uses it.)

**`RAW_DATA` entries are `source: 'gitignored'` — RULED.** This mirrors the
texture precedent (`textures.sssMercury8k` etc., all `'gitignored'`, with only
the combined README/sha256 committed): neither the Sketchfab downloads nor the
pre-baked `petunias.prebaked.glb` goes into git. `.gitignore` already ignores
`/data/**` wholesale with narrow negations for README/sha256/fonts only, so no
new `.gitignore` entry is needed and none should be added.

### Pre-bake: the petunia model's 11 materials

The tool refuses multi-material input by design (Task 10), and that refusal
stands — the `.mesh` format, the renderer and the shaders are single-material
end to end, and widening any of them for one asset would be runtime growth
paid for by an authoring problem. The fix lives entirely upstream of the tool:
a one-off headless Blender pre-bake, run once by hand, whose OUTPUT is what
`MESH_SOURCES` points at.

`tools/meshes/prebake/petuniasPrebake.py`, run as

```
/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/meshes/prebake/petuniasPrebake.py
```

(wrapped as `npm run prebake-petunias`), does, in order:

1. Import `data/raw/meshes/petunias/petunias.glb`.
2. **Delete the edge geometry** — the 79 `LINES` primitives (SketchUp edges)
   and any non-mesh object. They carry no surface and would survive the join
   as degenerate junk.
3. Join the remaining 702 `TRIANGLES` objects into one mesh.
4. Smart-UV-project a SECOND UV set over the joined mesh.
5. Bake `DIFFUSE`, **colour only** (direct and indirect contributions off),
   from all 11 materials into ONE **2048²** albedo atlas.
6. Replace the whole material stack with a single material sampling that
   atlas on the new UV set.
7. Decimate to ≤ ~150k tris.
8. Export `data/raw/meshes/petunias/petunias.prebaked.glb` with only
   `POSITION` / `NORMAL` / `TEXCOORD_0` — no tangents (the tool computes them,
   per Task 10's fallback rule), no joints, no second UV set beyond the baked
   one.

The script is committed for reproducibility, not for CI: **it cannot run in the
test suite** — Blender is not installed on CI, and a bake is minutes of GPU/CPU
work against a gitignored input. That is acceptable coverage-wise because the
script's CONSUMER is the bake tool, and Task 10 already tests that against a
synthetic single-material GLB fixture. The script's own correctness is
established once, by eye, at the verification step below.

**Steps:**

- [ ] Record provenance for both assets in
      `data/raw/meshes/<key>/README.md` + `LICENSE` — model name, author +
      profile URL, model URL, CC BY 4.0, fetch date, sha256 of the downloaded
      file — using the identities in "The two approved assets" above.
- [ ] Add the `RAW_DATA`/`MESH_SOURCES` entries. `meshes.whale` points at the
      Sketchfab download; `meshes.petunias` points at
      `petunias.prebaked.glb`, with a second `RAW_DATA` row for the untouched
      Sketchfab source so the provenance chain is complete. Both
      `source: 'gitignored'`.
- [ ] **Pre-bake the petunia model.** Write
      `tools/meshes/prebake/petuniasPrebake.py` + the `prebake-petunias` npm
      script, then run it. Verify the output before going further:
      `npx gltf-transform inspect data/raw/meshes/petunias/petunias.prebaked.glb`
      must report **1 material, 1 texture, 0 `LINES` primitives**, a single
      mesh (one primitive, or at worst a handful the tool will merge), and a
      triangle count ≤ ~150k — down from 781 primitives / 11 materials / 6
      textures / 399,895 tris. More than one material means the bake did not
      swap the stack and the tool will (correctly) refuse it at the next step;
      surviving `LINES` mean step 2 did not run.
- [ ] Run `npm run build-meshes` for real — confirms the tool (Task 10)
      handles the actual assets (triangle/texture budgets, tangent generation,
      and — since the baked petunia atlas is colour-only — the 1×1 flat-normal
      substitution plus its warning on that key) and writes real
      `meshAssets.generated.ts` rows + `public/data/meshes/*`. Expect
      `normalMapSubstituted: true` on `petunias`; the whale's 3 textures should
      include a real normal map.
- [ ] Rewrite `sceneMeshBodies.ts`: introduce a module-private
      `SEED_MESH_BODIES: readonly MeshBodySeed[]` with the two real
      `{ id, label, meshKey, description }` rows, and make the exported
      `SCENE_MESH_BODIES` be `SEED_MESH_BODIES.map(meshBody)` (Task 5's
      maker). Until now the file exported a bare `[]`; this is the first and
      only task that gives it content.
- [ ] Update the credit surface — all four places listed under **Files**
      above (Splash credits paragraph, `ATTRIBUTIONS.md`, `README.md`'s
      imagery table, the per-key raw README) — carrying each asset's
      `attribution` string from its generated `MESH_ASSETS` row. Both assets
      are CC BY 4.0; shipping either uncredited is a licence violation.
- [ ] `npm test` — full suite green. This is the first point the real
      `SCENE_MESH_BODIES` is non-empty, so it is where Task 6's `every
SCENE_BODIES id resolves a BodyState` invariant actually earns its
      keep: it fails here if a seed row landed without its `ORBITAL_ELEMENTS`
      counterpart.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run perf -- --url http://localhost:<this-worktree's-port>
--scenario earth-surface --frames 30` BEFORE this task's changes are
      visible in a running dev server, saved to a scratchpad file, then
      AFTER, same flags — per the `perf` skill. A neutral-or-negative
      measurement halts the landing pipeline; report the numbers and let
      the user rule on land/park.
- [ ] Visual pass (ask the user — dev server stays running, do not
      restart/kill it): fly-to from search ("whale", "petunias"/"bowl of
      petunias"/"oh no not again"); orbital sunrise crossing the whale
      (Earthshine + umbra visible); glint-to-mesh handoff on approach across
      the 3 px boundary; the pot visible beside the whale, ~40 m behind
      along the orbit; InfoCard description renders for both.
- [ ] **DECISION POINT — the two orbit-trail rings.** `orbitTrailsPass.draw`
      iterates every `ORBITAL_ELEMENTS` row unconditionally
      (`orbitTrailsPass.ts:141-158`, gated only by an apparent-size fade), so
      the whale's and the pot's ~400 km circular rings draw around Earth the
      moment Task 6's rows land — nobody asked for them, and they arrive as a
      side effect. Show them to the user and get an explicit **keep or
      suppress** ruling; do not decide this yourself. **Keep** → no code change,
      but note it in the PR so a reviewer knows it was deliberate.
      **Suppress** → filter `orbitTrailsPass.draw`'s loop to skip ids present
      in `SCENE_MESH_BODIES`, roughly three lines plus a test that the trail
      count excludes them; that fix rides THIS PR, it is not a follow-up.
- [ ] Confirm the Earthshine tone against Earth's real limb. Task 17 reads
      `ATMOSPHERE_PARAMS.earth.groundAlbedo` (`[0.3, 0.3, 0.3]`,
      `atmosphereParams.ts:59`) for the colour, because `EarthBody` carries
      no `albedo` field of its own (`EarthBody.d.ts:17-21`) — a neutral grey
      by construction. If the fill reads too cold against a real Earth
      approach, tune `earthshineStrength` (the local knob) first; changing
      the COLOUR means editing a shared atmosphere constant, which is a
      user-facing decision, not a shader tweak.
- [ ] R2 sync of `public/data/meshes/` noted as a deploy step in
      `docs/DEPLOY.md` (not performed here — a deploy-time action).
- [ ] Write the three backlog detail files for the spec's "Adjacent
      findings" (rotation-table tagged union; hyperbolic Kepler branch;
      surface-fixed position driver) and add their index lines to
      `docs/BACKLOG.md`, per the backlog-hygiene convention.
- [ ] Update the auto-memory file for this effort.
- [ ] Commit.

## Definition of Done

- **Deliverable inventory:** `MeshBody` type + `meshAssets.generated.ts`
  (rows carrying `attribution`) + `sceneMeshBodies.ts` (two real rows) +
  `BodyStore.meshBodies`; two `ORBITAL_ELEMENTS`/`ROTATION_ELEMENTS` rows;
  `Source.MeshBody` + `MESH_BODY_ENTRY` registered in `SOURCE_REGISTRY` + its
  `BODY_PICK_ROWS` row; `description` threaded through
  `BodyInfo`/`SelectionRow`/`BodyDetailCard`; `npm run build-meshes` + its
  five helper files; `meshFetcher`/`meshSlotRegistry`/demand row;
  `bodyStateInHostFrame`/`meshBodiesAttachedTo`/`sunVisibleFraction`;
  `meshBodyRenderer` + its three WESL files; `meshBodiesPass` registered and
  pickable; `tools/meshes/prebake/petuniasPrebake.py` + its
  `prebake-petunias` npm script, committed for reproducibility (not run in
  CI — Blender is not installed there).
- **Credit surface live** (spec DoD): both model authors — Major (whale) and
  Marianne Goudriaan (petunias), both CC BY 4.0 — credited in the Splash
  footer's credits paragraph
  (`src/components/Splash/Splash.tsx:196-231`), `ATTRIBUTIONS.md`,
  `README.md`'s imagery table, and a `data/raw/meshes/<key>/README.md` per
  key. Every string traceable to a `MESH_ASSETS` row's `attribution` field.
- **Provenance recorded before commit** for both raw assets (licence, URL,
  author, fetch date, checksum), and the R2 sync of `public/data/meshes/`
  noted as a deploy step in `docs/DEPLOY.md`.
- **The three "Adjacent findings" backlog detail files** written and their
  index lines added to `docs/BACKLOG.md` (rotation-table tagged union;
  hyperbolic Kepler branch; surface-fixed position driver).
- **Two rulings still open at execution time, both the user's:** the
  orbit-trail rings (keep or suppress, Task 18's visual pass) and the perf
  verdict (land or park, Task 18). Everything else in this plan is settled.
- **The petunia pre-bake verified**: `gltf-transform inspect` on
  `petunias.prebaked.glb` reports 1 material, 1 texture, 0 `LINES`, one mesh,
  ≤ ~150k tris — the tool never sees the 11-material / 781-primitive source,
  and no runtime code learned about multi-material meshes.
- **The whale bakes de-rigged**: its skin and `JOINTS_0`/`WEIGHTS_0` are gone
  from the `.mesh`, its 3 same-material primitives merged into one buffer, and
  its `radiusM` reads ~6.5 m off the native-metre bbox (12.9 m long axis) with
  no rescale applied.
- **Named observable behaviors** (Task 18's visual pass, verbatim): fly-to
  from search for both names and their aliases; orbital sunrise across the
  whale showing Earthshine + umbra darkening; glint-to-mesh handoff with no
  pop at the 3 px boundary; the pot visible beside the whale at its authored
  offset; both InfoCard descriptions render.
- **The deferral boundary:** no shadow map of any kind (analytic
  umbra/penumbra only); no new `SceneBody` motion/orientation mechanism
  beyond the existing orbital-elements + rotation-elements pair; no Voyager,
  no surface-fixed person, no second orientation kind — all three recorded
  as backlog detail files in Task 18, not built here.
