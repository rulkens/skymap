# Render Sgr A* Black Hole Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan follows `docs/superpowers/conventions/plan-style.md` — contract code (signatures, test names+assertions, byte tables) yes, implementation bodies no.

**Goal:** Render a physically-grounded Schwarzschild close-up of Sgr A* inside a
new `sgrAStarLensing` fade band (500→100 AU), with a far-field warm-orange
glint marking it from any distance while on screen, replacing the current
"draws nothing" `AnchorPointBody`.

**Architecture:** Two PRs. Phase A (ground-prep) widens the post-#634 body-slab
architecture's three remaining "earth + planets only" hardcodes so an anchor
body can compete for a slab row, get a camera-standoff floor, and back a
fixed-size cubemap render target — all zero-behaviour-change for every
existing scene. Phase B is the feature: black-hole physics data, the fade
band + far-field glint crossfade, a captured sky cubemap, a Schwarzschild
deflection LUT, and a new geodesic `ContentLayer` drawn after the roster it
lenses and before the annotations that must stay unwarped.

**Tech Stack:** TypeScript, WebGPU, WESL (wesl-plugin), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-render-black-hole-design.md`

## Global Constraints

- Zero new user-facing settings (Q9) — the feature is physically parameterized
  from `BLACK_HOLES` + the shipped anchor body; dev-tuning constants ride the
  existing DebugPanel. **Amended during implementation:** that dev-tuning
  section SHIPS rather than being deleted before merge — see the spec's
  §Settings for why, and Task 15 below.
- No Kerr metric, no full-GR observer view below 2 r_s, no cinematic
  accretion disc, no M87*/second black hole, no tour beat, no lensing of
  annotations (orbit trails, marker rings, labels, picking stay unlensed).
- `npm run perf` is a hard gate, before AND after the feature work (read
  `.claude/skills/perf/SKILL.md` first; pass `--url` against this worktree's
  own dev-server port). Neutral outside the band; bounded inside it. A
  regression outside the band, or an unbounded/unacceptable cost inside it,
  HALTS the landing pipeline — the user rules, not process momentum.
- Any file delete/rename goes through `npm run refactor -- delete/move` or
  `npm run move-files -- <from> <to>`, spelled out in the task text — never
  `git mv` + hand-edited imports.
- Phase A lands as its own PR, reviewed and merged before Phase B starts.

---

## Phase A — ground-prep PR

### Task 1: P1 — slab candidacy admits anchor bodies, `BODY_SLAB_CAPACITY` derives from the same set

**Files:**
- Create: `src/data/bodies/sceneAnchorPointBodies.ts`
- Modify: `src/services/engine/frame/visibleSlabBodies.ts:26-46`
- Modify: `src/services/engine/frame/frameContext.ts:201-209` (the sole call site)
- Modify: `src/services/engine/frame/frameProgram.ts:77` (`BODY_SLAB_CAPACITY`)
- Modify: `src/@types/scene/AnchorPointBody.d.ts:2-3` (docblock correction)
- Modify: `src/data/sources/sgr-a-star.ts:8` (same "DRAWS NOTHING" claim, second home — goes stale the same way)
- Modify: `tests/services/engine/frame/visibleSlabBodies.test.ts` (every existing call site's `{earth, planets, ...}` args move to `{bodies, ...}`)
- Modify: `tests/data/bodies/orientationForBody.test.ts` (anchor-identity assertion)

**Interfaces:**
- Produces: `SCENE_ANCHOR_POINT_BODIES: readonly AnchorPointBody[]` — mirrors
  `SCENE_PLANETS`'s shape (`src/data/bodies/scenePlanets.ts:14`), one element
  (`SGR_A_STAR`, imported from `sceneSgrAStar.ts`) today. Appending a second
  `AnchorPointBody` (M87*, spec non-goal) is a data change to this array, not
  a code change anywhere it's consumed.
- Consumes/produces: `visibleSlabBodies` signature changes from
  `{ earth: EarthBody | null; planets: readonly PlanetBody[]; ... }` to
  `{ bodies: readonly SceneBody[]; ... }` (drop the internal
  `earth === null ? planets : [earth, ...planets]` concat — the caller now
  assembles the candidate list). Return type stays `readonly SceneBody[]`.
- `frameContext.ts:201`'s call site becomes the concat site: `bodies:` built
  from `state.data.bodies.earth`, `state.data.bodies.planets`, and
  `SCENE_ANCHOR_POINT_BODIES` (spread, not the single `SGR_A_STAR` — so a
  future second anchor row needs no second call-site edit).
- `BODY_SLAB_CAPACITY` becomes `1 + SCENE_PLANETS.length + SCENE_ANCHOR_POINT_BODIES.length`
  (the leading `1` stays Earth's reserved slot, per the existing comment at
  `frameProgram.ts:71-76`).

**Steps:**

- [ ] Write `SCENE_ANCHOR_POINT_BODIES` (`sceneAnchorPointBodies.ts`):
      `export const SCENE_ANCHOR_POINT_BODIES: readonly AnchorPointBody[] = [SGR_A_STAR];`
      importing `SGR_A_STAR` from `./sceneSgrAStar`.
- [ ] Update the failing/changed tests in `visibleSlabBodies.test.ts` FIRST:
      every existing case's `{ earth, planets, bodyStates, ... }` call
      becomes `{ bodies: [...], bodyStates, ... }` (fold `earth`/`planets`
      into one array per case, preserving each case's asserted behaviour
      unchanged — this IS the zero-behaviour-change proof for those cases).
- [ ] Add the test `admits an AnchorPointBody candidate on the same terms as a planet`:
      construct a synthetic `AnchorPointBody` (arbitrary `radiusM`) at a
      position/distance that clears both culls with a `bodyStates` entry,
      assert it appears in the result; construct a second one far outside the
      frustum, assert it does not.
- [ ] Run `npm test -- visibleSlabBodies` — new tests fail (no `bodies` param
      yet), existing tests fail on the old `{earth, planets}` shape.
- [ ] Implement: change `visibleSlabBodies`'s param to `bodies: readonly SceneBody[]`,
      drop the internal concat (`visibleSlabBodies.ts:46`), keep every
      downstream line (`FRUSTUM_CULL_MARGIN_FACTOR`, `isInsideFrustum`,
      `bodyApparentDiameterPx`) untouched — they already operate on the
      `SceneBody` union's shared `radiusM`/`id` fields.
- [ ] Update `frameContext.ts:201-209`'s call site to assemble `bodies` from
      `state.data.bodies.earth` (null-checked), `state.data.bodies.planets`,
      and `SCENE_ANCHOR_POINT_BODIES`.
- [ ] Update `BODY_SLAB_CAPACITY` (`frameProgram.ts:77`) to the three-term sum
      above; import `SCENE_ANCHOR_POINT_BODIES`.
- [ ] Run `npm test -- visibleSlabBodies frameContext frameProgram` — all pass.
- [ ] Add the test (in `orientationForBody.test.ts`) `returns identity for
      the Sgr A* anchor` — asserts `orientationForBody('sgr-a-star', <any
      simDays>)` equals `IDENTITY_MAT3`. This is the P1 "anchor
      orientation-identity verification through bodyRelativePose": Sgr A* is
      not in `BODY_TEXTURE_REGISTRY`, so `orientationForBody`'s existing
      membership gate (`orientationForBody.ts:33`) already returns identity —
      the test pins that fact so a future accidental texture-registry entry
      for `sgr-a-star` can't silently rotate the body-slab basis
      `bodyRelativePose` builds from it.
- [ ] Correct `AnchorPointBody.d.ts:2-3`'s docblock: replace "DRAWS NOTHING:
      no mesh, no point, no glint" with a statement that an anchor may draw a
      far-field glint and, inside its lensing band, a geodesic pass — both
      via dedicated `ContentLayer` rows keyed on its id (Phase B), never via
      the flat/textured/glint partition planets use. Keep the surrounding
      "identity fields only" rationale (still true — `AnchorPointBody` gained
      no new fields).
- [ ] Correct the matching claim at `src/data/sources/sgr-a-star.ts:8` ("It
      DRAWS NOTHING: no sphere, no point, no glint") the same way — same fact,
      second home, same staleness risk.
- [ ] Run `npm test` (full suite) and `npm run typecheck` — green.
- [ ] Commit.

**Proof obligation (spec):** with Sgr A* far outside the lensing band (any
framing wider than the galactic centre), `visibleSlabBodies` returns exactly
what it returns today for Earth + planets — the anchor's frustum/pixel culls
reject it at any sane viewing distance. The updated existing test cases
(unchanged assertions, reshaped call args) are that proof for the covered
scenes.

---

### Task 2: P2 — per-body camera-standoff floor (`standoffRadii`)

**Files:**
- Modify: `src/utils/camera/clampDistance.ts:70-78`
- Modify: `src/data/bodies/sceneSgrAStar.ts` (add `standoffRadii: 2.0` to `SGR_A_STAR`)
- Modify: `src/@types/scene/AnchorPointBody.d.ts` (add optional `standoffRadii` field)
- Modify: `tests/utils/camera/clampDistance.test.ts`

**Interfaces:**
- `clampDistance(d: number, pivotRadiusMpc: number | null, standoffRadii: number = SURFACE_STANDOFF_RADII): number`
  — third param optional, defaulting to the existing global constant so every
  existing call site (which passes only two args) is untouched.
- `AnchorPointBody` gains `readonly standoffRadii?: number` — optional, so
  Earth/planets/Sun (which carry no such field on their own types) are
  unaffected; only a call site that HAS an `AnchorPointBody`'s standoff can
  read it and pass it through as `clampDistance`'s third arg (wiring the read
  site — wherever the orbit-focus/zoom call composes `pivotRadiusMpc` for a
  focused body — is this task's implementation, not pinned further here since
  the spec doesn't name that call site and it's a one-line threaded read).

**Steps:**

- [ ] Add the test `clampDistance — per-body standoff` describing the
      contract: with a `standoffRadii` of e.g. `2.0` and a pivot radius `R`,
      `clampDistance(smallD, R, 2.0)` floors at `2.0 * R` (not
      `SURFACE_STANDOFF_RADII * R`), asserted the same way the existing
      `EARTH_RADIUS_MPC`-relative tests assert (body radii, not raw Mpc — see
      the file's own header rationale).
- [ ] Add the test `clampDistance — omitted standoffRadii keeps Earth's
      current floor unchanged`: `clampDistance(d, EARTH_RADIUS_MPC)` (two-arg
      call, exactly as today's call sites use it) is byte-identical to
      today's behaviour — this is the zero-change proof for every body that
      doesn't opt in.
- [ ] Run `npm test -- clampDistance` — new tests fail.
- [ ] Implement the third parameter with the stated default; the floor
      becomes `Math.max(MIN_DISTANCE_MPC, pivotRadiusMpc * standoffRadii)`.
- [ ] Run `npm test -- clampDistance` — passes.
- [ ] Add `standoffRadii?: number` to `AnchorPointBody.d.ts`, with a one-line
      doc note citing Q10 (2 r_s descent floor) as the reason a per-body
      override exists at all — the global `SURFACE_STANDOFF_RADII` stays
      tuned for Earth's imagery resolution (see `clampDistance.ts:26-46`) and
      must not regress.
- [ ] Set `standoffRadii: 2.0` on `SGR_A_STAR` in `sceneSgrAStar.ts`.
- [ ] Find and update the focus/zoom call site that currently calls
      `clampDistance(d, pivotRadiusMpc)` for a focused `SceneBody` (a
      two-arg call somewhere in the orbit-camera/focus-tween path) to read an
      optional `standoffRadii` off the focused body when present, passing it
      as the third arg; every other body (no such field) falls through to
      the default.
- [ ] Run `npm test` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 3: P3 — fixed-size render targets, for the sky cubemap

**Files:**
- Modify: `src/@types/engine/frame/RenderTargetSpec.d.ts:14-40`
- Modify: `src/services/gpu/renderTargets.ts:265-350` (`allocate`, `reconcile`)
- Modify: `tests/services/gpu/renderTargets.test.ts`

**Interfaces:**

```ts
// RenderTargetSpec — delta only, alongside the existing `scale`.
export type RenderTargetSpec = {
  // ...unchanged fields (id, format, depth, clearValue)...
  scale: number | ((state: EngineState) => number);
  /**
   * When present, this row's pixel size is `fixedSizePx.size` on each axis
   * regardless of canvas size, and its texture has `fixedSizePx.layers`
   * array layers (a `2d-array` texture, sampled as `texture_cube` by a
   * consumer that binds all six as a cube — WebGPU has no cube-view render
   * attachment). `scale` is ignored when this is present.
   */
  fixedSizePx?: { readonly size: number; readonly layers: number };
};
```

- No existing row in `renderTargetRows` sets `fixedSizePx` — this task adds
  only the type + the `reconcile`/`allocate` branch; the sky-cubemap TARGET
  ROW itself is added by a Phase B task (it needs `BLACK_HOLES`-adjacent
  constants that don't exist yet).

**Steps:**

- [ ] Add the test `createRenderTargets — a fixedSizePx row allocates at its
      declared size regardless of canvas size`: construct
      `createRenderTargets` with a test-only `RenderTargetSpec` row (or, if
      `renderTargetRows` isn't the seam under test, inject via whatever seam
      the existing tests use) carrying `fixedSizePx: { size: 256, layers: 6 }`;
      assert the allocated texture's `size` descriptor is
      `{ width: 256, height: 256, depthOrArrayLayers: 6 }` at a canvas of
      `{ width: 900, height: 600 }`.
- [ ] Add the test `createRenderTargets — reconcile does not reallocate a
      fixedSizePx row when the canvas resizes`: call `reconcile` with a
      DIFFERENT canvas size than construction; assert `device.createTexture`
      was NOT called again for that row's id (mirrors the existing
      "reallocates... when the canvas size changes" test's call-count
      assertion style at `renderTargets.test.ts:52-88`, inverted).
- [ ] Run `npm test -- renderTargets` — new tests fail (no such row exists
      yet to construct against — write them against a literal test spec
      object passed through whatever `renderTargetRows`-adjacent seam the
      implementer adds for injectability, OR against a temporary row added to
      `renderTargetRows` and removed once Phase B's real cubemap row lands;
      implementer's call, documented inline in the test file).
- [ ] Add `fixedSizePx` to `RenderTargetSpec.d.ts` as above.
- [ ] In `renderTargets.ts`, grow `reconcile`'s per-row loop
      (`renderTargets.ts:338-345`) so a `fixedSizePx` row computes
      `[fixedSizePx.size, fixedSizePx.size]` instead of calling
      `reducedTargetSize(canvas.width, canvas.height, resolveScale(spec, s))`
      — the held-size comparison and `allocate` call stay shared with every
      other row (a fixed size is just a size that never changes across
      resizes, not a separate code path past this one branch).
- [ ] Grow `allocate` (`renderTargets.ts:293-330`) to pass
      `depthOrArrayLayers: spec.fixedSizePx?.layers ?? 1` and
      `dimension: '2d'` (explicit — WebGPU defaults to `'2d'` already, but
      state it so a `layers > 1` row is unambiguous) in the texture
      descriptor's `size`, for both the colour and (if `spec.depth`) depth
      texture creation calls.
- [ ] Run `npm test -- renderTargets` — passes.
- [ ] Run `npm run typecheck` — green.
- [ ] Commit.

---

## Phase A — Definition of Done (ground-prep PR)

- **Deliverable inventory:** `SCENE_ANCHOR_POINT_BODIES` (new export);
  `visibleSlabBodies`'s new `{ bodies }` signature; `BODY_SLAB_CAPACITY`'s
  three-term derivation; `clampDistance`'s `standoffRadii` third parameter;
  `SGR_A_STAR.standoffRadii = 2.0`; `RenderTargetSpec.fixedSizePx`; the
  `renderTargets.ts` fixed-size allocation branch.
- **Named observable behaviours (smoke pass):** none visual — this PR changes
  no draw output for any existing scene (the P1 proof obligation holds by
  construction: Sgr A* still fails both culls at every framing wider than the
  galactic centre, since Phase B's lensing/glint layers don't exist yet to
  read the widened slab candidacy).
- **Deferral boundary:** the sky-cubemap render target ROW itself (data, not
  the `fixedSizePx` mechanism) is Phase B. No settings, shader, or data-table
  work happens here.

---

## Phase B — feature PR

### Task 4: 2 r_s descent probe (USER-ATTESTED)

Sequencing step 3 of the spec — the FIRST implementation task of the feature
plan, ahead of any shader work, because it validates the precision assumption
(`bodyRelativePose`'s f64-cancel-then-scale-to-metres seam,
`tests/services/engine/camera/oneMpcSeam.test.ts`) the rest of the feature is
built on.

**Files:** none created/modified by default — this is a manual/dev-server
probe. If the probe surfaces a real bug, the fix is a follow-up task (or,
per the spec's "Relationship to open items," may fold
`docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` into
scope — see the STOP-and-consult step below).

**Steps:**

- [ ] Start the dev server (`/dev` skill or `npm run dev`), focus Sgr A*
      (already selectable/focusable today — `AnchorPointBody` is in
      `SCENE_BODIES` and carries a caption).
- [ ] With Phase A merged (the slab-candidacy + standoff-floor prep live),
      descend toward Sgr A* to the P2 floor (2 r_s — `standoffRadii: 2.0`
      now stops the camera there).
- [ ] Observe: camera jitter at the floor, frustum near-plane behaviour
      (`bodySlabRow`'s `near` derivation, `slabs.ts:219-236`), and S-star
      sprite/orbit-trail stability at that range (they ride the same NEAR0
      slab and f64 rebase seam).
- [ ] **USER-ATTESTED GATE:** report findings to the user — this is a visual
      judgment call, not a scripted assertion. If jitter/instability appears,
      STOP and consult before proceeding: does it implicate
      `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`
      (per the spec's "Relationship to open items")? That folding decision is
      the user's call, made HERE, not assumed by this plan.
- [ ] On a clean probe, proceed to Task 5. On a fold-in verdict, the folded
      scope becomes new tasks inserted here (not silently absorbed into a
      later task's steps).

---

### Task 5: Sgr A* mass + Schwarzschild radius (data + physics util)

**Files:**
- Create: `src/data/bodies/sgrAStarMassSolar.ts`
- Create: `src/utils/physics/schwarzschildRadiusM.ts`
- Create: `tests/utils/physics/schwarzschildRadiusM.test.ts`
- Modify: `src/data/bodies/sceneSgrAStar.ts:18-42` (radiusM derivation swap)
- Modify: `src/data/bodies/sStarOrbitInfo.ts:16-21` (second reader migration)
- Delete: `src/data/bodies/sgrAStarSchwarzschildRadiusKm.ts`

**Interfaces:**

```ts
// src/data/bodies/sgrAStarMassSolar.ts
export const SGR_A_STAR_MASS_SOLAR = 4.297e6; // GRAVITY Collaboration 2019, A&A 625, L10

// src/utils/physics/schwarzschildRadiusM.ts
export function schwarzschildRadiusM(massSolar: number): number; // r_s = 2GM/c², returns METRES
```

**Steps:**

- [ ] Add the test `schwarzschildRadiusM` (in
      `tests/utils/physics/schwarzschildRadiusM.test.ts`) asserting
      `schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR)` is within float tolerance
      of the KNOWN figure — 12.69e6 km = 1.269e10 m (equivalently 0.085 AU,
      both cited in the spec's Data table) — a hand-computed reference value,
      not a re-derivation of the same `2GM/c²` formula (that would be a
      mirror test per `testing.md`). Use `Number.EPSILON`-scale relative
      tolerance appropriate for a physical-constant computation (e.g.
      `toBeCloseTo` with a precision chosen so the real constants G/c round
      correctly, not an arbitrarily loose bound).
- [ ] Run the test — fails (function doesn't exist).
- [ ] Implement `schwarzschildRadiusM` using named physical constants (G, c)
      — no existing G/c constant module was found in this codebase's
      `utils/`; add them as named locals in this file with their SI values
      and a one-line citation, following the `scaleUnits.ts` convention of
      named locals with IAU/physical-constant citations rather than inline
      magic numbers.
- [ ] Run the test — passes.
- [ ] Create `sgrAStarMassSolar.ts` with the single constant above.
- [ ] In `sceneSgrAStar.ts`, replace the `SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM`
      import and `radiusM: SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM * SCALE_UNITS.KM_TO_M`
      (line 41) with `radiusM: schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR)`
      (the function returns metres directly — no `KM_TO_M` step).
- [ ] In `sStarOrbitInfo.ts:16-21`, replace the
      `SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM`-based `SCHWARZSCHILD_RADIUS_AU`
      derivation with one reading `schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR)`
      (converted through `SCALE_UNITS.M_TO_MPC` / `SCALE_UNITS.AU_TO_MPC` —
      same unit chain, new source value) — this is the file's "second
      reader," the S-star pericentre-in-r_s card row's data source
      (`BodyOrbitInfo.pericentreSchwarzschildRadii`, consumed by
      `BodyDetailCard.tsx:206-212`), migrated per the spec's explicit
      instruction rather than left orphaned.
- [ ] Delete `sgrAStarSchwarzschildRadiusKm.ts` via
      `npm run refactor -- delete src/data/bodies/sgrAStarSchwarzschildRadiusKm.ts`
      (per plan-style rule 5 — never `git mv`/manual delete + hand-edited
      imports; the refactor CLI confirms no remaining importers before
      removing the file).
- [ ] Run `npm test` and `npm run typecheck` — green (no remaining
      `SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM` references).
- [ ] Commit.

---

### Task 6: `BlackHoleRow` type + `BLACK_HOLES` registry

**Files:**
- Create: `src/@types/data/BlackHoleRow.d.ts`
- Create: `src/data/blackHoles.ts`

**Interfaces:**

```ts
// src/@types/data/BlackHoleRow.d.ts
export type BlackHoleRow = {
  readonly bodyId: BodyId; // 'sgr-a-star' today
  readonly emission: {
    readonly innerRs: number; // 3
    readonly outerRs: number; // 6
    readonly inclinationRad: number; // ≲30° from face-on, EHT
    readonly positionAngleRad: number; // unconstrained; chosen, documented at the row
    readonly flickerAmp: number; // fractional brightness modulation
    readonly flickerTimescaleS: number; // ~minutes
  };
};

// src/data/blackHoles.ts
export const BLACK_HOLES: readonly BlackHoleRow[]; // one row: sgr-a-star
```

**Steps:**

- [ ] Add `BlackHoleRow.d.ts` per the contract above, with a docblock stating
      the registry is built to hold more than one row (M87* is data, not
      code, per the spec's non-goals) — mirrors `SCENE_PLANETS`'s
      append-only framing.
- [ ] Add `blackHoles.ts` with `BLACK_HOLES` holding the `sgr-a-star` row:
      `emission.innerRs = 3`, `outerRs = 6` (ISCO-to-EHT-ring, spec Data
      table); `inclinationRad`/`positionAngleRad` chosen values (document the
      position-angle choice as unconstrained-but-fixed, per the spec); a
      flicker amplitude + timescale (minute-scale, spec Data table — no
      externally-known reference value exists for these, so pick and
      document as taste/dev-tuning-adjustable via Task 15's debug panel).
- [ ] No test — this is a literal data table (a registry-restatement test
      here would fail `testing.md`'s bar; the structural invariant worth
      testing, if any — e.g. `bodyId` values are valid `BodyId`s — is already
      enforced by `tsc` through the `BodyId` type itself).
- [ ] Run `npm run typecheck` — green.
- [ ] Commit.

---

### Task 7: `sgrAStarLensing` fade band + far-field glint alpha derivation

**Files:**
- Modify: `src/services/engine/presentation/scaleFadeBands.ts`
- Modify: `tests/services/engine/presentation/scaleFadeBands.test.ts` (or
  wherever `fadeBand` + `SCALE_FADE_BANDS` band-math is currently tested —
  locate the existing test file for this module before adding).

**Interfaces:**

```ts
// scaleFadeBands.ts — new row, following the milkyWayApproachGc pattern
// (fadeBand keyed on regionRelativeDistanceMpc to 'galactic-centre'):
sgrAStarLensing: {
  fullAt: 100 * SCALE_UNITS.AU_TO_MPC,
  goneAt: 500 * SCALE_UNITS.AU_TO_MPC,
},
```

- The far-field glint's alpha is derived, not authored, as
  `1 - fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc)` at its own call
  site (Task 8) — no second band.

**Steps:**

- [ ] Add the test `SCALE_FADE_BANDS.sgrAStarLensing — 100/500 AU envelope in
      Mpc, approach direction`: assert `fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, x)`
      is `1` at/inside `100 * SCALE_UNITS.AU_TO_MPC`, `0` at/outside
      `500 * SCALE_UNITS.AU_TO_MPC`, and strictly between at a midpoint —
      this pins the DIRECTION (full at the close edge, per the spec's
      explicit "opposite direction from milkyWayApproachGc" note), which is
      an `fullAt`/`goneAt` ordering fact `fadeBand` reads structurally
      (`fadeBand.ts:39`: `fullAt > goneAt ? s : 1 - s`) — a real bug (the
      band authored backwards) would flip this and is exactly what a
      classifier-direction test is for per `testing.md`'s boundary-test
      keep-rule.
- [ ] Run the test — fails (row doesn't exist).
- [ ] Add the `sgrAStarLensing` row to `SCALE_FADE_BANDS`, per the contract
      above, importing `SCALE_UNITS` (already imported in this file) — no new
      import needed for `AU_TO_MPC`, it already exists in `scaleUnits.ts`.
- [ ] Run the test — passes.
- [ ] Run `npm test` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 8: Far-field glint — Sgr A* rides `bodyGlintsLayer`

**Files:**
- Modify: `src/services/engine/frame/passes/bodyGlintsLayer.ts`

**Interfaces:**
- No new exported symbols — this widens `bodyGlintsLayer`'s existing
  `enabled`/`draw` internals with a second, independent packed source
  alongside the `sceneBodyPartition(...).glints` branch. `SCENE_ANCHOR_POINT_BODIES`
  is NOT routed through `sceneBodyPartition`/`partitionBodiesByPresentation`
  (that XOR assumes every input can resolve to a mesh at ≥3px — an anchor
  never does, so its own presentation partition doesn't apply; see
  `partitionBodiesByPresentation.ts:40-48`'s `BODY_GLINT_MAX_PX` XOR
  contract).

**Design (why a second loop, not a wider partition):** `sceneBodyPartition`
reads `state.data.bodies.planets` only (`PlanetBody[]`); `AnchorPointBody`s
are not planets and carry no `albedo`/texture-residency data
`bodyGlintBrightness`/`bodyTextureSpec` need. The far-field glint therefore
gets its OWN brightness formula — a fixed warm-orange tint × a base
intensity constant × `1 - fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc)`
(the crossfade against the lensing pass, spec §"The fade band") — with NO
apparent-size term (an anchor never hands off to a resolved mesh, so the
existing `bodyGlint` 1–3px band, which exists for exactly that handoff,
doesn't apply here) and NO `bodyGlintBackdrop` far-dissolve (the spec's Goal
states the glint is "present the moment Sgr A* is on screen at all" —
unconditional on far distance, unlike the seeded planets' glints).

**Steps:**

- [ ] Add a named constant for the glint's fixed tint (warm-orange, linear
      RGB) and its base intensity, beside the layer's existing
      `GLINT_MIN_BRIGHTNESS` constant.
- [ ] In `draw`, after the existing `glints` packing loop, add a second loop
      over `SCENE_ANCHOR_POINT_BODIES`: for each anchor body, compute
      `distMpc` via `regionRelativeDistanceMpc(camPos, regionById('galactic-centre'), states)`
      (same helper/region `milkyWayCloudLiveness.ts:40` already uses for the
      `milkyWayApproachGc` band), brightness =
      `baseIntensity * (1 - fadeBand(SCALE_FADE_BANDS.sgrAStarLensing, distMpc))`,
      skip below `GLINT_MIN_BRIGHTNESS` (the same shared threshold, "opacity
      0 ⇒ no render"), else pack the same 7-float camera-relative record
      shape (`positionMpc - camPos`, tint, brightness) the existing loop
      writes, continuing the shared `count`/`staging` buffer.
- [ ] Widen `enabled`: the layer must stay in the pass plan when the anchor
      loop would pack ≥1 record even if `sceneBodyPartition(...).glints` is
      empty — mirrors the existing `pickEnabled`-widening pattern the file's
      header documents for the Earth caption stamp (`bodyGlintsLayer.ts:153-166`),
      but for `enabled` itself since this is a VISUAL row, not a pick-only
      widening.
- [ ] No `drawPick` change — the spec states Sgr A*'s existing pick stamp
      (its caption) is untouched by this feature; the far-field glint carries
      no pick aspect of its own.
- [ ] Add a behavioural test (in the existing
      `tests/services/engine/frame/passes/bodyGlintsLayer.test.ts`) asserting
      the layer's `enabled` returns `true` when the anchor's crossfade alpha
      is positive even with an empty `glints` partition (construct a fixture
      state/ctx placing the camera far outside the lensing band's `goneAt`
      but still — this is the "present the moment it's on screen" contract,
      not a distance gate on the glint itself, so pick a fixture distance
      that is large but finite) — and a second test that a camera positioned
      such that the anchor's computed brightness is 0 (if any such condition
      exists given the "always present" design — if none does, state that in
      the test file instead of writing a vacuous test, per `testing.md`).
- [ ] Run `npm test -- bodyGlintsLayer` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 9: `SchwarzschildDeflectionLut` type + `buildSchwarzschildDeflectionLut`

**Files:**
- Create: `src/@types/lensing/SchwarzschildDeflectionLut.d.ts`
- Create: `src/utils/lensing/buildSchwarzschildDeflectionLut.ts`
- Create: `tests/utils/lensing/buildSchwarzschildDeflectionLut.test.ts`

**Note:** the spec cites `buildNfwLensLut.ts` / `createNfwLensLutTexture`
(PR #365) as technique precedent. Confirmed absent from this repo and this
worktree's branch — `src/utils/lensing/` does not exist; the code lives only
on the unmerged `feat/gravitational-lensing` branch. Do not cite or import
from it; the precedent is the spec's own description (a CPU generator
inverting a lens relation over a grid), not a file to follow.

**Interfaces:**

```ts
// src/@types/lensing/SchwarzschildDeflectionLut.d.ts
export type SchwarzschildDeflectionLut = {
  readonly samples: Float32Array; // total bending angle, radians, indexed by impact parameter
  readonly minImpactParamRs: number; // in units of r_s
  readonly maxImpactParamRs: number;
};

// src/utils/lensing/buildSchwarzschildDeflectionLut.ts
export function buildSchwarzschildDeflectionLut(sampleCount: number): SchwarzschildDeflectionLut;
```

**Steps:**

- [ ] Add the test `buildSchwarzschildDeflectionLut` with 2–3 literal
      reference values (hand-computed, not re-derived from the same formula
      the implementation uses — a genuine independent check per
      `testing.md`'s no-mirror rule):
  - the WEAK-FIELD limit at a large impact parameter `b` (many `r_s`):
    deflection angle `α ≈ 4GM/(c²b) = 2·r_s/b` radians — assert the LUT's
    sampled value at (or interpolated near) that impact parameter is within
    a stated tolerance of `2·r_s/b`.
  - a STRONG-FIELD value near the photon sphere (`b` approaching
    `3√3/2 · r_s ≈ 2.598 r_s`, the critical impact parameter): assert
    deflection grows large/diverges in the expected direction as `b`
    approaches that value from above (a monotonicity/limit assertion, not an
    exact literal — the exact strong-field value depends on the numerical
    integration scheme chosen for the generator, so pin the qualitative
    behaviour plus one moderately-strong-field reference point computed
    independently, e.g. via a standalone elliptic-integral or numerical
    check the test comment shows the derivation for).
  - a monotonicity property: deflection strictly decreases as `b` increases
    across the sampled range (an independent property per `testing.md`'s
    "Do" list, catching a sign/ordering bug the two point values might miss).
- [ ] Run the test — fails (function doesn't exist).
- [ ] Implement `buildSchwarzschildDeflectionLut`: for `sampleCount` grid
      points spanning a chosen `[minImpactParamRs, maxImpactParamRs]` range
      (must comfortably straddle the photon sphere at `~2.598 r_s` and reach
      out to where the weak-field approximation is already accurate, so the
      pass's O(1) LUT lookup covers both the escape and near-capture
      regimes), numerically integrate (or closed-form where available) the
      Schwarzschild bending-angle relation and populate `samples`.
- [ ] Run the test — passes.
- [ ] Run `npm run typecheck` — green.
- [ ] Commit.

---

### Task 10: Lensing WGSL uniform struct — byte/offset table

**Files:**
- Create: `src/services/gpu/shaders/lib/sgrAStarLensing.wesl` (or fold into
  an existing lensing-adjacent lib module if one is created by Task 13 —
  implementer's call on the exact filename; the byte table below is the
  contract regardless of file).
- Create/modify the matching TS packer (co-located with the renderer Task 13
  creates — see that task).

**Byte/offset table (contract — the plan-style category-3 table the spec
explicitly defers to plan time):**

Follows the `CameraUniforms` shared-prefix pattern from
`.claude/skills/wesl-shaders/SKILL.md` — 80-byte prefix (`viewProj` +
`viewportPx` + 2 pad floats), renderer-specific fields at offset 80+,
16-byte-aligned before any `vec3`/`vec4`:

| Offset (bytes) | Field | Type | Notes |
|---|---|---|---|
| 0–63 | `cam.viewProj` | `mat4x4<f32>` | shared `CameraUniforms` prefix |
| 64–71 | `cam.viewportPx` | `vec2<f32>` | shared prefix |
| 72–79 | `cam._pad0`, `cam._pad1` | `f32`, `f32` | shared prefix pads |
| 80–83 | `schwarzschildRadiusM` | `f32` | r_s in metres — the pass's own scale unit |
| 84–87 | `innerRs` | `f32` | emission annulus inner edge, r_s units |
| 88–91 | `outerRs` | `f32` | emission annulus outer edge, r_s units |
| 92–95 | `inclinationRad` | `f32` | |
| 96–99 | `positionAngleRad` | `f32` | |
| 100–103 | `flickerAmp` | `f32` | |
| 104–107 | `flickerTimescaleS` | `f32` | |
| 108–111 | `flickerPhase` | `f32` | sim-clock-derived phase, uploaded per frame (not a `BLACK_HOLES` constant) |
| 112–115 | `lutMinImpactParamRs` | `f32` | from `SchwarzschildDeflectionLut.minImpactParamRs` |
| 116–119 | `lutMaxImpactParamRs` | `f32` | from `SchwarzschildDeflectionLut.maxImpactParamRs` |
| 120–123 | `lutSampleCount` | `f32` (or `u32`, matching the LUT texture's actual texel count) | |
| 124–127 | `bandAlpha` | `f32` | the fade band's own alpha this frame — gates emission/deflection strength in-shader for the crossfade, avoiding a second CPU-side branch |
| 128–139 | `anchorPosRelCamM` | `vec3<f32>` | camera-relative anchor position, metres — the f64→f32 rebase seam, same pattern `bodyGlintsLayer`/`starPointsLayer` use |
| 140–143 | `_pad2` | `f32` | pad to keep the following field 16-byte aligned if one is added later; omit if 140 already satisfies alignment for the struct's end |

Total struct size: 144 bytes (rounds to a 16-byte multiple). The
`SchwarzschildDeflectionLut.samples` themselves are NOT part of this uniform
struct — they upload as a separate 1D texture (Task 12), sampled in-shader,
consistent with the `createNfwLensLutTexture` PRECEDENT DESCRIPTION (not the
absent file) the spec cites.

**Steps:**

- [ ] Write the WESL struct declaration matching the table exactly (field
      order, offsets via WGSL's natural alignment rules — verify each `f32`
      run before a `vec3` lands on a 16-byte boundary per the `wesl-shaders`
      skill's CameraUniforms pattern).
- [ ] Write the CPU-side `Float32Array` packer function with an inline
      docblock offset table matching this one (the wesl-shaders skill: "The
      CPU-side Float32Array write must match the WGSL struct byte-for-byte
      ... Document the offset table in a docblock on the renderer's TS
      file").
- [ ] Add a byte-offset parity test in the style of existing WGSL/TS parity
      tests (`tests/services/gpu/shaders/constants.parity.test.ts` precedent,
      per the wesl-shaders skill) OR a direct assertion that the packer
      writes each named field at its documented float index — this is a
      `testing.md` KEEP-RULE case (WGSL/TS parity + uniform byte-layout), not
      a constant restatement: it catches shader/TS drift invisible until a
      GPU silently reads garbage.
- [ ] Run `npm test` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 11: Sky-capture — fixed-size cubemap target row + `skyCubemapFaceContext`

**Files:**
- Modify: `src/services/gpu/renderTargets.ts` (`renderTargetRows` — new row)
- Create: `src/services/engine/frame/skyCubemapFaceContext.ts`
- Create: `tests/services/engine/frame/skyCubemapFaceContext.test.ts`
- Create: `src/@types/rendering/CubeFace.d.ts` (confirmed absent from the
  repo — no prior `CubeFace` type exists anywhere)

**Interfaces:**

```ts
// src/@types/rendering/CubeFace.d.ts — new type, one symbol per file.
export type CubeFace = 0 | 1 | 2 | 3 | 4 | 5; // ±X, ±Y, ±Z, in that index order

// src/services/engine/frame/skyCubemapFaceContext.ts
export function skyCubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>; // Sgr A*'s anchor position — the cubemap's eye
  readonly face: CubeFace;
  readonly faceSizePx: number;
}): ReadyFrameContext | null;
```

- New `renderTargetRows` entry (256² to start, per Q8): `id: 'sky-cubemap'`,
  `format: HDR_TARGET_FORMAT` (matches every other additive-HDR-fed row so
  the roster's additive draws keep their dynamic range), `depth: null` (the
  captured roster — point-sprites, star-catalog/aggregates, S-star glints —
  is depthless/additive, same profile as `hdr`), `clearValue: { r: 0, g: 0,
  b: 0, a: 0 }` (same additive-identity reason every reduced-res row in the
  table clears to zero — see `renderTargets.ts`'s module header), `fixedSizePx: { size: 256,
  layers: 6 }` (Task 3's mechanism), `scale` unused/irrelevant when
  `fixedSizePx` is set (per Task 3's contract) but the field is still
  required by the type — set it to `1` as an inert placeholder.

**Steps:**

- [ ] Add the test `skyCubemapFaceContext — derives a ReadyFrameContext with
      the eye at the anchor position, looking along the requested face axis`:
      call it for each of the 6 `CubeFace` values with a fixture `eyeMpc`,
      assert the returned context's camera position matches `eyeMpc` and its
      view direction matches the ±X/±Y/±Z convention documented on `CubeFace`
      (an independent geometric check — e.g. dot the returned forward
      direction with the expected axis vector — not a re-derivation of
      whatever `deriveFrameContext` internally does).
- [ ] Add the test `skyCubemapFaceContext — returns null before bootstrap`
      (mirrors `pickFrameContext`'s `isReady` guard,
      `pickFrameContext.ts:56-90`).
- [ ] Run the tests — fail (function doesn't exist).
- [ ] Implement `skyCubemapFaceContext` following the `pickFrameContext.ts`
      precedent exactly: re-derive a full `ReadyFrameContext` via
      `deriveFrameContext` from a SYNTHETIC camera pose (position = `eyeMpc`,
      orientation = the face's fixed look direction/up pair, a 90°
      symmetric-frustum projection sized for a cube face) rather than
      threading a swapped vp through every roster-layer consumer — because
      several roster layers read `ctx.fovYRad` / `ctx.canvasSize` /
      `ctx.drawPxPerRad` as frame-globals for angular sizing, not just
      `viewProj` (same rationale `pickFrameContext.ts:1-48`'s docblock gives
      for its own re-derivation choice).
- [ ] Add the `sky-cubemap` row to `renderTargetRows` per the contract above.
- [ ] Run `npm test -- skyCubemapFaceContext renderTargets` and
      `npm run typecheck` — green.
- [ ] Commit.

---

### Task 12: Capture scheduling + roster wiring

**Files:**
- Create: `src/services/engine/frame/skyCubemapCaptureSchedule.ts`
- Create: `tests/services/engine/frame/skyCubemapCaptureSchedule.test.ts`
- Modify: `src/services/engine/frame/frameProgram.ts` (capture render steps,
  gated on the lensing band being active)
- Modify: `src/services/engine/frame/renderFrame.ts:99-112` (the sole
  `frameProgram(...)` call site — thread the new argument)
- Modify: `src/services/engine/frame/passes/index.ts` (no new registry rows
  needed if the capture reuses the EXISTING roster layers' `draw` calls
  against the synthetic per-face context — confirm this during
  implementation; if a layer's `draw` reads engine-global state incompatible
  with a synthetic ctx, that layer needs a capture-aware branch, which is a
  STOP-and-report finding, not silently worked around)

**Interfaces:**

```ts
// skyCubemapCaptureSchedule.ts
export type SkyCubemapCaptureSchedule = {
  readonly facesToCapture: readonly CubeFace[]; // this frame's capture list
};

export function skyCubemapCaptureSchedule(input: {
  readonly bandJustEngaged: boolean; // band alpha crossed 0→positive this frame
  readonly frameIndex: number; // for round-robin
  readonly lastCapturedAtMs: ReadonlyMap<CubeFace, number>;
  readonly nowMs: number;
  readonly cameraMovedBeyondThreshold: boolean;
}): SkyCubemapCaptureSchedule;
```

**Amortization contract (spec):** full 6-face capture once on band entry
(`bandJustEngaged`); thereafter round-robin one face per frame
(`frameIndex % 6`); an escape valve re-captures a face out of turn when
camera movement or sim-clock time since its last capture exceeds a named
threshold CONSTANT (data tuning, not new architecture — name it
`SKY_CUBEMAP_RECAPTURE_THRESHOLD_MS` or similar, sited beside the schedule
function).

`frameProgram`'s signature grows a fourth parameter:
`frameProgram(tone: ToneMap, bloomEnabled: boolean, foregroundChain: readonly number[], skyCubemapFacesToCapture: readonly CubeFace[]): readonly FrameStep[]`
— an empty array outside the band emits no capture steps (Q6's zero-dispatch
guarantee). `renderFrame.ts:99-112`, the sole call site, computes this array
each frame from `skyCubemapCaptureSchedule` (fed the band alpha already
available via `ctx`/`state`) and passes it as the new fourth argument.

**Steps:**

- [ ] Add the test `skyCubemapCaptureSchedule — full 6-face capture on band
      entry`: `bandJustEngaged: true` → `facesToCapture` has all 6 faces
      regardless of `frameIndex`.
- [ ] Add the test `skyCubemapCaptureSchedule — round-robins one face per
      frame otherwise`: `bandJustEngaged: false`, vary `frameIndex` across 6
      consecutive values → each yields exactly one face, cycling through all
      6 without repeats within the cycle.
- [ ] Add the test `skyCubemapCaptureSchedule — escape valve re-captures a
      stale or camera-moved face out of turn`: a face whose
      `lastCapturedAtMs` predates `nowMs` by more than the threshold (or
      `cameraMovedBeyondThreshold: true`) appears in `facesToCapture` even
      when the round-robin wouldn't select it this frame.
- [ ] Run the tests — fail.
- [ ] Implement `skyCubemapCaptureSchedule` (pure function, no GPU/engine
      state — testable headlessly per the file's own test above).
- [ ] Wire the schedule into `frameProgram`: when the lensing band alpha is
      positive, emit one `{ kind: 'render', target: 'sky-cubemap', slab: ... }`
      step per face in `facesToCapture` (each drawing the fixed opt-in roster
      — `point-sprites`, `star-catalog` + `star-aggregates`, and the S-star
      partition branch — against that face's `skyCubemapFaceContext`); when
      the band alpha is 0, emit NO capture steps at all (Q6's "pass cost is
      exactly zero outside the band" guarantee, restated for the capture
      side of the feature, not just the lensing draw itself).
- [ ] Update `frameProgram.ts`'s two static `TIMED_SLOTS`/`TIMED_SLOT_GROUPS`
      builds (`frameProgram.ts:452-465`, which call
      `frameProgram(PLACEHOLDER_TONE, true, MAX_FOREGROUND_CHAIN)`) to pass
      all 6 `CubeFace` values as the new fourth argument — the same
      "maximum, not a real frame's shorter list" sizing rationale
      `MAX_FOREGROUND_CHAIN` already documents, so the DebugPanel's GPU-timing
      groups include the sky-cubemap capture rows even on a frame where the
      band is inactive and the real list would be empty.
- [ ] Name the runtime hand-off: `renderFrame.ts` (not `frameProgram`, which
      is static) derives the scheduled faces' `skyCubemapFaceContext`s each
      frame and passes them to the executor alongside the steps, so a capture
      step can resolve its face's context at execution time — the exact
      plumbing shape (a map on the step, a parallel array, a ctx lookup) is
      the implementer's call, but the responsibility split (renderFrame
      derives, executor consumes, frameProgram stays static data) is the
      contract.
- [ ] Confirm (read each roster layer's `draw`) whether reusing the existing
      `CONTENT_LAYERS` rows' `draw` calls against a synthetic per-face `ctx`
      "just works," or whether a layer reads something a synthetic context
      can't supply (e.g. a GPU handle keyed to the real frame). Report any
      such finding rather than papering over it with a special case.
- [ ] Run `npm test -- skyCubemapCaptureSchedule frameProgram` and
      `npm run typecheck` — green.
- [ ] Commit.

---

### Task 13: `ContentLayer` row `sgrAStarLensing` + the geodesic WESL shader

**Files:**
- Create: `src/services/gpu/shaders/bodies/sgrAStarLensing/vertex.wesl`
- Create: `src/services/gpu/shaders/bodies/sgrAStarLensing/fragment.wesl`
- Create: `src/services/gpu/renderers/bodies/sgrAStarLensingRenderer.ts`
- Create: `src/services/engine/frame/passes/sgrAStarLensingLayer.ts`
- Modify: `src/services/engine/frame/passes/index.ts` (register the new
  layer + import export)

**Interfaces:**
- `sgrAStarLensingLayer: ContentLayer` — `slab: 'body'`, `target: 'hdr'`,
  `blend: 'over'` (per-pixel alpha lets the roster show through where
  deflection is negligible — the spec's "per-pixel alpha does the rest of
  the work" — which is Porter-Duff OVER semantics, not additive; `Blend.d.ts`
  already enumerates `'over'` as a valid value for any target, and nothing
  in the codebase restricts `'over'` to the swap-chain rows).
  - `enabled(state, ctx, view)`: `view.slab.frame.kind === 'body-m' && view.slab.frame.bodyId === 'sgr-a-star'`,
    AND the fade band's alpha for this frame is `> 0` (Q6's zero-dispatch
    guarantee — checked the same "opacity 0 ⇒ no render" way every other
    band-gated layer in this codebase already does).
  - `draw`: binds the Task 10 uniform struct (viewProj/camera prefix +
    black-hole physics fields + this frame's `bandAlpha` + the sky-cubemap
    texture array as a `texture_cube` binding + the Task 9 LUT as a 1D
    texture binding), draws a fullscreen (or bounded-to-the-shadow's
    apparent-size) quad/triangle.
  - No `drawPick` — the spec's non-goal list excludes picking through the
    lensed region; Sgr A*'s existing pick stamp lives in `starPointsLayer`
    (`ContentLayer.d.ts:95-96`'s own docblock names this: "`starPointsLayer`
    draws the star roster but also stamps Sgr A*, which draws nothing
    anywhere and is invited by its caption alone") and is untouched by this
    feature — not moved, not widened, not gated on the new lensing band.

**Shader classification (fragment, per spec):** for each pixel's ray, look up
total deflection from the Task 9 LUT texture by impact parameter (O(1)); if
the ray's impact parameter is below the LUT's minimum (captured) → black; if
the deflected ray direction samples the sky cubemap at infinity → that
sample (escape, lensed background); if the impact parameter falls in the
annulus-adjacent range → run the bounded 32–64-step march (spec's explicit
bound) to accumulate emission glow (doppler + gravitational shift + the
uniform's `flickerAmp`/`flickerTimescaleS`/`flickerPhase` modulation) along
the ray, composited over the escape/capture base classification.

Known, accepted approximation: the LUT encodes infinity-to-infinity
deflection, so its error grows as the camera nears the 2 r_s floor (the
strongest-field viewpoint). This is inherent to the spec's LUT design, is
judged at Task 17's visual gate, and is NOT a bug to chase numerically —
if the floor view looks wrong there, that is a gate finding for the user,
not a licence to build finite-distance geodesics.

**Steps:**

- [ ] Write `vertex.wesl`: minimal fullscreen-triangle (or quad) vertex
      stage producing clip position + a per-pixel view-ray direction varying,
      importing `CameraUniforms` from `package::lib::camera` per the
      wesl-shaders skill's shared-prefix convention (gotcha #2: `package::`,
      never the npm name; gotcha #3: imports at the top).
- [ ] Write `fragment.wesl` implementing the escape/annulus/capture
      classification above, sampling the Task 9 LUT texture and the Task 11
      sky-cubemap texture array as `texture_cube`. No backticks in comments
      (wesl-shaders gotcha #1); no brace-list imports (gotcha #4); one
      `import` per identifier (gotcha #5) — cite `lib/math.wesl` as the
      "one cohesive multi-function module" precedent if any shared helper
      (e.g. a ray-sphere or ray-annulus intersection) is factored out.
- [ ] Write `sgrAStarLensingRenderer.ts`: the TS pipeline (pipeline layout,
      bind group with the Task 10 uniform buffer + LUT texture + cubemap
      texture, `createShaderModuleWithDevLog` per the shader-compile-logger
      convention every renderer in this tree already follows) — cite
      `bodyGlintRenderer.ts` as the structural precedent for a small
      single-draw renderer (explicit non-`'auto'` bind group layout, `label:`
      on every resource). Include a texture-upload helper that turns Task 9's
      `SchwarzschildDeflectionLut.samples` into a 1D GPU texture (`r32float`,
      width = `samples.length`) at construction time — the direct analogue of
      the spec's cited (but absent from this repo) `createNfwLensLutTexture`;
      define it in this file rather than inventing a second lensing-utils
      home for one function.
- [ ] Write `sgrAStarLensingLayer.ts` implementing the `ContentLayer`
      contract above.
- [ ] Register `sgrAStarLensingLayer` in `passes/index.ts`'s import list and
      `CONTENT_LAYERS` array (position per Task 14's reorder — this task adds
      the row; Task 14 fixes its exact index relative to `orbit-trails` /
      `body-glints`).
- [ ] Manual dev-server smoke check that the shader module compiles (no
      `Invalid ShaderModule` in the console per the wesl-shaders skill's
      dev-mode logger) — this is not the full visual gate (Task 17), just
      confirming the pipeline builds.
- [ ] Run `npm test` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 14: Draw-order reorder — lensing before `orbit-trails`/`body-glints`

**Files:**
- Modify: `src/services/engine/frame/passes/index.ts`

**Interfaces:** none new — a reorder of `CONTENT_LAYERS`'s existing array
(`passes/index.ts:245-380`).

**Steps:**

- [ ] Re-read `passes/index.ts`'s current order at the time of this task
      (Task 13 already inserted `sgrAStarLensingLayer` somewhere) — confirm
      the current indices of `milkyWayAggregateLayer`/`milkyWayUpsampleLayer`/`milkyWayLayer`/`starPointsLayer`
      (which the lensing pass must draw AFTER, since it samples the roster)
      and `orbitTrailsLayer`/`bodyGlintsLayer` (items 12/12b in the module
      header's numbered list at the time this plan was written — re-verify
      against the live file, since Task 8 modified `bodyGlintsLayer` but not
      its position).
- [ ] Move `sgrAStarLensingLayer` to sit AFTER `starAggregateUpsampleLayer`/`constellationsLayer`
      (the last roster row the lensing pass samples — point-sprites,
      milky-way, star-points, star-aggregates, star-catalog are all upstream
      by the time `constellationsLayer` runs) and BEFORE `orbitTrailsLayer`.
- [ ] Move `orbitTrailsLayer` and `bodyGlintsLayer` to sit AFTER
      `sgrAStarLensingLayer` in the array (a two-row reorder — the spec's
      explicit "orbit-trails and body-glints therefore move to draw AFTER
      sgrAStarLensing").
- [ ] Update the module header's numbered draw-order comment (`passes/index.ts:1-198`)
      to reflect the new positions — this comment is the file's own
      authoritative map and must not go stale (it directly documents load-
      bearing order, unlike a narrative aside).
- [ ] Run `npm test` and `npm run typecheck` — green (no test should assert
      the old literal order without a real reason; if one does, per
      `testing.md` judge whether it's a legitimate order-dependency test —
      update it if so, delete it if it was a restatement).
- [ ] Commit.

---

### Task 15: Debug-panel dev-tuning knobs

**Amended during implementation — this section SHIPS.** The planned removal
step is cancelled: the Tier-2 fields have no owner other than
`settings.sgrAStarLensingTuning`, the look is taste that will keep being
retuned, and `cubemapResolutionPx` is a live VRAM/sharpness trade. The
176-byte uniform tail is therefore permanent. See the spec's §Settings.

**Files:**
- Create: `src/components/DebugPanel/SgrAStarLensingTuningSection.tsx`
- Create: `src/components/containers/SgrAStarLensingTuningSectionContainer.tsx`
- Modify: `src/components/DebugPanel/DebugPanel.tsx`

**Precedent:** `ZoneOfAvoidanceTuningSection.tsx` +
`ZoneOfAvoidanceTuningSectionContainer.tsx` (and their sibling
`MilkyWayTuningSection*` pair) are this codebase's existing "a subsystem's
look knobs ride the debug panel" pattern — mount/unmount shape, container
owning the store read/write, section owning the sliders. Follow that
structure for the emission/LUT/capture constants named as dev-tunable in the
spec's Settings section (flicker amplitude/timescale, position angle,
inclination — whatever Task 6's literal `BLACK_HOLES` values and Task 12's
capture threshold constant benefit from live-tuning during Task 17's visual
gate).

**Steps:**

- [ ] Add the tuning section + container following the
      `ZoneOfAvoidanceTuningSection*` structural precedent, wired to mutate
      the relevant constants at runtime (via whatever live-settings seam
      that precedent uses — read its container before implementing, don't
      invent a new one).
- [ ] Mount it in `DebugPanel.tsx` alongside the other tuning sections.
- [ ] Use it during Task 17's visual gate to converge on the DEFAULTS that
      ship: Tier-1 values back into `BLACK_HOLES` (Task 6), Tier-2 values into
      `DEFAULT_SGR_A_STAR_LENSING_TUNING` (`src/data/defaults.ts`). The
      section itself stays mounted.
- [ ] Run `npm test` and `npm run typecheck` — green.
- [ ] Commit.

---

### Task 16: Perf baseline + re-measure (hard gate)

**Files:** none — measurement only.

**Steps:**

- [ ] BEFORE any Phase B code lands (i.e., run this against Phase A's merged
      state, or the earliest point in Phase B history before Task 5):
      read `.claude/skills/perf/SKILL.md` first, then run `npm run perf`
      with `--url http://localhost:<this worktree's dev-server port>` (read
      the port off this worktree's own `npm run dev` output — never another
      branch's server). Record the baseline numbers outside the band (Sgr A*
      far off-frame) and note there is no "inside the band" baseline yet
      (the feature doesn't exist).
- [ ] AFTER Task 15 (all feature work done — the tuning section ships, per
      the Settings amendment above, so there is no removal step to wait on):
      re-run
      `npm run perf` the same way, twice — once with Sgr A* far outside the
      lensing band (expect a neutral delta vs. the baseline — Q6's zero-cost
      guarantee), once with the camera inside the band (expect a bounded,
      not unbounded, cost — the six-face capture amortized per Q8, the LUT
      lookup O(1) per pixel, the bounded 32–64-step march only for
      annulus-adjacent pixels).
- [ ] The report must carry a VRAM line for the `sky-cubemap` row alongside
      the timing numbers: 0 B outside the band, 50 MB in-band at the shipped
      1024 px resolution, 201 MB at the 2048 px knob — the row is lazily
      allocated (`renderTargets.ts`), so this cost is invisible to a timing
      reading alone.
- [ ] Report both readings plainly. Per the spec's Perf section and the
      project's code-is-liability convention: a regression outside the band,
      or an unbounded/unacceptable cost inside it, HALTS the landing
      pipeline — this is the user's ruling to make, not something this task
      auto-resolves by tuning until
      the numbers look acceptable. If the outside-band delta is non-neutral,
      that is itself a bug to find (the spec's guarantee is exactly zero
      dispatch outside the band) before considering the inside-band number
      at all.

---

### Task 17: Final visual gate (USER-ATTESTED)

**Files:** none — manual verification against the running dev server.

**Steps:**

- [ ] With the dev server running and the feature complete, focus Sgr A* and
      descend into the lensing band. Verify, with the user, EACH of the
      spec's five checklist items verbatim:
  - [ ] shadow diameter reads as ~5.2 r_s (the EHT-consistent apparent size);
  - [ ] an Einstein ring is visible on background stars crossing near the
        shadow;
  - [ ] doppler asymmetry favours the correct side of the annulus (the
        approaching material's side, given the chosen inclination/position
        angle);
  - [ ] the fade band crossfades without a pop at either edge;
  - [ ] the far-field glint hands off to the close-up without a visible seam.
- [ ] Also judge two items outside the spec's original five, added by the fix
      round's re-review: the Milky-Way discontinuity at the lens quad's rim
      (the MW cloud is deliberately not in the capture roster, so its edge
      against the captured sky can show a seam), and the capture-face
      aggregate knee (relabelled kneed/un-kneed this round — never eyeballed
      before this gate).
- [ ] Report the outcome per item. Any failing item is a STOP — fix and
      re-gate, not a partial ship.
- [ ] Only once every item passes AND Task 16's perf gate is clean does this
      plan's feature work count as ready for `/feature-done`.

---

## Definition of Done

**Deliverable inventory:**
- Phase A: `SCENE_ANCHOR_POINT_BODIES`, `visibleSlabBodies`'s `{bodies}`
  signature, the three-term `BODY_SLAB_CAPACITY`, `clampDistance`'s
  `standoffRadii` param, `SGR_A_STAR.standoffRadii`, `RenderTargetSpec.fixedSizePx`.
- Phase B: `SGR_A_STAR_MASS_SOLAR`, `schwarzschildRadiusM`, `BlackHoleRow` +
  `BLACK_HOLES`, `SCALE_FADE_BANDS.sgrAStarLensing`, the far-field glint
  addition to `bodyGlintsLayer`, `SchwarzschildDeflectionLut` +
  `buildSchwarzschildDeflectionLut`, the `sky-cubemap` render target row,
  `CubeFace`, `skyCubemapFaceContext`, `skyCubemapCaptureSchedule`, the
  `sgrAStarLensing` `ContentLayer` (WESL shader pair + TS renderer +
  layer), the `CONTENT_LAYERS` reorder, `sgrAStarSchwarzschildRadiusKm.ts`
  deleted with both its readers migrated.

**Named observable behaviours (manual smoke pass):**
- Sgr A* shows a faint warm-orange glint from any distance while on screen,
  with no mesh (confirms `AnchorPointBody`'s corrected docblock is honest).
- Descending inside 500 AU, the glint crossfades into a lensed close-up with
  no pop; inside 100 AU the close-up is fully engaged.
- The close-up shows: a black shadow (~5.2 r_s), an Einstein ring on
  background stars, a doppler-asymmetric emission annulus, and orbit
  trails/S-star sprites/labels/marker rings drawn crisp and UNWARPED on top
  (Q5 — lensing never touches annotations).
- The camera cannot descend past 2 r_s (Task 4's probe target, backed by
  Task 2's `standoffRadii: 2.0`).
- Outside the band, `npm run perf` shows no measurable regression versus the
  pre-feature baseline; inside the band, the cost is bounded, not runaway.

**Deferral boundary (from the spec's non-goals — do not chase these):**
- No Kerr metric (Schwarzschild only).
- No full-GR observer view below 2 r_s (no local-frame aberration/redshift;
  the descent floor stops the camera at the boundary where the shader's
  static-viewpoint model is still defensible).
- No cinematic accretion disc (EHT-style faint glow only).
- No M87* or any second black hole (`BLACK_HOLES` holds room for one; not
  populated here).
- No tour beat.
- No lensing of annotations (orbit trails, marker rings, labels, picking
  stay unlensed, composited on top).
- No new user-facing settings.
