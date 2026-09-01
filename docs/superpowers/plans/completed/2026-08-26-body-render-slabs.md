# Body render slabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisite.** This plan executes on branch `globe-camera`, which already sits on
> post-prep `main` (`bc0f9909c`, PR #635 — prep P1–P4). Do not start Task 1 against a
> tree that predates it. Every "current state" citation below was verified against
> `111d80888`; where the spec's own description of the post-prep state has drifted, the
> task says so explicitly and the code wins.

**Goal:** Give every rendered body its own render pass in that body's body-fixed frame,
in SI metres, with the projection built about the eye — deleting the incumbent
Mpc-frame body-sphere composition path rather than paralleling it, so the Mpc-magnitude
denormal bug class becomes unrepresentable and the tile planner plans in the frame it
draws in.

**Architecture:** `Slab` gains a per-row camera-distance interval in metres and drops the
`Mpc` suffix from its near/far fields; `deriveSlabs` grows body rows (one per visible
body, `frame: { kind: 'body-m', bodyId }`) sorted back-to-front. A `BodyPoseProvider`
seam supplies the body-relative metre pose (provider A: derived from the incumbent
heliocentric f64 camera). `ContentLayer.slab` becomes `number | 'body'`; the frame
program expands the single `foreground:0` render step into a painter-ordered chain of
steps — one NEAR0 star-sphere row plus one row per body — each clearing depth. Caption
occlusion moves from the shared depth texture to `foreground:0`'s alpha coverage,
collapsing `sceneDepth.wesl`'s two flavours into one.

**Tech Stack:** TypeScript (Vite/Vitest), raw WebGPU + WESL/WGSL, `wgpu-matrix`
(`mat4d`) for the f64 compose-then-narrow seam.

**Spec:** [docs/superpowers/specs/2026-08-25-body-render-slabs.md](../specs/2026-08-25-body-render-slabs.md)
— authoritative for every decision this plan does not re-derive. Ruling record:
[docs/grill-sessions/globe-camera-pivot-2026-08-24.md](../../grill-sessions/globe-camera-pivot-2026-08-24.md)
(context only; the spec post-dates it and wins on conflict). **This plan is spec 1 of
two**; spec 2 (the globe-anchored camera pivot, provider B) is out of scope entirely.

## Global Constraints

Quoted verbatim from the spec, binding for every task below:

- **Metres everywhere, in `body-m` slabs (spec §9):** "SI metres throughout the body
  slabs: state, gestures (spec 2), slab uniforms — f64 on the CPU, narrowed to f32 only
  **after** the camera rebase (ruled, S3). Because `body-m` slabs build `vp` about the
  eye, the rebase is structural rather than a per-layer `rebaseViewProj` call: the
  narrow site stays exactly one (`slabViewOf`) for those rows."
- **The one conversion seam (spec §5):** "`bodyRelativePose` is the only module in the
  body path that multiplies or divides by `MPC_TO_M`/`M_TO_MPC`. A grep test asserts it:
  no other file under the body slab path imports those two constants."
- **One `R_body(t)` sample per frame (spec §4):** "`orientationForBody` already has
  exactly one evaluation site (`deriveBodyStates`, memoized per `simDays`). The pose
  provider, the slab rows, and every body layer read that same snapshot via
  `sceneBodyStates(state, ctx)`. Two samples at different `t` is a sub-frame ground
  slide … the single-snapshot rule is what makes it unrepresentable, and spec 2 depends
  on it."
- **Perf halt-on-neutral (spec §10):** "`npm run perf` measured before and after, per the
  `perf` skill, against **this worktree's own dev-server URL**. Neutral-or-better is the
  bar; N passes replacing one merged pass is the specific risk to measure (MERGED vs
  PER-LAYER vs FLOOR). A neutral-or-negative measurement **halts** the landing pipeline
  — land/park is the user's ruling, not process momentum."
- **Acceptance criteria (spec §10), binding on every task:**
  - Visual parity vs `main` at four representative views: (1) whole-globe Earth — limb,
    terminator, atmosphere, cloud shell, caption placement and clipping at the limb;
    (2) Earth close approach at the current zoom floor — tile detail, ocean glint, no UV
    quantization, no black nadir disc; (3) Mars and the Moon resolved with their
    host/satellite neighbours in frame — painter ordering across body rows, occultation
    and transit; (4) solar-system wide, Sun in frame with planets both nearer and
    farther — the §7.1 ordering case, plus glint↔sphere behaviour across the 3 px
    partition boundary.
  - "The Mpc-magnitude denormal class of bug is **unrepresentable**: every body-slab
    uniform is in metres, asserted by the grep test in §5 … plus a unit test that the
    black-nadir arithmetic (`r²` at Earth radius) lands ≥ 1e12 rather than in f32's
    denormal range."
  - "Exactly one body-rendering path: `composeBodyMvp` has no body callers left."
  - "The screen-overlap ⇒ disjoint-interval assertion (§7.2) holds across a fixture set
    including Jupiter+Galileans at quadrature and at transit."

Plus the house rules this plan inherits: `type` aliases never `interface`; one exported
symbol per file in `src/utils/` and `src/@types/` (filename matches the export); any file
move or rename goes through `npm run move-files -- <from> <to>` / `npm run refactor --
move`, never `git mv` + hand-edited imports; comment budget (module header ≤ 10 lines,
comment lines ≤ half the code lines); tests mirror the `src/` tree under `tests/`; every
planned test must be able to fail on a real bug (`conventions/testing.md`).

---

## Strategy

Tasks 1–2 are two standalone pure modules with no dependents yet. Task 3 reshapes `Slab`
(a mechanical, suite-wide rename plus one additive field). Tasks 4–5 grow `deriveSlabs`
into emitting body rows and add the painter-order invariant check — **inert**, because no
layer targets a body row yet, so `executeFrame` finds an empty group and breaks. Tasks
6–7 build the expansion machinery (layer sentinel, executor ordering, frame-program
chain, pick). Task 8 adds the two shared body-slab transform primitives. Tasks 9–11 then
migrate the six body layers onto the machinery — one coherent body-family per task,
each independently visually checkable. Task 12 collapses caption occlusion onto alpha
coverage. Task 13 deletes the incumbent path and installs the structural gates. Task 14
is the measure-and-verify gate the perf-halt rule and the four visual views require.

## File Structure

New files, and the one responsibility each carries:

| file | responsibility | task |
| --- | --- | --- |
| `src/@types/engine/camera/BodyRelativePose.d.ts` | the pose value: eye-relative metre offset + camera basis, both in body-fixed axes | 1 |
| `src/@types/engine/camera/BodyPoseProvider.d.ts` | the seam type spec 2 swaps provider B in behind | 1 |
| `src/services/engine/camera/bodyRelativePose.ts` | provider A, and **the only** Mpc↔metre site in the body path | 1 |
| `src/utils/scene/bodyDrawRadiusM.ts` | one answer to "how big is this body's drawn footprint", shared by the near plane and the painter interval | 2 |
| `src/services/engine/frame/visibleSlabBodies.ts` | which bodies get a row this frame | 4 |
| `src/utils/scene/starSphereRangeM.ts` | the NEAR0 row's interval, from the star spheres actually drawn (§7.1) | 4 |
| `src/utils/scene/chainOverlapViolations.ts` | the screen-overlap ⇒ disjoint-interval invariant (§7.2) | 5 |
| `src/utils/camera/composeBodySlabMvp.ts` | model matrix inside a `body-m` row — translate + scale only | 8 |
| `src/utils/camera/bodySlabCamLocal.ts` | the unit-sphere camera position, now a pure division downstream of the seam | 8 |
| `src/services/gpu/renderers/labels/occlusionCoverageGroup.ts` | the coverage bind group (renamed from `occlusionDepthGroup.ts`) | 12 |

Modified files cluster into four groups, which is also why the tasks split where they do:

- **Frame data** — `Slab.d.ts`, `ContentLayer.d.ts`, `slabs.ts`, `frameContext.ts`,
  `foregroundFrustum.ts`, `scaleUnits.ts` (Tasks 1, 3, 4).
- **Frame machinery** — `executeFrame.ts`, `frameProgram.ts`, `pickProgram.ts`,
  `renderFrame.ts` (Tasks 6, 7).
- **The six body layers + their renderers and shaders** — `passes/{earth,atmosphereShell,cloudShell,planets,texturedBodies,rings}Layer.ts`,
  `gpu/shaders/bodies/**`, `gpu/renderers/bodies/**`, `utils/gpu/pack*Uniforms.ts`,
  `cutSurfaceTiles.ts`, `runFrame.ts` (Tasks 9–11).
- **Overlay occlusion** — `lib/sceneDepth.wesl`, the three `fragmentOcclude.wesl`
  modules, `renderTargets.ts`, the four overlay pass layers and their renderers
  (Task 12).

Untouched, per spec §12: the tile manifest, band predicates, atlas/LRU residency and
fetch machinery; `SurfaceCutTile`'s shape; the `.bin` catalog path; every COSMO layer;
`bodyGlintsLayer`.

## Definition of Done

- **Deliverable inventory:** `src/@types/engine/camera/BodyRelativePose.d.ts`,
  `src/@types/engine/camera/BodyPoseProvider.d.ts`,
  `src/services/engine/camera/bodyRelativePose.ts`,
  `src/utils/scene/bodyDrawRadiusM.ts`, `src/utils/camera/composeBodySlabMvp.ts`,
  `src/utils/camera/bodySlabCamLocal.ts`, `src/utils/scene/chainOverlapViolations.ts`,
  `src/utils/scene/starSphereRangeM.ts`,
  `src/services/engine/frame/visibleSlabBodies.ts`,
  `SCALE_UNITS.MPC_TO_M`; `Slab` carrying `near`/`far`/`distanceRangeM` (no `…Mpc`
  suffix); `ContentLayer.slab: number | 'body'` with `enabled(state, ctx, view)`;
  `frameProgram` emitting a painter-ordered `foreground:0` chain;
  `prepareBodySurfaceFrame` replacing `prepareEarthFrame`;
  `src/services/gpu/shaders/lib/sceneDepth.wesl` carrying exactly one exported test;
  `occlusionDepthGroup.ts` renamed to `occlusionCoverageGroup.ts` and binding the
  `foreground:0` colour view; `composeBodyMvp` with no body callers.
- **Named observable behaviours for the manual smoke pass (Task 14, dev server, f.lux
  off):** the four spec §10 views, each compared side-by-side against `main`; a caption
  over Earth's limb clipped by the opaque globe but **not** by the outer atmosphere
  glow; Moon transiting Earth and Earth transiting the Sun both ordered correctly;
  Saturn's rings intersecting its own globe correctly within one row; picking a body
  still selects the front-most one; and the failure-path check — with no manifest, no
  atlas, and a 404 on every tile, Earth still lands on the picture it draws without
  them.
- **The deferral boundary:** spec 2 (`SurfaceCameraState`, the `h/R` regime boolean,
  re-anchoring, gestures, provider B, `PoseFrame` keyframe/serialization tags) is not
  started here. Also explicitly out: moving the Sun or star spheres onto body slabs;
  `bodyGlintsLayer` (stays `slab: NEAR0`, `target: 'hdr'` per spec §11-O2); the
  distant-planet minimum-on-screen-size clamp (recorded as a slab-row parameter, not
  built); re-deriving `foregroundFrustum`'s bracket now that NEAR0 holds only star
  spheres (spec §11-O4); re-checking the parked descent-island issue (§8 makes it
  re-checkable, it does not check it); any `.bin`/tile re-bake.

---

## Task 1: The pose seam — `MPC_TO_M` and `bodyRelativePose` (provider A)

**Files:**

- Create: `src/@types/engine/camera/BodyRelativePose.d.ts`
- Create: `src/@types/engine/camera/BodyPoseProvider.d.ts`
- Create: `src/services/engine/camera/bodyRelativePose.ts`
- Modify: `src/data/scaleUnits.ts:56-78` (add `MPC_TO_M`)
- Test: `tests/services/engine/camera/bodyRelativePose.test.ts` (create)

**Spec↔code correction — read this before starting.** Spec §3/§9 says `SCALE_UNITS` grows
`M_TO_MPC` **and** `MPC_TO_M` in prep P4. Only `M_TO_MPC` shipped
(`src/data/scaleUnits.ts:46,66`, alongside `KM_TO_M:39,64` and `M_TO_KM:40,65`).
`MPC_TO_M` does not exist anywhere in `src/`. Add it here as `1 / M_TO_MPC`'s value —
derive it the same way the file's neighbours derive theirs (`PC_IN_KM`-based), not as a
runtime reciprocal of `M_TO_MPC`, so both directions round-trip at f64.

**Interfaces:**

```ts
// src/@types/engine/camera/BodyRelativePose.d.ts
export type BodyRelativePose = {
  /** Eye − body centre, expressed in the body's FIXED axes, in metres, f64. */
  readonly eyeRelBodyM: Vec3;
  /** Camera right | up | forward as columns, in the body's fixed axes. */
  readonly basisM: Mat3;
};

// src/@types/engine/camera/BodyPoseProvider.d.ts
/** Null ⇒ this body has no pose this frame (culled). */
export type BodyPoseProvider = (bodyId: BodyId) => BodyRelativePose | null;

// src/services/engine/camera/bodyRelativePose.ts
export function bodyRelativePose(input: {
  readonly bodyId: BodyId;
  readonly camPosMpc: Readonly<Vec3>;
  readonly camBasisWorld: Readonly<Mat3>;
  readonly bodyState: BodyState;
}): BodyRelativePose;
```

- Produces: `bodyRelativePose`, `BodyRelativePose`, `BodyPoseProvider`,
  `SCALE_UNITS.MPC_TO_M` — Tasks 4, 8, 9, 10, 11 all consume these.
- **Behaviour (spec §5):** subtract the body centre in f64 Mpc, scale by `MPC_TO_M`,
  rotate by `orientationᵀ` (the body's local→world rotation inverted — orthonormal, so
  transpose is the inverse), and carry `camBasisWorld` through the same rotation.
  `bodyId` is carried for the caller's benefit and identity checks; it does not change
  the arithmetic.
- **`BodyState` shape (spec↔code, resolved):** spec §3 lists a `BodyState` delta adding
  `radiusM`. **Do not add it.** `BodyState`
  (`src/@types/scene/BodyState.d.ts:28-35`) is `{ positionMpc, orientation,
  meanAnomalyRad }` — a time-varying-state type — and `radiusM` already lives on every
  `SceneBody` arm (`BodySpec:12`, `PlanetBody:20`, `EarthBody:20`, `StarBody:24`).
  `bodyRelativePose` never reads a radius, and `bodyDrawRadiusM` (Task 2) takes the
  registry row. Copying `radiusM` onto `BodyState` would create exactly the mirror-state
  the simplicity convention forbids.

- [x] Add `MPC_TO_M` to `src/data/scaleUnits.ts`'s constant list and to the
      `SCALE_UNITS` object literal + its `Readonly<{…}>` annotation.
- [x] Write `bodyRelativePose` per the signature and behaviour above.
- [x] **Test `bodyRelativePose round-trips world → body → world at Earth`** — build a
      non-identity `orientation` (a real rotation matrix, not the identity — the
      transpose-is-inverse step is silently correct under identity), a camera at a
      known Mpc offset, then rotate `eyeRelBodyM` back by `orientation`, scale by
      `M_TO_MPC`, add `positionMpc`, and assert the result matches `camPosMpc` to
      within 1e-9 Mpc **componentwise**. Repeat the same assertion for a Jupiter-scale
      offset and a moon-scale (Io-orbit) offset — three cases, one test body each.
- [x] **Test `bodyRelativePose resolves ~14 µm at Earth-radius magnitude`** — perturb
      `camPosMpc` by one f64 ULP at Earth-radius magnitude and assert the resulting
      change in `eyeRelBodyM` is non-zero and below 1e-4 m. This is the claim spec §5
      makes about provider A's floor; it fails if the subtraction is done in the wrong
      order (scale-then-subtract loses the cancellation).
- [x] **Test `bodyRelativePose rotates the camera basis into the body frame`** — assert
      `basisM` is orthonormal (columns unit-length, mutually orthogonal to 1e-12) and
      that for an identity `orientation` it equals `camBasisWorld` exactly.
- [x] `npm test -- bodyRelativePose` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 2: `bodyDrawRadiusM` — the body's outermost drawn shell

**Files:**

- Create: `src/utils/scene/bodyDrawRadiusM.ts`
- Test: `tests/utils/scene/bodyDrawRadiusM.test.ts` (create)

**Interfaces:**

```ts
// src/utils/scene/bodyDrawRadiusM.ts
export function bodyDrawRadiusM(body: SceneBody): number;
```

- Produces: `bodyDrawRadiusM` — Task 4 (`deriveSlabs`) is its only consumer.
- **Behaviour (spec §4):** `max(radiusM, atmosphereTopM, cloudShellM, ringOuterM)` over
  the rows the registry declares for this body; bodies with none of the three optional
  shells return `radiusM`. It exists so the near plane and the painter interval cannot
  disagree about how big the body's drawn footprint is.
- **Registry rows to read** (all verified present):
  - atmosphere top — `ATMOSPHERE_PARAMS` (`src/data/bodies/atmosphereParams.ts:32`),
    keyed by body id, radii **in km** (`seededRadiusKm` at `:29`).
  - cloud shell — `CLOUD_SHELL_PARAMS.radiusRatio = 1.002`
    (`src/data/bodies/cloudShellParams.ts:90-99`); a **ratio**, so `radiusM * ratio`.
    Earth is its only consumer today.
  - ring outer — `SCENE_RINGS` (`src/data/bodies/sceneRings.ts:32-39`), `RingSpec`
    carries `innerRadiusKm`/`outerRadiusKm` (`src/@types/scene/RingSpec.d.ts:25-34`);
    Saturn is the only row.
- **Units:** `ATMOSPHERE_PARAMS` and `RingSpec` are km-native **by design** (their WGSL
  structs are km) and stay so — convert with `SCALE_UNITS.KM_TO_M` here. That is not an
  Mpc↔metre crossing and does not touch the §5 one-seam rule.

- [x] Implement `bodyDrawRadiusM`.
- [x] **Test `bodyDrawRadiusM returns the bare radius for a body with no shells`** —
      pick a registry moon with no atmosphere, cloud or ring row; assert `=== radiusM`.
- [x] **Test `bodyDrawRadiusM returns Saturn's ring outer edge`** — assert the result is
      `140_220 * 1000` m (hand-computed from `sceneRings.ts:32-39`), i.e. strictly
      greater than Saturn's `radiusM`.
- [x] **Test `bodyDrawRadiusM returns Earth's atmosphere top, not its cloud shell`** —
      Earth carries both; assert the result equals the atmosphere top in metres and is
      strictly greater than `radiusM * 1.002`. This fails if the `max` fold drops a
      candidate or if the km→m conversion is missing on the atmosphere branch (a
      missing ×1000 would make the cloud shell win — a 1000× wrong near plane).
- [x] `npm test -- bodyDrawRadiusM` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 3: `Slab` reshape — `near`/`far` rename and `distanceRangeM`

**Files:**

- Modify: `src/@types/engine/frame/Slab.d.ts:32-47`
- Modify: `src/services/engine/frame/slabs.ts:152-206` (both row builders)
- Modify: `src/utils/camera/foregroundFrustum.ts` (add `MIN_NEAR_M`)
- Modify: every `Slab` fixture across `tests/` (see blast radius below)
- Test: `tests/services/engine/frame/slabs.test.ts` (modify)

**Current state:** `Slab` carries `nearMpc`/`farMpc` (`Slab.d.ts:32-47`); `originRelative`
already lives one level down inside `Slab.frame` (P1 shipped). No `distanceRangeM`.

**The rename is mechanical and wide.** Use `npm run refactor -- rename` for
`Slab.nearMpc → near` and `Slab.farMpc → far` — do **not** hand-edit. Note the one trap:
`foregroundFrustum` (`src/utils/camera/foregroundFrustum.ts:83-87`) already returns
`{ near, far }`, and `slabs.ts:153` destructures-and-renames it
(`const { near: nearMpc, far: farMpc } = …`); after the rename that alias collapses.
Blast radius verified: dozens of `tests/services/engine/frame/passes/*.test.ts` fixtures
plus `renderFrame.test.ts`, `renderFrame.timing.test.ts`,
`tests/visual/renderFrameSplitBaseline.test.ts` build `Slab` literals by hand.

**Interfaces:**

```ts
// src/@types/engine/frame/Slab.d.ts  (reshaped)
export type Slab = {
  readonly index: number;
  /** Near plane, in THIS slab's units (see `frame.kind`). */
  readonly near: number;
  /** Far plane, in THIS slab's units. Ignored under infinite-far reversed-Z. */
  readonly far: number;
  /** proj·view. For `body-m`, built about the eye — RTC-native, no rebase step. */
  readonly vp: Float64Array;
  readonly frame: SlabFrame;
  /**
   * Camera-distance interval, in METRES, spanned by the depth-bearing content
   * this row contributes. Metres for EVERY row (including `world-mpc` ones) so
   * the painter sort compares across frames without a per-row unit branch.
   */
  readonly distanceRangeM: readonly [number, number];
  readonly precision: 'f32' | 'f64';
  readonly reversedZ: boolean;
};
```

- Produces: the reshaped `Slab` — every later task depends on it.
- **`MIN_NEAR_M`:** add beside the existing `MIN_NEAR_MPC = 2e-22`
  (`foregroundFrustum.ts:57`). Per spec §4, `MIN_NEAR_M` "exists only to keep
  `near > 0`. It is not a denormal dodge." Do **not** derive it from `MIN_NEAR_MPC` —
  that constant's magnitude is the bug this feature deletes. Pick a value that is
  unambiguously a "keep it positive" floor at metre scale (sub-millimetre), and say so
  in one comment line. `MIN_NEAR_MPC` stays for the NEAR0 `world-mpc` row.
- **`distanceRangeM` for the two incumbent rows, this task:** derive it directly from
  each row's existing Mpc bracket (`near`/`far` × `MPC_TO_M`). Task 4 replaces NEAR0's
  with the §7.1 star-sphere derivation; COSMO keeps this one permanently (it never
  enters the painter chain — it is not a `foreground:0` target).

- [x] Run the two renames via `npm run refactor -- rename` (`--dry` first), then
      `npm run typecheck` to catch anything the tool missed.
- [x] Add `MIN_NEAR_M` to `foregroundFrustum.ts` with its one-line justification.
- [x] Add `distanceRangeM` to `Slab.d.ts` with the spec's docblock verbatim, and fill it
      in both `deriveSlabs` row builders.
- [x] **Test `deriveSlabs gives NEAR0 a metre distance range matching its Mpc bracket`**
      — assert `distanceRangeM[0]` is `near * MPC_TO_M` and `[1]` is `far * MPC_TO_M`,
      with a hand-computed metre value for a known camera distance (not recomputed with
      `MPC_TO_M` in the test — write the number). This fails if a row is left holding
      Mpc in a metres-typed field, which is the exact lie the rename exists to prevent.
- [x] Update the `Slab`/`SlabView` fixtures the typecheck flags. Prefer a shared fixture
      helper in `tests/` if the same literal appears in more than ~5 files.
- [x] `npm test` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 4: `deriveSlabs` — body rows, painter sort, `slabName` body form

**Files:**

- Modify: `src/services/engine/frame/slabs.ts` (`deriveSlabs:140-206`, `SLAB_NAME:48-51`,
  `groupKeyOf:63-65`)
- Modify: `src/services/engine/frame/frameContext.ts:178` (the sole `deriveSlabs` call
  site) and its surrounding derivations
- Create: `src/services/engine/frame/visibleSlabBodies.ts`
- Create: `src/utils/scene/starSphereRangeM.ts`
- Test: `tests/services/engine/frame/slabs.test.ts` (modify),
  `tests/services/engine/frame/visibleSlabBodies.test.ts` (create),
  `tests/utils/scene/starSphereRangeM.test.ts` (create)

**Interfaces:**

```ts
// src/services/engine/frame/slabs.ts
export function deriveSlabs(input: {
  readonly cam: OrbitCamera;
  readonly cosmoVp: Mat4;
  readonly pivotRadiusMpc: number | null;
  /** This frame's ONE `R_body(t)` sample — see the shared-sample rule. */
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly pose: BodyPoseProvider;
  readonly visibleBodies: readonly SceneBody[];
  readonly viewportPx: Readonly<Vec2>;
  /** §7.1: the NEAR0 row's interval, from the star spheres actually drawn. */
  readonly starSphereRangeM: readonly [number, number] | null;
}): readonly Slab[];

/** 'NEAR0' | 'COSMO' | `BODY[k]` for k = index − 2. */
export function slabName(index: number): string;

/** Painter-ordered slab indices for the `foreground:0` chain, back-to-front. */
export function foregroundChainOrder(slabs: readonly Slab[]): readonly number[];

// src/services/engine/frame/visibleSlabBodies.ts
export function visibleSlabBodies(input: {
  readonly earth: EarthBody | null;
  readonly planets: readonly PlanetBody[];
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly camPosMpc: Readonly<Vec3>;
  readonly viewportHeightPx: number;
  readonly fovYRad: number;
}): readonly SceneBody[];

// src/utils/scene/starSphereRangeM.ts
export function starSphereRangeM(input: {
  readonly spheres: readonly { positionMpc: Readonly<Vec3>; radiusM: number }[];
  readonly camPosMpc: Readonly<Vec3>;
}): readonly [number, number] | null;
```

- Consumes: `bodyRelativePose`/`BodyPoseProvider` (Task 1), `bodyDrawRadiusM` (Task 2),
  the reshaped `Slab` (Task 3).
- Produces: body slab rows, `slabName`, `foregroundChainOrder` — Tasks 5, 6, 7 consume
  them.

**Signature change.** `deriveSlabs` is positional today
(`deriveSlabs(cam, cosmoVp, pivotRadiusMpc = null)`, `slabs.ts:140-144`). It becomes the
single-object form above, per spec §4.

**Row layout.** Returns `[near0, cosmo, ...bodyRows]`. Body rows are assigned slab
indices `2, 3, …` **in back-to-front painter order** (sorted by `distanceRangeM[0]`
descending), so a body row's index doubles as its painter ordinal —
`slabName(i) = 'BODY[' + (i - 2) + ']'` and `groupKeyOf` needs no new parameter. Index-keyed
lookup (`slabViewOf`, `slabs.ts:217-233`) still holds because `Slab.index` is the array
position.

**Each body row's numbers (spec §4).** For a body at eye-distance `dM` with
`rMaxM = bodyDrawRadiusM(body)`:

```
distanceRangeM = [max(dM − rMaxM, 0), dM + rMaxM]
near           = max(dM − rMaxM, MIN_NEAR_M)
far            = +∞   (infinite-far reversed-Z, as NEAR0 already uses)
frame          = { kind: 'body-m', bodyId: body.id }
precision      = 'f64'
reversedZ      = true
vp             = perspective-reversed-Z about the EYE, in the body's fixed axes
```

`vp` is built from `pose(body.id)` — `basisM` gives the view rotation, and the eye sits at
the origin (that is what "built about the eye" means: no translation term in `view`, and
the body centre appears at `−eyeRelBodyM`). `dM = |eyeRelBodyM|`. A body whose provider
returns `null` gets no row.

**Which bodies get a row (spec §4).** `visibleSlabBodies` filters `[earth, ...planets]`
by `bodyApparentDiameterPx(...) >= SUB_PIXEL_BODY_CULL_PX`
(`src/utils/scene/bodyApparentDiameterPx.ts:31-37`, `subPixelBodyCullPx.ts:19`). **Note
the spec says "plus frustum rejection" — no per-body frustum rejection exists on `main`
today** (only the sub-pixel cull, applied independently by `atmosphereDrawList.ts:65`,
`earthLayer.ts:179`, `cloudShellLayer.ts:120`, `ringsLayer.ts:119`). Do **not** invent
one: pass count is already bounded by the registry (1 Earth + `SCENE_PLANETS.length`,
`src/data/bodies/scenePlanets.ts:14`), and an off-screen body's pass draws nothing. If a
perf measurement in Task 14 shows the empty passes cost, that is when a frustum gate
earns its place.

**The NEAR0 row's `distanceRangeM` (spec §7.1).** Derived from the star spheres actually
drawn this frame, not from `foregroundFrustum`'s bracket: `partitionStarsByResolution`'s
`spheres` output (`src/services/engine/frame/partitionStarsByResolution.ts:63-69`) plus
the field-star sphere when its hysteresis gate is live
(`fieldStarSphereLayer.ts`). `starSphereRangeM` folds that set into
`[min(dM − r), max(dM + r)]`; `null` (empty set) leaves the NEAR0 row out of the painter
chain entirely (Task 7 handles the empty case). If the field-star gate's state proves
unreachable from `deriveFrameContext`, pass only the `partitionStarsByResolution` output
and record the gap as a Task 14 finding — do not reach into layer-local state.

**Where the inputs come from — the ordering landmine.** `deriveSlabs` is called at
`frameContext.ts:178`, inside `deriveFrameContext`, and **`ctx` does not exist yet at
that line** — only its components (`cam:165`, `vp:171`, `canvasSize:170`, `state`,
`simDays`). So `sceneBodyStates(state, ctx)` is not callable there. Call
`deriveBodyStates(simDays)` **directly** and pass the result in. This preserves the
one-sample rule exactly: `deriveBodyStates` memoizes on `simDays` with a module-scope
one-deep cache (`deriveBodyStates.ts:75-79`), so the downstream
`sceneBodyStates(state, ctx)` calls return **the identical Map by reference**. Do not add
a second cache or thread the map through `ctx`.

- [x] Write `starSphereRangeM` and `visibleSlabBodies`.
- [x] **Test `starSphereRangeM spans the drawn set, not the frustum`** — two spheres at
      known Mpc distances with known radii; assert the returned interval's ends are the
      hand-computed `d−r` and `d+r` of the near and far members respectively.
- [x] **Test `starSphereRangeM returns null for an empty set`.**
- [x] **Test `visibleSlabBodies drops a body below the sub-pixel floor`** — one body
      placed so its apparent diameter is just under `SUB_PIXEL_BODY_CULL_PX` and one
      just over; assert only the second survives.
- [x] Convert `deriveSlabs` to the object signature, add `slabName` (replacing the
      `SLAB_NAME` record at `slabs.ts:48-51`; keep `groupKeyOf`'s `·` separator and its
      wire-format comment at `:56-65`), add `foregroundChainOrder`, and emit body rows.
- [x] **Test `deriveSlabs emits one body row per visible body, back-to-front`** — three
      bodies at distinct distances; assert `slabs.length === 2 + 3`, that
      `slabs[2].distanceRangeM[0] > slabs[3].distanceRangeM[0] > slabs[4].distanceRangeM[0]`,
      and that each row's `frame` is `{ kind: 'body-m', bodyId: <expected> }`.
- [x] **Test `deriveSlabs brackets a body row around its drawn radius`** — one body at a
      hand-picked `dM` with a hand-picked `rMaxM`; assert `near === dM − rMaxM` and
      `distanceRangeM === [dM − rMaxM, dM + rMaxM]` against numbers written out, not
      recomputed from `bodyDrawRadiusM` in the test.
- [x] **Test `deriveSlabs floors a body row's near plane at MIN_NEAR_M`** — camera inside
      the drawn radius (`dM < rMaxM`), so the unfloored near would be negative; assert
      `near === MIN_NEAR_M` and `distanceRangeM[0] === 0`.
- [x] **Test `deriveSlabs builds a body row's vp about the eye`** — assert that
      projecting `eyeRelBodyM`'s negation (the body centre) through `slabs[2].vp` lands
      on the screen centre for a camera pointed at the body, and that the `vp`'s
      translation column is zero (the eye is the origin). This is the RTC-native claim;
      it fails if a world translation leaks back in.
- [x] **Test `slabName names body rows by painter ordinal`** — `slabName(0) === 'NEAR0'`,
      `slabName(2) === 'BODY[0]'`, `slabName(5) === 'BODY[3]'`.
- [x] Rewire `frameContext.ts:178`: hoist `deriveBodyStates(simDays)` above the call,
      build `visibleBodies`, build the `pose` closure over `bodyRelativePose`, and pass
      the object. Verify by reading the file that every value the object needs is already
      derived above line 178; hoist any that is not.
- [x] `npm test` → green (the new rows are inert — no layer targets them yet).
      `npm run typecheck`.
- [x] Commit.

---

## Task 5: The screen-overlap ⇒ disjoint-interval invariant

**Files:**

- Create: `src/utils/scene/chainOverlapViolations.ts`
- Modify: `src/services/engine/frame/slabs.ts` (dev-gated call)
- Test: `tests/utils/scene/chainOverlapViolations.test.ts` (create)

**Interfaces:**

```ts
// src/utils/scene/chainOverlapViolations.ts
export type ChainRow = {
  readonly index: number;
  readonly distanceRangeM: readonly [number, number];
  /** Screen-space bounding circle of this row's drawn content, in CSS px. */
  readonly centrePx: Readonly<Vec2>;
  readonly radiusPx: number;
};

/** Pairs whose screen circles overlap AND whose distance intervals also overlap. */
export function chainOverlapViolations(
  rows: readonly ChainRow[],
): readonly (readonly [number, number])[];
```

- Consumes: nothing from earlier tasks beyond the `Slab` shape.
- Produces: `chainOverlapViolations` — Task 14 cites it in the acceptance gate.

**The invariant (spec §7.2), stated exactly:** "For any pair of chain rows whose
**screen-space bounding circles overlap**, their `distanceRangeM` intervals must be
disjoint." S6's literal "intervals never overlap" is too strong — Jupiter and Io overlap
in distance at quadrature every frame (`r_J + r_Io ≈ 71,700 km` against Io's 421,700 km
orbit) while being cleanly separated at transit. Rows that do not overlap on screen
cannot paint over each other, so their order is irrelevant.

**Cost:** O(N²) over ≤27 rows. Wire it as a **dev-only** call in `deriveSlabs` behind
`import.meta.env.DEV` that `console.warn`s the offending pair — an overlap is a painter
ordering error, never a crash. Do not add a settings toggle for it.

- [x] Implement `chainOverlapViolations`.
- [x] **Test `chainOverlapViolations reports nothing for Jupiter + Galileans at
      transit`** — a fixture where Io's circle overlaps Jupiter's on screen and the two
      distance intervals are separated (Io in front). Assert `[]`.
- [x] **Test `chainOverlapViolations reports nothing for Jupiter + Io at quadrature`** —
      distance intervals overlap, screen circles do **not**. Assert `[]`. This is the
      test that fails if someone re-implements S6's literal always-disjoint reading.
- [x] **Test `chainOverlapViolations reports a genuine painter-order violation`** — two
      rows whose screen circles overlap *and* whose intervals overlap; assert the pair
      is returned.
- [x] Wire the dev-gated warn in `deriveSlabs`, sourcing `centrePx`/`radiusPx` from the
      apparent radius `bodyApparentDiameterPx` already computes for the visibility gate.
- [x] `npm test -- chainOverlapViolations` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 6: `ContentLayer.slab: number | 'body'` and the executor's resolve-before-filter

**Files:**

- Modify: `src/@types/engine/frame/ContentLayer.d.ts:34-128`
- Modify: `src/services/engine/frame/executeFrame.ts:191-227`
- Modify: every `ContentLayer` in `src/services/engine/frame/passes/*.ts` (`enabled`
  signature)
- Test: `tests/services/engine/frame/executeFrame.test.ts` (modify)

**Interfaces:**

```ts
// src/@types/engine/frame/ContentLayer.d.ts  (delta — the rest of the type is unchanged)
export type ContentLayer = {
  // …
  /**
   * Slab index, or `'body'` — expanded by the frame program into one step per
   * body-slab row. A `'body'` layer reads `view.slab.frame.bodyId` to know
   * which body it is drawing.
   */
  readonly slab: number | 'body';
  /** Now takes the resolved view: a `'body'` layer gates per body row. */
  enabled(state: EngineState, ctx: ReadyFrameContext, view: SlabView): boolean;
  // …
};
```

- Consumes: `slabName`/body rows (Task 4).
- Produces: the `'body'` sentinel and the three-arg `enabled` — Tasks 7, 9, 10, 11
  depend on both.

**The executor change (spec §6).** Today `executeFrame.ts:197-208` filters the group
(including `l.enabled(state, ctx)`) and only *then* resolves
`const view = slabViewOf(ctx, step.slab)`. Invert it: resolve `view` first, then filter,
because `enabled` now needs it. Keep the empty-group early-exit *after* the resolve — a
step whose group is empty must still cost nothing beyond the resolve. The layer/step
match becomes:

```
l.target === step.target && (l.slab === step.slab ||
  (l.slab === 'body' && ctx.slabs[step.slab].frame.kind === 'body-m'))
```

- [x] Widen `ContentLayer.slab` and add the `view` parameter to `enabled`. Update
      `pickEnabled` to the same three-arg shape (it is the pick-side twin of `enabled`
      and `pickProgram` resolves a `SlabView` per slab already,
      `pickProgram.ts:189`).
- [x] Update every layer in `passes/` to the new `enabled`/`pickEnabled` signature —
      most simply gain an unused third parameter at this task; Tasks 9–11 give the six
      body layers a real per-row gate.
- [x] Invert the resolve/filter order in `executeFrame` and widen the match.
- [x] **Test `executeFrame runs a 'body' layer once per body-slab step`** — a fixture
      `ctx` with two `body-m` rows and a program with two `foreground:0` steps against
      them; assert the layer's `draw` is called twice, with a different
      `view.slab.frame.bodyId` each time.
- [x] **Test `executeFrame gates a 'body' layer per row`** — the layer's `enabled`
      returns `true` for one `bodyId` and `false` for the other; assert exactly one
      `draw`.
- [x] **Test `executeFrame passes the resolved view to enabled`** — assert `enabled`
      received the same `SlabView` object the layer's `draw` later receives (`toBe`).
      This fails if someone resolves the view twice.
- [x] **Test `executeFrame does not match a 'body' layer against a world-mpc step`** —
      a `foreground:0`/NEAR0 step with only a `'body'` layer registered; assert no
      `draw`.
- [x] `npm test` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 7: `frameProgram` foreground chain, timing slots, and pick expansion

**Files:**

- Modify: `src/services/engine/frame/frameProgram.ts:87-179` (the builder),
  `:235-251` (`PASS_GROUP_TITLES`), `:260-296` (`timedSlotRowsOf`), `:377-384`
  (`TIMED_SLOTS`/`TIMED_SLOT_GROUPS`)
- Modify: `src/services/engine/frame/renderFrame.ts:98` (the sole call site)
- Modify: `src/services/engine/frame/pickProgram.ts:229-242` (`pickablesBySlab`)
- Test: `tests/services/engine/frame/frameProgram.test.ts` (modify),
  `tests/services/engine/frame/pickProgram.test.ts` (modify),
  `tests/services/engine/frame/timedSlotsGroupKeys.test.ts` (modify)

**Spec↔code correction — read this before starting.** The task brief and spec §2 describe
prep P2 as having given `frameProgram` "step-expansion and ordering hooks." It did not.
`frameProgram(tone: ToneMap, bloomEnabled: boolean): readonly FrameStep[]`
(`frameProgram.ts:87`) is a function that pushes a **fixed** hand-ordered literal list;
`FrameStep`'s render variant is `{ kind: 'render'; target: string; slab: number;
depthLoad?: 'clear' | 'load' }` (`src/@types/engine/frame/FrameStep.d.ts:43-59`) with no
expansion field. P3's `depthLoad` **did** ship (`executeFrame.ts:125-128`,
`depthLoadOpFor`). The doc comment at `frameProgram.ts:144-146` already names this gap.
Building the expansion is this task's work.

**Interfaces:**

```ts
// src/services/engine/frame/frameProgram.ts
export function frameProgram(
  tone: ToneMap,
  bloomEnabled: boolean,
  /** Painter-ordered slab indices for the `foreground:0` chain (Task 4). */
  foregroundChain: readonly number[],
): readonly FrameStep[];

/** 1 Earth + SCENE_PLANETS.length — the pass-count ceiling the registry sets. */
export const BODY_SLAB_CAPACITY: number;
```

- Consumes: `foregroundChainOrder`, `slabName` (Task 4); the `'body'` sentinel (Task 6).
- Produces: the expanded program and the widened `TIMED_SLOTS` pool.

**The expansion (spec §6, §7.4).** The single
`{ kind: 'render', target: 'foreground:0', slab: NEAR0 }` step becomes **N steps in
painter order against the same target**, one per `foregroundChain` entry, each carrying
`depthLoad: 'clear'` (spec §7.3: "Each chain row clears depth and loads colour" —
colour-load falls out of `executeFrame`'s existing `touched` set, which is already
correct after the first chain step). Everything else in the step list — position of the
chain between `render(hdr, NEAR0)` and `composite(foreground:0 → hdr)`, the bloom
branch, the tone-map, the two `swap` steps — is unchanged.

**Timing slots (spec §6).** `TIMED_SLOTS` is a module constant
(`frameProgram.ts:377-380`) built from `frameProgram(PLACEHOLDER_TONE, true, …)`. Build
it with the **maximum** chain — `[NEAR0, 2, 3, …, 2 + BODY_SLAB_CAPACITY − 1]` — so the
pool size is derived from the registry, never authored. `timedSlotRowsOf`'s layer match
(`:260-296`) must widen the same way `executeFrame`'s did (Task 6), except it has no
`ctx`: match a `'body'` layer against any step whose slab index is ≥ 2. All body slots
share the existing `'Foreground bodies · depth'` title — add the `BODY[k]` group keys to
`PASS_GROUP_TITLES` (`:242` carries `'foreground:0·NEAR0'` today) by deriving them from
`slabName`, not by writing 26 literal rows. Unused slots read zero and their rows drop
from the DebugPanel's grouped list exactly as an empty group does today
(`src/components/DebugPanel/GpuTimingsSection.tsx:51,157` iterates `TIMED_SLOT_GROUPS`).

**Pick (spec §7.4).** `pickablesBySlab` (`pickProgram.ts:229-242`) takes distinct
`l.slab` values through a `Set` and sorts them numerically — `'body'` breaks both. Expand
it the same way: a `'body'` layer contributes to every `body-m` slab index in
`ctx.slabs`. Painter order back-to-front means the nearest row's ids overwrite the
farther rows', matching `frontmostPick`'s existing CPU fold.

- [x] Add the `foregroundChain` parameter and the expansion; derive `BODY_SLAB_CAPACITY`
      from `SCENE_PLANETS.length` + 1.
- [x] **Test `frameProgram emits today's exact list when the chain is [NEAR0]`** — the
      P2 no-behaviour-change gate the spec §13 requires. Compare against the existing
      expected list in `frameProgram.test.ts:86`.
- [x] **Test `frameProgram expands the foreground chain in painter order`** — chain
      `[NEAR0, 3, 2]`; assert three consecutive `foreground:0` render steps with slabs
      `0, 3, 2` in that order, each `depthLoad: 'clear'`, and that the surrounding steps
      (the preceding `hdr`/NEAR0 render, the following `foreground:0 → hdr` composite)
      are unmoved.
- [x] **Test `frameProgram emits no foreground chain step for an empty chain`** — assert
      the `foreground:0 → hdr` composite still follows (a frame with no bodies and no
      resolved star sphere must still composite a cleared target, or the previous
      frame's foreground persists).
- [x] **Test `TIMED_SLOTS allocates one body slot per registry row`** — assert
      `TIMED_SLOTS` contains `foreground:0·BODY[0]` through
      `foreground:0·BODY[BODY_SLAB_CAPACITY − 1]` and nothing beyond. (Assert the
      endpoints and the count, not the full literal list — a registry restatement would
      break on every new planet.)
- [x] **Test `every body slot falls under the Foreground bodies group`** — assert
      `TIMED_SLOT_GROUPS` puts `foreground:0·BODY[0]` under
      `'Foreground bodies · depth'`, alongside `foreground:0·NEAR0`.
- [x] Widen `pickablesBySlab`; update `renderFrame.ts:98` to pass
      `foregroundChainOrder(ctx.slabs)` (`ctx` is in scope there — verified).
- [x] **Test `pickProgram groups a 'body' layer into every body slab`** — a fixture
      `ctx` with two `body-m` rows; assert two pick passes for the one `'body'` layer.
- [x] `npm test` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 8: The two body-slab transform primitives

**Files:**

- Create: `src/utils/camera/composeBodySlabMvp.ts`
- Create: `src/utils/camera/bodySlabCamLocal.ts`
- Test: `tests/utils/camera/composeBodySlabMvp.test.ts` (create),
  `tests/utils/camera/bodySlabCamLocal.test.ts` (create)

**Interfaces:**

```ts
// src/utils/camera/composeBodySlabMvp.ts
/** vp · translate(−eyeRelBodyM) · scale(radiiM). Returns RAW f64 — caller narrows. */
export function composeBodySlabMvp(
  slabVp: Float64Array,
  eyeRelBodyM: Readonly<Vec3>,
  radiusM: number,
  oblateness?: number,
): Float64Array;

// src/utils/camera/bodySlabCamLocal.ts
/** eyeRelBodyM ÷ the body's per-axis metre radii → the unit-sphere frame. */
export function bodySlabCamLocal(
  eyeRelBodyM: Readonly<Vec3>,
  radiusM: number,
  oblateness?: number,
): Vec3;
```

- Consumes: `BodyRelativePose` (Task 1), the `body-m` `Slab.vp` (Task 4).
- Produces: the two primitives Tasks 9–11 use in place of `composeBodyMvp` and
  `camPosLocal`.

**Why these replace the incumbents (spec §5, §9).** In a `body-m` slab the frame is
already the body's fixed axes and `vp` is already built about the eye, so the model
matrix collapses to `translate(−eyeRelBodyM) · scale(radiiM)` — **no rotation term** (the
frame carries it) and **no world translation** (the eye is the origin). `composeBodyMvp`
(`src/utils/camera/composeBodyMvp.ts:106-113`) does all four; it survives only for star
spheres in the `world-mpc` NEAR0 row (spec §11-O3).

`bodySlabCamLocal` is `camPosLocal`'s job (`src/utils/camera/camPosLocal.ts:89-95`) —
"put the camera in the frame where the body is the unit sphere, per-axis-scaled for
oblateness" — reduced to a pure division now that the rotation and the Mpc subtraction
happen upstream at the seam. Match `camPosLocal`'s oblateness convention exactly (read
its module header) so the shells that consume it are unchanged.

Both return f64. Narrowing stays at the GPU-upload boundary in the consuming layer, as
today.

- [x] Implement both.
- [x] **Test `composeBodySlabMvp puts the body centre at the eye-relative offset`** —
      project the origin (the body centre in the model frame) and assert it lands where
      `slabVp` maps `−eyeRelBodyM`. Hand-build a simple `slabVp` (an identity-ish
      orthographic) so the expectation is computed independently of the function.
- [x] **Test `composeBodySlabMvp scales the unit sphere to metres`** — assert the model
      scale is `radiusM` by projecting a unit-X point and comparing against the
      hand-computed metre position.
- [x] **Test `composeBodySlabMvp squares Earth's radius outside f32's denormal range`** —
      the spec §10 structural criterion, made concrete: assert `radiusM * radiusM` for
      Earth's `radiusM` is ≥ 1e12 (it is ≈4.06e13), and — as the contrast the test
      exists to pin — that the same square in Mpc (≈4.3e-42) is below f32's smallest
      normal, 1.18e-38. This is the black-nadir bug reduced to arithmetic; it fails if a
      radius ever comes back in Mpc.
- [x] **Test `bodySlabCamLocal puts the camera at unit distance on the surface`** —
      `eyeRelBodyM` exactly one radius out along +X returns `[1, 0, 0]`.
- [x] **Test `bodySlabCamLocal applies oblateness per-axis`** — a non-zero oblateness
      with an offset that has both equatorial and polar components; assert the polar
      component is divided by the flattened radius, hand-computed.
- [x] `npm test -- composeBodySlabMvp bodySlabCamLocal` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 9: Earth rides its body slab — base globe, detail tiles, slab-native planner

> **Read first:** `.claude/skills/wesl-shaders/SKILL.md` (WESL linker constraints — the
> `package::` import rules and the "unexpected token" traps are not documented upstream)
> and [`docs/RENDERER.md`](../../RENDERER.md) in full. The Earth tile landmines in
> §"Things that have bitten us before" — `textureSampleLevel` never `textureSample`, the
> tier-dependent base level, the three-different-floors note, `TextureAtlas.allocate`
> returning `null`, and the deliberate `flipY` asymmetry — are all live in this task's
> blast radius and none of them change.

**Files:**

- Modify: `src/services/engine/frame/passes/earthLayer.ts` (whole file; the layer row at
  `:156`, `prepareEarthFrame` at `:114-124`, the `composeBodyMvp`/`camPosLocal` pair at
  `:137-149`, the tile draw at `:254-281`)
- Modify: `src/utils/scene/cutSurfaceTiles.ts:31-63` (param units)
- Modify: `src/services/engine/frame/runFrame.ts:601-618` (the tile-planning block)
- Modify: `src/services/gpu/shaders/bodies/earthSurfaceTile/io.wesl`
  (`SurfaceTileUniforms`), `src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts`
  (`writeSurfaceTileUniforms`), `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts`
- Test: `tests/services/engine/frame/passes/earthLayer.test.ts`,
  `tests/utils/scene/cutSurfaceTiles.test.ts` (both modify)

**Interfaces:**

```ts
// src/services/engine/frame/passes/earthLayer.ts  (prepareEarthFrame → body-generic)
export type PreparedBodySurfaceFrame = {
  readonly body: SceneBody;
  readonly bodyState: BodyState;
  readonly pose: BodyRelativePose;
  readonly radiusM: number;
  /** composeBodySlabMvp result — RAW f64; the tile planner needs it un-narrowed. */
  readonly mvpLocal: Float64Array;
  /** bodySlabCamLocal result — dimensionless body-radius units. */
  readonly camLocal: Vec3;
};

export function prepareBodySurfaceFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
): PreparedBodySurfaceFrame | null;
```

```ts
// src/utils/scene/cutSurfaceTiles.ts  (param delta only — the rest is unchanged)
  /** Eye − body centre in the body's fixed axes, METRES (was body-radii units). */
  readonly camPosLocalM: Readonly<Vec3>;
  /** The body slab's own f64 vp — metres, built about the eye. */
  readonly viewProjLocal: Float64Array;
  /** The body's equatorial radius in metres — was implicit (unit sphere). */
  readonly radiusM: number;
```

- Consumes: Tasks 1, 6, 7, 8.
- Produces: `prepareBodySurfaceFrame` — Tasks 10, 11 reuse the same pattern (they do not
  import it; each layer prepares its own row).

**What changes, precisely.**

1. `earthLayer.slab` becomes `'body'`; `enabled(state, ctx, view)` returns
   `view.slab.frame.kind === 'body-m' && view.slab.frame.bodyId === 'earth'` — plus the
   existing sub-pixel gate at `:179`, which now has no work to do (Task 4 already culled
   the row) but is cheap and keeps the layer honest standalone. Per spec §6, Earth is
   simply the only body whose registry row carries a tile source; nothing about the tile
   pipeline stays Earth-typed after this beyond that row.
2. `prepareEarthFrame` → `prepareBodySurfaceFrame`, keyed off `view.slab.frame.bodyId`
   rather than hard-wired to `state.data.bodies.earth`. **Keep the
   `WeakMap<ReadyFrameContext, …>` memo** (`earthLayer.ts:110`) but key it on
   `(ctx, bodyId)` — a single-`ctx` memo now serves N rows and would return Earth's
   frame for Mars.
3. `composeBodyMvp` → `composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM)`;
   `camPosLocal` → `bodySlabCamLocal(pose.eyeRelBodyM, radiusM)`. The
   `radiusM * SCALE_UNITS.M_TO_MPC` line at `:135` and the `M_TO_MPC` import go.
4. The tile draw's `rebaseViewProj(view.slab.vp, view.camPos)` at `:254-281` **is
   deleted** — spec §9: under a `body-m` row the rebase is structural, so
   `view.slab.vp` is already eye-relative. Passing `view.camPos` (a heliocentric Mpc
   vector) into a metre-frame `vp` would be a silent 3e22× error.
5. `SurfaceTileUniforms` (`earthSurfaceTile/io.wesl`) — `radiusMpc: f32` → `radiusM`,
   `camPosRelBodyMpc: vec3f` → `camPosRelBodyM`. **Field order, sizes and the 176-byte
   total are unchanged** — this is a rename plus a unit change on the CPU side, not a
   layout change. `writeSurfaceTileUniforms` is the single source of truth for the
   packing; the WESL struct must agree byte-for-byte (RENDERER.md's WGSL/TS parity
   note). That struct's docblock records *why* it carries a Mpc camera vector rather
   than a dimensionless one (ocean-glint view-vector degeneration at metre altitude) —
   rewrite that comment: in metres the vector no longer cancels, which is the point.
6. `cutSurfaceTiles`'s walk (horizon cull, frustum + projected screen extent, LOD bias
   against `screenPx`) is unit-agnostic (spec §8) — it changes from body-radii to metres
   and gains `radiusM` as a parameter instead of assuming a unit sphere. Its
   `viewProjLocal: Float64Array` **stays f64** as a belt-and-braces contract even though
   the `w`-row cancellation that forced it no longer occurs; say so in one line where the
   existing comment explains the old reason.
7. `runFrame.ts:601-618`: `slabViewOf(ctx, NEAR0)` becomes a lookup of Earth's body row.
   Resolve it from `ctx.slabs` by `frame.kind === 'body-m' && frame.bodyId === 'earth'`;
   no row ⇒ skip tile planning entirely (Earth is culled).

- [x] Rename and re-key `prepareBodySurfaceFrame` (use `npm run refactor -- rename` for
      the symbol; it stays in `earthLayer.ts` per the shipped `prepareStarCut` precedent).
- [x] **Test `prepareBodySurfaceFrame memoizes per (ctx, body)`** — call twice for the
      same ctx and body, assert the same object (`toBe`); call for a second `bodyId` on
      the same ctx, assert a *different* object and a different `pose`. The second half
      is the load-bearing one — a ctx-keyed memo returning Earth's frame for Mars is the
      exact bug shape RENDERER-adjacent memos have shipped before.
- [x] **Test `prepareBodySurfaceFrame composes from the slab f64 vp, not the f32 vp`** —
      mock `composeBodySlabMvp` (the file's existing mock pattern at
      `earthLayer.test.ts:49-51`) and assert the first argument `toBe(view.slab.vp)` and
      `not.toBe(view.vp)`.
- [x] Convert `earthLayer` to `slab: 'body'` with the per-row `enabled` gate; swap in the
      two primitives; delete the `rebaseViewProj` call and the `M_TO_MPC` import.
- [x] Convert `cutSurfaceTiles`'s parameters and internals to metres + `radiusM`.
- [x] **Test `cutSurfaceTiles culls beyond the horizon in metres`** — retarget the
      existing horizon test at metre inputs with an explicit `radiusM`; assert a tile
      just past the geometric horizon for a hand-computed altitude is absent from `cut`.
- [x] **Test `cutSurfaceTiles refines to the same level in metres as in radii`** — feed
      the metre form of an input the existing LOD test already covers in radii and
      assert the same `zWin`. This is the unit-agnosticism claim; it fails if a
      radius-normalisation was dropped rather than parameterized.
- [x] Convert `SurfaceTileUniforms` + `writeSurfaceTileUniforms` to metres. Run the
      existing uniform byte-layout parity test; if none covers this struct, add one
      asserting the 176-byte total and the offsets of the two renamed fields (a
      keep-rule test per `conventions/testing.md` — iOS silently drops the whole frame
      on a mislaid uniform).
- [x] Rewire `runFrame.ts`'s tile-planning block to Earth's body row.
- [x] `npm test` → green. `npm run typecheck`.
- [x] **Dev-server check (report to the user, do not self-attest):** whole-globe Earth
      and Earth close approach at the zoom floor. Look for: no black nadir disc, tile
      detail present, ocean glint stable, no UV quantization. Atmosphere and clouds will
      look wrong at this point — they are still in NEAR0 and land in Task 10.
- [x] Commit.

---

## Task 10: Atmosphere and cloud shells ride body slabs

> **Read first:** `.claude/skills/wesl-shaders/SKILL.md` and
> [`docs/RENDERER.md`](../../RENDERER.md). Note the shipped landmine that these two
> layers **depth-test but do not depth-write** — Task 12 depends on that staying true.

**Files:**

- Modify: `src/services/engine/frame/passes/atmosphereShellLayer.ts` (layer row at `:77`,
  `composeBodyMvp` at `:96`, `camPosLocal` at `:113`, `M_TO_MPC` at `:95`)
- Modify: `src/services/engine/frame/passes/cloudShellLayer.ts` (layer row at `:126`,
  `composeBodyMvp` at `:154`, `M_TO_MPC` at `:106,115,153`)
- Modify: `src/services/engine/frame/encodeAtmosphereSkyView.ts:90,93` and
  `src/services/engine/frame/atmosphereDrawList.ts:60,65` if they feed these layers
- Modify: `src/services/gpu/shaders/lib/sphere.wesl` (`AtmosphereUniforms`,
  `CloudShellUniforms`) + the matching `packAtmosphereUniforms.ts` /
  `packCloudShellUniforms.ts` in `src/utils/gpu/`
- Test: `tests/services/engine/frame/passes/atmosphereShellLayer.test.ts`,
  `tests/services/engine/frame/passes/cloudShellLayer.test.ts` (both modify)

- Consumes: Tasks 6, 7, 8.

**What changes.** Same five moves as Task 9's items 1, 3, 5: `slab: 'body'` with a
per-row `enabled` gate reading `view.slab.frame.bodyId`; `composeBodyMvp` →
`composeBodySlabMvp`; `camPosLocal` → `bodySlabCamLocal`; `M_TO_MPC` imports deleted.
`atmosphereShellLayer` is already body-generic (it reads `ATMOSPHERE_PARAMS` per body,
`atmosphereParams.ts:32`); `cloudShellLayer` reads `CLOUD_SHELL_PARAMS.radiusRatio`
(`cloudShellParams.ts:90-99`) and today gates on Earth alone (`:120`) — widen its gate to
"this row's body has a cloud-shell row," which for now still means Earth only. Do not
invent per-body cloud parameters; the ratio is a single shared constant on `main` and
staying that way is the lean choice.

**`AtmosphereUniforms.bottomRadius`** is km-native today via `seededRadiusKm`
(`atmosphereParams.ts:29`) and its WGSL struct is km-native by design. Leave the km
boundary where it is — `ATMOSPHERE_PARAMS` already declares itself "the boundary crossed
here and nowhere else" (`atmosphereParams.ts:27-28`), and km↔m is not the Mpc↔metre seam
§5 governs. What must go is the `M_TO_MPC` multiply, not the km convention.

- [x] Convert `atmosphereShellLayer` and `cloudShellLayer` to `slab: 'body'` with per-row
      gates.
- [x] Swap both layers onto the Task 8 primitives; delete their `M_TO_MPC` imports.
- [x] **Test `atmosphereShellLayer draws only for its own body's row`** — a fixture with
      two `body-m` rows (earth, mars); assert one draw per row with the right
      `ATMOSPHERE_PARAMS` entry, and no draw for a body with no atmosphere row.
- [x] **Test `cloudShellLayer is disabled on a non-Earth body row`.**
- [x] **Test `atmosphereShellLayer composes from the slab f64 vp`** — the same
      `toBe(view.slab.vp)` / `not.toBe(view.vp)` seam assertion the sibling layers carry.
- [x] Update `packAtmosphereUniforms` / `packCloudShellUniforms` and their WESL structs
      for any field whose unit changed. If nothing but `mvp` changed, say so and skip —
      do not churn a struct that does not need it.
- [x] `npm test` → green. `npm run typecheck`.
- [x] **Dev-server check (report to the user):** whole-globe Earth — limb, terminator,
      atmosphere gradient, cloud shell. Compare against `main` side by side.
- [x] Commit.

---

## Task 11: Planets, textured bodies and rings ride body slabs

> **Read first:** `.claude/skills/wesl-shaders/SKILL.md` and
> [`docs/RENDERER.md`](../../RENDERER.md).

**Files:**

- Modify: `src/services/engine/frame/passes/planetsLayer.ts` (`:89`, `:143-144`, `:160`,
  `:223`, `M_TO_MPC` at `:10`)
- Modify: `src/services/engine/frame/passes/texturedBodiesLayer.ts` (`:107`, `:137`,
  `:141-159`, `M_TO_MPC` at `:34`)
- Modify: `src/services/engine/frame/passes/ringsLayer.ts` (`:129`, `:112`, `:150-166`)
- Modify: `src/services/gpu/shaders/lib/sphere.wesl` (`LitBodyUniforms`,
  `TexturedBodyUniforms`, `RingUniforms`) + `packLitBodyUniforms.ts`,
  `packTexturedBodyUniforms.ts`, `packRingUniforms.ts` in `src/utils/gpu/`
- Test: the three matching files under `tests/services/engine/frame/passes/` (modify)

- Consumes: Tasks 6, 7, 8.

**What changes.** The same moves as Task 10, plus one filter: `planetsLayer` and
`texturedBodiesLayer` consume opposite branches of `sceneBodyPartition`
(`src/services/engine/frame/sceneBodyPartition.ts`), which returns
`{ glints, flat, textured }` from `partitionBodiesByPresentation`
(`partitionBodiesByPresentation.ts:72-78`, `BODY_GLINT_MAX_PX = 3` at `:48`). Under
`slab: 'body'` each layer draws **at most one body per row** — its branch filtered to
`view.slab.frame.bodyId`. Keep the shared partition adapter: its whole reason for
existing is that two layers spelling the residency lookup separately can double-draw the
same body, and N rows makes that worse, not better.

**The sphere↔dot partition survives, inside the one path (spec §6).**
`partitionBodiesByPresentation` still decides glint / flat / textured — a *presentation*
choice. What it no longer decides is which code path a body takes.

**`bodyGlintsLayer` is NOT touched** (spec §11-O2, ruled): it stays `slab: NEAR0`,
`target: 'hdr'`. The glint is depthless additive emission into the HDR accumulator — the
same mechanism star points use and the reason bloom picks it up. Expanding it per body
would mean N extra HDR passes for a handful of points and would break the single
additive accumulation.

**`RingUniforms`** carries `planetRadiusRatio` and `innerRatio` — dimensionless ratios
that survive unchanged. `RingSpec`'s `innerRadiusKm`/`outerRadiusKm` stay km-native
(`RingSpec.d.ts:25-34`, authored in km by design). Only the `M_TO_MPC` multiply and the
MVP composition change.

- [x] Convert all three layers to `slab: 'body'` with per-row `enabled` gates that filter
      their partition branch to `view.slab.frame.bodyId`.
- [x] Swap all three onto the Task 8 primitives; delete their `M_TO_MPC` imports.
- [x] **Test `planetsLayer draws only the flat-branch body matching this row`** — a
      fixture with three `body-m` rows where one body is in `flat`, one in `textured`,
      one in `glints`; assert exactly one `planetsLayer` draw, on the `flat` row.
- [x] **Test `texturedBodiesLayer and planetsLayer never both draw the same body`** —
      same fixture, both layers run across all three rows; assert no body id appears in
      both layers' draw calls. This is the double-draw/z-fight bug the shared partition
      exists to prevent, now re-exposed by N rows.
- [x] **Test `ringsLayer draws only for a body with a ring row`** — earth row and saturn
      row; assert one draw, on saturn.
- [x] Update the three `pack*Uniforms` + their WESL structs for any field whose unit
      changed; leave the ratio fields alone.
- [x] `npm test` → green. `npm run typecheck`.
- [x] **Dev-server check (report to the user):** Mars and the Moon resolved with
      neighbours in frame (occultation, transit); Saturn with rings intersecting its own
      globe; solar-system wide with the Sun and planets both nearer and farther, across
      the 3 px glint↔sphere boundary.
- [x] Commit.

---

## Task 12: Caption occlusion moves to alpha coverage

> **Read first:** `.claude/skills/wesl-shaders/SKILL.md` — this task edits a `lib/`
> `.wesl` file imported by three shader modules, which is exactly the linker-constraint
> territory the skill covers. Also [`docs/RENDERER.md`](../../RENDERER.md).

**Files:**

- Modify: `src/services/gpu/shaders/lib/sceneDepth.wesl` (two tests → one)
- Modify: `src/services/gpu/shaders/{labels,markerLines,selectionRing}/fragmentOcclude.wesl`
  (each imports both functions today: `labels:40-41`, `markerLines:39-40`,
  `selectionRing:39-40`)
- Move: `src/services/gpu/renderers/labels/occlusionDepthGroup.ts` →
  `src/services/gpu/renderers/labels/occlusionCoverageGroup.ts`
- Modify: `src/services/gpu/renderTargets.ts:228-230` (usage flags), `:307-320` (the
  depth texture's `TEXTURE_BINDING`)
- Modify: `src/services/engine/frame/passes/foregroundLabelsLayer.ts:34-43`,
  `labelsLayer.ts:55-65`, `markerLinesLayer.ts:54-67`, `selectionRingLayer.ts:82-97`
- Modify: `labelRenderer.ts:606,634,640`, `markerLineRenderer.ts:380,408,414`,
  `selectionRingRenderer.ts:196,221,227` (the `sceneDepthView` parameter)
- Test: the four matching pass tests under `tests/services/engine/frame/passes/`

- Consumes: the painter chain (Tasks 7, 9–11) — depth is now per-row, so this must land
  before Task 14's visual pass.

**Why (spec §7.3).** Each chain row clears depth, so the shared `foreground:0` depth
buffer holds only the nearest row's depth, and depths from different metre-frame
projections are not comparable anyway. Both flavours collapse to **one coverage test
sourced from `foreground:0`'s alpha**: the target clears to `a = 0`
(`renderTargets.ts:230`, verified) precisely so its OVER composite into HDR is a no-op
where the foreground drew nothing; opaque body fragments write `a = 1`. Under painter
compositing that alpha accumulates across every chain row — exactly the "is there a body
at this pixel" signal both tests want.

**The threshold is `alpha > 0.5`, not `alpha > 0`** (spec §7.3). `atmosphereShellLayer`
and `cloudShellLayer` depth-test but do **not** depth-write, so today they never occlude
a caption; a naive `alpha > 0` test would let a faint limb glow clip captions. The opaque
globe passes 0.5, the outer atmosphere does not.

**What this deletes:** the two-flavour split, the depth `TEXTURE_BINDING` usage on
`foreground:0`'s depth texture, and `occlusionDepthGroup`'s depth binding. Net removal.

**Move the file with the tool:**
`npm run move-files -- src/services/gpu/renderers/labels/occlusionDepthGroup.ts src/services/gpu/renderers/labels/occlusionCoverageGroup.ts`
(run `--dry` first). ts-morph rewrites every relative import and drags the `tests/`
mirror along. It does **not** cover `.wesl` `package::` imports or string-literal paths —
grep for the old path afterwards.

**Interfaces:**

```wesl
// src/services/gpu/shaders/lib/sceneDepth.wesl  (the file's ONE exported test)
@group(1) @binding(0) var sceneColorTex: texture_2d<f32>;

/** True where the opaque foreground owns this pixel. Shells (a ≤ 0.5) do not. */
fn coveredByScene(fragXY: vec2f) -> bool {
  return textureLoad(sceneColorTex, vec2i(fragXY), 0).a > 0.5;
}
```

```ts
// src/services/gpu/renderers/labels/occlusionCoverageGroup.ts
export const OCCLUSION_COVERAGE_GROUP_INDEX = 1;
export const OCCLUSION_COVERAGE_LAYOUT_DESC: GPUBindGroupLayoutDescriptor;
export function createOcclusionCoverageBindGroup(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  colorView: GPUTextureView,
): GPUBindGroup;
```

The layout entry changes from `texture: { sampleType: 'depth' }` to
`texture: { sampleType: 'unfilterable-float' }` (the target is `rgba16float` and the
shader uses `textureLoad`, so no filtering is needed and `unfilterable-float` is the
narrowest correct choice). The bind group is still rebuilt per frame — the view is
recreated on every `renderTargets.reconcile()`.

**Verify before assuming:** `foreground:0`'s colour texture may not carry
`TEXTURE_BINDING` today (only its depth texture does, `renderTargets.ts:307-320`). Add it
to the colour texture and remove it from the depth texture. Also confirm the opaque body
pipelines actually write `a = 1` — check each body layer's `blend` mode and its
fragment's alpha output. If any writes `a` from a texture's alpha channel, that is a real
bug this task must fix (a PNG with a non-opaque alpha channel would silently punch holes
in coverage).

- [x] Collapse `sceneDepth.wesl` to the single `coveredByScene` above and repoint the
      three `fragmentOcclude.wesl` importers. **Do not rename the file** —
      `sceneDepth.wesl` is referenced from `renderTargets.ts:114,316` and
      `lib/msdf.wesl:6`; a rename here costs more than it buys and the shader skill's
      `package::` caveat applies.
- [x] Move `occlusionDepthGroup.ts` with `npm run move-files`; update the layout entry
      and the parameter to a colour view.
- [x] Flip the `TEXTURE_BINDING` usage in `renderTargets.ts` from the depth texture to
      the colour texture.
- [x] Repoint the four overlay layers from
      `ctx.renderTargets.depthViewOf('foreground:0')` to the colour view. The
      `ctx.renderedTargets.has('foreground:0')` guard stays exactly as-is.
- [x] **Test `overlay layers pass the foreground colour view, not the depth view`** —
      one test per overlay layer family, asserting the renderer's draw received the
      colour view. This is a cross-file contract (three renderers, one bind-group
      layout) that no other test covers; it fails if a layer is missed in the repoint.
- [x] Verify the alpha-write question above; fix any layer writing a non-1 alpha for an
      opaque fragment.
- [x] `npm test` → green. `npm run typecheck`.
- [x] **Dev-server check (report to the user):** a caption over Earth's limb — it must be
      clipped by the opaque globe and **not** by the outer atmosphere glow. Also a COSMO
      overlay (a galaxy label) behind a planet, which must still be covered.
- [x] Commit.

---

## Task 13: Delete the incumbent body path and install the structural gates

**Files:**

- Modify: `src/utils/camera/composeBodyMvp.ts` (narrow the docblock)
- Modify: `src/utils/camera/camPosLocal.ts` (narrow or delete — see below)
- Modify: `src/utils/camera/lonLatFocusPose.ts:23-29` (consume the seam)
- Modify: `src/services/engine/helpers/liveFocusRow.ts:9` (stale `radiusKm` doc
  reference — the field is `radiusM`, `SelectionRow.d.ts:33,50`)
- Modify: `docs/RENDERER.md`, `docs/BACKLOG.md`
- Test: `tests/services/engine/camera/oneMpcSeam.test.ts` (create)

- Consumes: Tasks 9–11 (the last body caller of `composeBodyMvp` must be gone first).

**`composeBodyMvp`'s surviving callers (spec §11-O3, ruled).** After the migration its
remaining callers are `starSpheresLayer.ts:118`, `fieldStarSphereLayer.ts:255`, and
`drawFlooredSpherePick.ts:97` — all star spheres in the `world-mpc` NEAR0 row, which S4
explicitly keeps out of body slabs. The util **survives** with a narrowed docblock ("star
spheres in the world frame"). Verify the six body-layer callers
(`ringsLayer:151`, `texturedBodiesLayer:137`, `cloudShellLayer:154`,
`planetsLayer:144`, `earthLayer:137`, `atmosphereShellLayer:96`) are all gone.

**`camPosLocal`'s surviving callers.** Same check: `encodeAtmosphereSkyView.ts:90` and
`drawFlooredSpherePick.ts:108` are the two that are not body layers. If
`encodeAtmosphereSkyView` feeds a body-slab layer it should move onto
`bodySlabCamLocal` (Task 10 may already have done this); if `drawFlooredSpherePick` is
the only caller left, consider inlining `camPosLocal` into it and deleting the file —
run that call through the `deletion-audit` lens, and do it only if the result is smaller.

**`lonLatFocusPose` (spec §5).** It re-derives a body-local transform from Mpc today
(`lonLatFocusPose.ts:23-29`, sole caller `watchFlyToLonLatSaga.ts:42`). Repoint it at the
pose seam so there is one body-local transform, not three. **If this proves to reach into
camera-state shapes that spec 2 owns, stop and leave it — record it as a Task 14 finding
rather than pre-empting spec 2.**

**The one-seam grep test.** Spec §5/§10 require it. Scope it as an **import-graph**
assertion over a named file set, not a substring behaviour proxy —
`conventions/testing.md` bans source-text greps *as behaviour tests*; this asserts a
cross-file architectural contract that no behavioural test can express, which is the
"cross-file contract" keep-rule. Assert: **no file in the body-slab path imports
`MPC_TO_M` or `M_TO_MPC` from `scaleUnits`.** The path is exactly:

```
src/services/engine/frame/passes/{earth,atmosphereShell,cloudShell,planets,texturedBodies,rings}Layer.ts
src/services/gpu/renderers/bodies/**
src/services/gpu/shaders/bodies/**
src/utils/scene/cutSurfaceTiles.ts
src/utils/camera/{composeBodySlabMvp,bodySlabCamLocal}.ts
```

`src/services/engine/camera/bodyRelativePose.ts` is the one permitted importer.

**Deliberately outside the test's scope** (they are `world-mpc` or CPU-LOD consumers, not
the body slab path, and spec §10's blanket "outside `bodyRelativePose`" phrasing over-
reaches against the shipped tree): `starSpheresLayer.ts:11`,
`fieldStarSphereLayer.ts:171`, `bodyApparentDiameterPx.ts:49`,
`baseGlobeFadeAlpha.ts:21`, `formatDistance.ts:63`, `orbitalElements.ts:288`,
`pivotRadiusMpc.ts:18`, `bodyLikeFraming.ts:27`, `cameraDrivers.ts:331`, the animation
clips, and `sceneBodyLabels.ts:157`. **Flag this narrowing in the PR body** so the user
can rule on it.

- [x] Narrow `composeBodyMvp`'s docblock; verify no body caller remains.
- [x] Resolve `camPosLocal`'s fate per the deletion-audit call above.
- [x] Repoint `lonLatFocusPose` at the seam, or record why not.
- [x] Write the import-graph test in `tests/services/engine/camera/oneMpcSeam.test.ts`
      with the file list above spelled out as data and the allow-list commented with its
      one-line justification.
- [x] **Test `no body-slab-path module imports the Mpc↔metre constants`** — the above.
- [x] Fix the stale `radiusKm` doc reference at `liveFocusRow.ts:9`.
- [x] Update `docs/RENDERER.md`'s renderer quick map for the body-slab chain and the
      alpha-coverage occlusion source (both are quick-map facts a future reader needs);
      keep it to the existing bullet style, no essay.
- [x] Sweep `docs/BACKLOG.md` for any item this landing consumed and delete it (index
      line **and** its `docs/backlog/` detail file) per the backlog-hygiene convention.
- [x] `npm test` → green. `npm run typecheck`.
- [x] Commit.

---

## Task 14: Verification gate — perf, the four views, the failure path

**Files:** none (measurement and reporting only).

> **Read first:** `.claude/skills/perf/SKILL.md`. **In a worktree you must pass
> `--url http://localhost:<port>`** from *this* worktree's dev-server `Local:` line, or
> you silently measure another branch's server. The skill carries the interpretation
> traps (MERGED vs PER-LAYER vs FLOOR; Apple Silicon slot-sum inflation; the harness's
> ~3× inflation).

**This task's before-measurement must have been taken on `main` before Task 1.** If it
was not, take it now against a clean `main` checkout before measuring this branch —
a post-hoc "after" with no "before" cannot satisfy the halt rule.

- [x] Run `npm run perf` against this worktree's dev server at each of the four spec §10
      views. Report MERGED, PER-LAYER and FLOOR separately; N passes replacing one
      merged pass is the specific risk (spec §10).
- [x] **If the measurement is neutral-or-negative, HALT and report.** Land/park is the
      user's ruling, not process momentum. Do not proceed to the visual pass to "make up
      for it."
- [x] **Visual parity pass — the user's eyes, not yours. f.lux OFF before any colour
      judgement.** Present each of the four spec §10 views side by side against `main`:
      (1) whole-globe Earth — limb, terminator, atmosphere, cloud shell, caption
      placement and clipping at the limb; (2) Earth close approach at the current zoom
      floor — tile detail, ocean glint, no UV quantization, no black nadir disc;
      (3) Mars and the Moon resolved with host/satellite neighbours — painter ordering,
      occultation, transit; (4) solar-system wide with the Sun and planets both nearer
      and farther — the §7.1 ordering case plus glint↔sphere behaviour across the 3 px
      boundary.
- [x] **Failure-path check (spec §13):** with no manifest, no atlas, and a 404 on every
      tile, Earth still lands on the picture it draws without them.
- [x] **Pick check:** clicking a body still selects the front-most one across body rows.
- [x] Confirm `chainOverlapViolations` reported nothing during the four views (the
      dev-gated warn from Task 5).
- [x] Report the full result — perf numbers, per-view verdicts, and any finding deferred
      from Tasks 9–13 — and hand the land/park decision to the user.
