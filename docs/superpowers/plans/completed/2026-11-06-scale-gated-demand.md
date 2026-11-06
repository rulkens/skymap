# Scale-gated demand (PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** at Earth, the GPU holds no data that nothing draws. That means no Søndermarken mesh, no Venus or Moon
surface, no survey catalogs, no MCPM volume and no Local Bubble. Each of these loads as the camera approaches the
scale where it shows.

**Architecture:** `AssetDemand` (PR A, merged #1076) gains a `size` gate (apparent diameter on the largest
drawing view) and an `edge: 'both'` band gate, and its band gates respect `band.items`. Body-texture and mesh rows
move to `size`, which deletes the transitional `fn` variant. The survey, structure, constellation and Local Bubble
rows declare `near`. Gaia's hand-coded crossfade becomes a declared band.

**Tech Stack:** TypeScript, WebGPU, Vitest.

**Spec:** `docs/superpowers/specs/completed/2026-11-06-declarative-asset-demand-design.md` (section "PR B — scale gates").

## Global Constraints

- `type` aliases, never `interface`; one type per `@types/` file; one function per `utils/` file; deep relative imports.
- Comments explain why only; module header ≤ 10 lines (`docs/superpowers/conventions/comments.md`).
- Moves and renames go through `npm run move-files`; deletions use `git rm` by path.
- Commits use the repo identity, with **no `Co-Authored-By` trailer**. Never `git add -A`, never `git stash`.
- Tests only for what can fail (`docs/superpowers/conventions/testing.md`). **No row test may restate a declaration**
  (the PR A deletion-audit ruling). Declarations are proven by the evaluator tests plus the behavioural pose tests in
  Task 5.
- Read the `perf` skill before Task 7. Measure before (on `d500ceaba`) and after.

## Review Focus

1. **The first frames after boot** (`drawPxPerRad` = 0). No size-gated row demands, and nothing throws. Owned by Task 3.
2. **A craft that hasn't launched yet** (its position is parked inside Earth). It must not demand its mesh, even
   though its apparent size there is huge. Owned by Task 3.
3. **A surface site straight below the camera** (Søndermarken from 2 km up). It must demand: the eye-to-site
   segment must not count as occluded when the eye is just above the site. Owned by Task 3.
4. **A deep link or search to a survey galaxy from Earth.** The catalog loads through `alsoWhen`, and the focus
   resolves. Owned by Task 5's pose test, with the `selected` lift.
5. **Gaia in the 8–25 kpc range.** Stars fade exactly as they did before (the band and the old crossfade agree),
   with no pop at 8 kpc or 25 kpc. Owned by Task 6.

---

### Task 1: Bands gate only their items; `edge: 'both'`

**Files:**
- Modify: `src/@types/loading/NearGate.d.ts`, `src/services/engine/wiring/resolveAssetDemand.ts`,
  `src/services/engine/wiring/evaluateAssetDemand.ts`, `src/services/engine/wiring/assertAssetDemands.ts`
- Tests: `tests/services/engine/wiring/evaluateAssetDemand.test.ts`,
  `tests/services/engine/wiring/assertAssetDemands.test.ts`

**Contract:**
- `edge: 'in' | 'out' | 'both'`. With `'both'`, a row demands only inside both load limits and releases past
  either release limit.
- A band with `items` gates a row only when those items include the row's resolved item. Otherwise the row
  behaves as if it had no `near`.
- The assert requires a `'both'` band to have both `in` and `out`.

- [x] Test `both edges: loads only between the two load limits`. Use in `[0.4, 1]` and out `[4, 10]` with lead 2,
  release 4. Demand at 0.3 and 19; no demand at 0.15 or 21.
- [x] Test `both edges: releases past either release limit`: release at 0.09 and at 41; neither at 0.15 or 30.
- [x] Test `a band whose items exclude the row's item does not gate it`: far away, it is still demanded.
- [x] Assert test `'both' on a one-sided band throws`.
- [x] `npm test -- evaluateAssetDemand assertAssetDemands` passes. Commit.

### Task 2: `drawPxPerRad` reaches demand

**review: yes** (frame / camera)

**Files:**
- Modify: `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/engine.ts` (initialised at 0),
  `src/services/engine/frame/runFrame.ts`, `src/@types/loading/DemandCtx.d.ts`,
  `src/services/engine/wiring/buildDemandCtx.ts`

**Contract:**
- `EngineState.drawPxPerRad: number` sits beside `fadesAnimating` and `layersLoading`, the other last-frame facts
  runFrame owns. runFrame writes the max `drawPxPerRad` over `views` right after deriving them
  (`runFrame.ts:194-198`), inline: captures never reach those `views`, so there is no filter to extract.
  `DemandCtx.drawPxPerRad` reads it. Check `frameFilePurity.test.ts`: the max is an expression, not a declared symbol.

- [x] Wire it through. Write no test for the plumbing.
- [x] `npm run typecheck:fast`, `npm test -- buildDemandCtx runFrame frameFilePurity` pass. Commit.

### Task 3: The `size` gate

**review: yes**

**Files:**
- Create: `src/@types/loading/SizeGate.d.ts`
- Modify:
  - `src/@types/loading/DeclaredDemand.d.ts`
  - `src/services/engine/wiring/resolveAssetDemand.ts`
  - `src/services/engine/wiring/evaluateAssetDemand.ts`
  - `src/services/engine/wiring/assertAssetDemands.ts`
- Tests: `evaluateAssetDemand.test.ts`, `assertAssetDemands.test.ts`

**Contract:**

```ts
export type SizeGate = { readonly body: SceneBodyId; readonly loadPx: number; readonly releasePx: number };
// DeclaredDemand gains: readonly size?: SizeGate;
```

**Evaluation** (a scale gate like `near`; when a row has both, both must load, and either one can release):

- `px = bodyApparentDiameterPx({ positionMpc, radiusM: bodyFootprintRadiusM(body), camPosMpc: ctx.cameraPosMpc, pxPerRad: ctx.drawPxPerRad })`.
  The position comes from `deriveBodyStates(ctx.simDays)`.
- Load when `px ≥ loadPx`, the body is present (`spacecraftPresent(body.id, ctx.simDays)` for craft; always true
  otherwise), and, for a surface site (`position.kind === 'site'`), the site is not below its host's horizon.
- The horizon test is `subjectOccludedByBodies({ subjectMpc: site, camPosMpc, bodies: [{ positionMpc: host, radiusM: innerBoundRadiusM(host.surface) }] })`.
- Release when `px < releasePx`. Presence and horizon never release.
- Assert: the body exists in the scene, and `loadPx > releasePx > 0`.

Tests:

- [x] `size loads at loadPx and releases below releasePx`. Fix `drawPxPerRad` and place a body so px = 17, then 12, then 7.
- [x] `size never demands before the first frame`: `drawPxPerRad` 0 → no demand, no throw.
- [x] `an absent craft never demands its mesh`: a craft with a future launch, camera at its parked position.
- [x] `a site below its host's horizon does not load`, using Søndermarken with the camera on Earth's far side, 500 km up.
- [x] `a site straight below the camera loads`: Søndermarken from 2 km up.
- [x] `occlusion never releases a loaded site`: in the hold band, with the site behind the horizon → release false.
- [x] Assert tests for both throws.
- [x] `npm test -- evaluateAssetDemand assertAssetDemands` passes. Commit.

### Task 4: Body textures and meshes on `size`; the `fn` variant goes

**Files:**
- Modify:
  - `src/layers/body/textures/load/bodyAssetRows.ts`
  - `src/services/engine/wiring/meshAssetRows.ts`
  - `src/@types/loading/AssetDemand.d.ts` (drop the `{ fn, release? }` member)
  - `resolveAssetDemand.ts`
  - `evaluateAssetDemand.ts`
  - `tests/services/engine/camera/oneMpcSeam.test.ts` (the allowlist strings at `:78-83`)
- Delete (with `git rm`):
  - `src/@types/loading/DemandFn.d.ts`
  - `src/layers/body/textures/load/bodyTextureLoadRadius.ts`
  - `src/layers/body/textures/load/pastTextureReleaseRadius.ts`
  - `src/services/engine/frame/meshBodyLoadRadius.ts`
  - their tests (`tests/layers/body/textures/load/pastTextureReleaseRadius.test.ts`, and the `fn` cases in `bodyAssetRows.test.ts`)

**Values:**
- Texture row: `{ size: { body: hostBodyId(entry.bodyId), loadPx: 16, releasePx: 8 } }`. A ring rides its host.
- Mesh row: `{ size: { body: body.id, loadPx: <the body's resolvePx>, releasePx: <resolvePx / 2> } }`. That is
  `BODY_GLINT_MAX_PX` = 3 and 1.5, read from the scene body record, never re-typed.
- The `bodyTextureAtlas` row stays `'always'`.
- Delete the dead `bodyPosOf`, `ceilingOf`-if-unused, and `bodyPos` helpers.

- [x] Delete the restating row tests. The behavioural proof is Task 5's pose test.
- [x] `grep -rn "fn:" src/layers src/services/engine/wiring` finds no demand `fn`.
- [x] `npm run typecheck:fast` and `npm test -- bodyAssetRows meshAssetRows oneMpcSeam demandTable` pass. Commit.

### Task 5: `near` on survey, structure, constellation and Local Bubble rows; survey lifts

**Files:**
- Rows:
  - `src/layers/galaxyCatalog/records/load/galaxyCatalogAssetRows.ts`
  - `src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows.ts`
  - `src/layers/cosmicWebFilaments/filaments/load/filamentsAssetRows.ts`
  - `src/layers/flow/streamlines/load/flowAssetRows.ts`
  - `src/layers/structure/catalog/load/structureAssetRows.ts`
  - `src/layers/constellations/figures/load/constellationsAssetRows.ts`
  - `src/layers/localBubble/shell/load/localBubbleAssetRows.ts`
- Visibility: `src/layers/galaxyCatalog/visibility.ts` (survey entry gets `selects: ['galaxyCatalog']`)
- Test: `tests/services/engine/wiring/demandTable.test.ts` (or a sibling `demandAtPoses.test.ts`, if that file's
  Infinity camera is awkward)
- Backlog: delete the "Scale-gated asset demand" index line in `docs/BACKLOG.md` and
  `docs/backlog/2026-07-24-scale-gated-asset-demand.md`

**Values:**

| Row | Declaration |
|---|---|
| galaxy points (every source; famous is exempt via `band.items`) | `near: { band: 'deepZoom', edge: 'in', lead: 10, release: 100 }`, `alsoWhen: ['searching']` (the selected lift is implicit, owner 2026-11-06) |
| cosmicWebDensity, cosmicWebFilaments | `near: { band: <their SURVEY_DEEP_ZOOM band key>, edge: 'in', lead: 10, release: 100 }` |
| flow | `near: { band: <its FLOW_DEEP_ZOOM band key>, edge: 'in', lead: 10, release: 100 }` |
| structureCatalog | adds `near: { band: 'cosmic', edge: 'in', lead: 10, release: 100 }` |
| constellations | `near: { band: 'neighbourhood', edge: 'out', lead: 10, release: 100 }` |
| localBubble | `near: { band: 'shell', edge: 'both', lead: 2, release: 4 }` |

Behavioural pose tests run the real composed rows (`createLayers` or the demand table) through `evaluateAssetDemand`:

- [x] `at the Earth boot pose nothing invisible demands`. With the default settings and a 1080p, 60° `drawPxPerRad`
  (≈ 935), none of these demand:
  - every survey points row, density, filaments, flow, structureCatalog and localBubble;
  - the Søndermarken mesh (camera at the default Earth view);
  - the Venus and Moon surface textures (`simDays` for 2026-11-06).
  The Earth surface and the atlas do demand.
- [x] `at 1 Mpc the survey layers demand`: survey points, density, filaments and structureCatalog do; localBubble
  and constellations release; the famous catalog demands at every pose.
- [x] `a selected survey galaxy loads its catalog from Earth`: `selectedKinds` has `'galaxyCatalog'` → survey
  points demand at the Earth pose.
- [x] `npm test -- demandTable` (and the new file) pass. Commit.

### Task 6: Gaia's band as the single truth

**review: yes** (renderer)

**Files:**
- Modify:
  - `src/layers/starCatalog/visibility.ts`: the `starCatalog` show entry gains `survey: { out: [8 * KPC, 25 * KPC], items: ['gaiaStars'] }`; fix the comment at `:28`.
  - `src/layers/starCatalog/survey/load/starCatalogAssetRows.ts`: Gaia gets `near: { band: 'survey', edge: 'out', lead: 10, release: 100 }`.
  - `src/layers/starCatalog/sources/gaia-stars.ts:46` and `SurveyStarCatalogSourceEntry.d.ts:27`: delete `crossfadePc`.
  - The star passes `starCatalogPass.ts:20`, `starAggregatesPass.ts:22`, `starAggregateUpsamplePass.ts:24` and `starCutInputs.ts:38`.
  - `starSourceDrawOpacity.ts`, `starSourcesInBand`, `starCatalogVisible`.
- Delete: `src/layers/starCatalog/octreeCut/utils/starCrossfadeOpacity.ts` and its test.
- Tests: the existing star opacity/visibility tests, adapted.

**Contract:** the passes take Gaia's opacity from the address fade (the same `fade` route the other Layers' passes
use; see how `localBubblePass.ts:28-33` reads its band). A pass's `enabled` is false when that fade is 0. Read
`docs/RENDERER.md` first.

- [x] Test `Gaia fades like the old crossfade`: at 5, 8, 16.5, 25 and 30 kpc, the band fade equals the old
  `starCrossfadeOpacity` values. Compute those from the deleted function's formula and paste them in as literals.
- [x] Test `the Gaia row releases beyond 2.5 Mpc and loads within 250 kpc`, through `evaluateAssetDemand` with the
  real visibility entry. This is the band check, not a restated declaration.
- [x] Keep or adapt any pass test that pins `enabled` going false at 25 kpc.
- [x] `npm run typecheck:fast` and `npm test -- starCatalog` pass. Commit.

### Task 7: Measure

**Files:** none (results go in the PR body and the ledger)

- [x] Use `npm run perf -- --url http://localhost:<this worktree's port>` at the perf poses on `d500ceaba` (before)
  and on HEAD (after). Record frame-time deltas and the MEMORY block (GPU ledger) at the Earth boot pose.
- [x] Use `npm run perf:cpu` at the same poses, which prices the per-frame `resolveAssetDemand` cost (a PR A
  ruling). If main-thread time per frame rises by more than 0.1 ms, stop and report rather than add a cache.
- [x] Shoot the Earth boot view and a 1 Mpc view with `npm run shot`, before and after, as dash checks.

## Definition of Done

- **Deliverables:**
  - `SizeGate`, `NearGate` with `edge: 'both'`, the band-items rule and `EngineState.drawPxPerRad`.
  - No `fn` demand anywhere.
  - Deleted: `DemandFn`, `bodyTextureLoadRadius`, `pastTextureReleaseRadius`, `meshBodyLoadRadius`, `crossfadePc`
    and `starCrossfadeOpacity`.
  - The "Scale-gated asset demand" backlog item is deleted.
- **Observable** (Debug Panel GPU ledger and asset loading, at `localhost:<port>`):
  - At the Earth boot view, no `meshBody-*-soendermarken`, no `texturedBody-surface-venus` or `-moon`, no
    survey-catalog buffers, no MCPM volume textures, and no Local Bubble mesh.
  - Zooming to 1 Mpc loads the survey layers before their fade-in finishes.
  - Flying back to Earth releases them past two decades.
  - Zooming in on the Moon from the ground loads its surface once it spans 16 px.
  - Flying to Søndermarken loads its mesh before it reaches 3 px.
  - Gaia stars fade out from 8 to 25 kpc as before.
- **Deferred:**
  - `label3d-atlas` sharing (owner: leave it).
  - The `hiResFamous` pool gate (backlog).
  - Black-hole marker and body glint bands (backlog).
  - Satellite search while switched off (backlog).
