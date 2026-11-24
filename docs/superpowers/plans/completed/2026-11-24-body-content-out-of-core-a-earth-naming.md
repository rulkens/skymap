# Body content out of core, PR A: core stops naming Earth

> **For agentic workers:** execute with `superpowers:subagent-driven-development` under
> [`sdd-execution.md`](../../conventions/sdd-execution.md). Steps use checkbox (`- [x]`) syntax.

**Goal:** always-loaded core code no longer imports `SCENE_EARTH`, `EARTH_REF` or a default Earth
body, so it loads and runs with no Earth row. No behaviour change in the app.

**Spec:** [`2026-11-24-body-content-out-of-core-design.md`](../../specs/2026-11-24-body-content-out-of-core-design.md)
§4.4, §4.5, §5 prep 1–3. This is the first of four PRs (§6); B, C and D get their own plans.

**Why it is safe to land alone:** the app composition still has Earth, so every fold below holds
exactly one Earth row and every reader gets today's value.

**Not in this PR:** corrections, star rows, meshes, the fade-edge fallback, the empty-registry
import test (it cannot pass until PR B removes `barycentricPairs.ts`, which throws with no Moon).

---

### Task 1: The home declaration is a static registry the URL rule reads

**review: yes** (Redux state and sagas)

**Files:** `src/compositions/appHome.ts` (create), `src/compositions/app.ts` (modify),
`src/state/url/hashParamSources.ts` (modify), `src/compositions/README.md` (modify),
`tests/state/url/hashParamSources.test.ts` (modify)

`HASH_PARAM_SOURCES` is a static table read by import in five files, so it cannot take the home
from `SagaContext`. It reads it the way core reads every other composition fact: a
`compositions/app<Name>.ts` file (ADR 0013's static mechanism).

**Contract:**

```ts
// src/compositions/appHome.ts
export const APP_HOME: EngineHomeConfig = EARTH_HOME;
```

- `app.ts` sets `home: APP_HOME` (today `EARTH_HOME`, `src/compositions/app.ts:11`).
- The focus source's omit rule (`hashParamSources.ts:151-161`) compares the focus row against
  `APP_HOME.focus?.ref` instead of `EARTH_REF`. A `null` home focus omits nothing.
- The `EARTH_REF` import leaves `hashParamSources.ts`.
- Add an `APP_HOME` row to the ledger table in `src/compositions/README.md` (static, 1 core reader).

- [x] Add the test `a focus that is the composition's home composes no param` (the existing Earth
      case, asserted through `APP_HOME`).
- [x] Add the test `with a null-focus home, a focused body composes its param` (mock
      `compositions/appHome` to `{ focus: null, seedSelection: false }`, focus Earth, expect
      `body-earth`).
- [x] Implement.
- [x] `npm test -- hashParamSources hashBodyFor watchHashWriteSaga` passes.
- [x] Commit.

### Task 2: Go-home goes to the composition's home

**review: yes** (Redux state and sagas; camera pose)

**Files:** `src/state/selection/watchGoHomeSaga.ts` (modify),
`tests/state/selection/watchGoHomeSaga.test.ts` (modify)

The saga hard-codes `EARTH_REF` at `watchGoHomeSaga.ts:48-53`. It reads
`SagaContext['home']` instead (the context member exists, `src/store/types.ts:188`;
`navigateSaga.ts:114` shows the read).

**Behaviour:**

- `home.focus !== null`: as today, with `home.focus.ref` for both selection puts and the pose.
  `seedSelection: false` skips `updateSelectionSelect`.
- `home.focus === null`: `clearSelection()`, then the same tween to the null-home pose.
- The tween's `to` is `homePose(home, runtime.fovYRad, simDays, frameBasis)`
  (`src/services/engine/camera/framing/homePose.ts:15`), which already frames both arms. If its
  return type does not fit `startCameraTween`'s `to`, stop and report; do not add a conversion.

- [x] Update the existing tests to provide `home: EARTH_HOME` in the saga context; they must pass
      unchanged otherwise.
- [x] Add the test `a null-focus home clears the selection and tweens to the fixed home pose`.
- [x] Implement; the `EARTH_REF` and `bodyHomePose` imports leave the file.
- [x] `npm test -- watchGoHomeSaga` passes.
- [x] Commit.

### Task 3: Fly-to-lon-lat names its body

**review: yes** (Redux state and sagas)

**Files:** `src/state/camera/flyToLonLatActions.ts` (modify),
`src/state/camera/watchFlyToLonLatSaga.ts` (modify),
`src/layers/body/surfaceTiles/debug/ui/SurfaceTileAtlasSection.tsx` (modify),
`src/layers/body/surfaceTiles/debug/ui/SurfaceTileAtlasSectionContainer.tsx` (modify),
`tests/state/camera/watchFlyToLonLatSaga.test.ts` (modify)

**Contract:** `flyToLonLatActions.ts:14` `readonly body?: string` → `readonly body: string`.

- The saga drops `?? SCENE_EARTH.id` (`watchFlyToLonLatSaga.ts:39`) and the `SCENE_EARTH` import.
- `actionsForPaletteAction.ts:27` already passes `body: 'earth'`; no change.
- The atlas section's free-text fly-to (`SurfaceTileAtlasSection.tsx:49`) passes
  `snap.bodyId ?? SCENE_EARTH.id`. The body Layer may name Earth; core may not.
- No new test: a type sweep. Update the saga test's payloads to carry `body`.

- [x] Implement; `npm run typecheck:fast` clean; `npm test -- watchFlyToLonLatSaga` passes.
- [x] Commit.

### Task 4: Core tables read Earth as a list of rows

**review: yes** (pick tables decode by array position)

**Files:** `src/data/bodies/sceneEarthBodies.ts` (create), `src/data/bodies/sceneEarth.ts`,
`src/data/bodies/sceneBodies.ts`, `src/data/bodies/bodyPickRows.ts`,
`src/utils/meshBodies/meshBodySlabHostId.ts`, `src/services/engine/frame/sceneOccluderBodies.ts`,
`src/utils/orbit/sampledCraftPositionMpc.ts` (modify),
`tests/services/engine/frame/sceneOccluderBodies.test.ts` (create)

**Contract:**

```ts
// src/data/bodies/sceneEarthBodies.ts
/** The composed Earth rows: one in the app, none in a composition without the body Layer. */
export const SCENE_EARTH_BODIES: readonly EarthBody[];
```

- `sceneEarth.ts` becomes `SCENE_EARTH_BODIES[0]` or today's throw (`sceneEarth.ts:12`). Its 13
  Layer readers are untouched.
- `sceneBodies.ts:17` spreads `SCENE_EARTH_BODIES` in the same leading position.
- `bodyPickRows.ts:17` `earth: SCENE_EARTH_BODIES`.
- `meshBodySlabHostId.ts:16` builds its set from `SCENE_EARTH_BODIES` and `SCENE_PLANETS`.
- `sceneOccluderBodies.ts:38-50` runs its Earth block once per `SCENE_EARTH_BODIES` entry; the
  `.get(...)!` stays total because a row's state always exists.
- `sampledCraftPositionMpc.ts:54` reads `EARTH_DATUM_RADIUS_M`
  (`src/data/bodies/earthDatumRadiusM.ts:2`). First confirm it equals
  `SCENE_EARTH.surface.datumRadiusM`; if it does not, stop and report.
- After this task no file outside `src/layers/`, `src/data/bodies/sceneEarth.ts`,
  `src/data/selection/` and `src/data/animation/clips/` imports `sceneEarth` by value. Check with
  `grep -rn "bodies/sceneEarth'" src`.

- [x] Add the test `sceneOccluderBodies returns nothing with no Earth row and no scene bodies`
      (mock `data/bodies/sceneEarthBodies` to `[]`, empty `snapshot.sceneBodies`).
- [x] Add the test `sceneOccluderBodies adds Earth once it is resolvePx across` (one Earth row,
      camera close enough; and the far case returns nothing).
- [x] Implement.
- [x] `npm test -- sceneEarth sceneBodies bodyPickRows meshBodySlabHostId sceneOccluder sampledCraft`
      passes.
- [x] Commit.

### Task 5: Verify the app is unchanged

**Files:** none

- [x] Before the branch's first commit and after its last, shoot with `npm run shot` on this
      worktree's dev server: the Earth home (bare link), a planet focus, a mission focus, and the
      Earth home again after pressing the go-home key from the planet. Pairs go to the owner as dash
      checks.
- [x] If the owner chose the perf gate at plan start: `npm run perf` and `npm run perf:cpu` before
      and after, `--url` this worktree's server (`sceneOccluderBodies` runs per frame).
- [x] Open a bare link, focus Mars, press go-home: the URL returns to bare.

---

## Definition of Done

**Deliverables**

- `src/compositions/appHome.ts` exporting `APP_HOME`, with its ledger row.
- `src/data/bodies/sceneEarthBodies.ts` exporting `SCENE_EARTH_BODIES`.
- `flyToLonLat`'s `body` is required.
- No value import of `sceneEarth` or `earthRef` from always-loaded core (the grep in Task 4, and
  `grep -rn "selection/earthRef'" src/state src/services src/utils` is empty).

**Observable behaviours**

- A bare link opens on Earth with the ring and card; the URL stays bare.
- Go-home from another body returns to Earth and the URL returns to bare.
- The palette's Earth places and the atlas debug fly-to still land on the right body.
- Earth still hides orbit trails and labels behind it at close range.

**Deferral boundary**

- Everything in spec §5 prep 4–6 and §7. Core still throws with an empty body registry after this
  PR (`barycentricPairs.ts`, the shape-model list); that is PR B and C.
- The three Earth clips under `src/data/animation/clips/` keep importing `SCENE_EARTH` (leftovers
  J4).
