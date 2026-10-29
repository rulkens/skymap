# Fold the hand-written foreground gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No pass, pick gate or present helper compares `ctx.cam.distance` to `FOREGROUND_MAX_DISTANCE_MPC`. Every near-field thing yields through something it declares, measured from its own region.

**Architecture:** Body slab rows get an `activeBand`, so past the cutoff no `body-m` slab exists and the body passes are never asked. Scene-body admission measures entry bands at the frame camera, so the star catalog can declare item-scoped region bands. The glint gates and the Sgr A* marker yield through fades they own.

**Tech Stack:** TypeScript, Vitest, raw WebGPU frame program.

**Spec:** `docs/superpowers/specs/2026-10-29-fold-hand-distance-gates-design.md`

## Global Constraints

- No new member on `Layer`, `SlabRow`, `VisibilityEntry`, `EntryBand` or any pass type. If a task seems to need one, STOP and report.
- The cutoff itself does not move. Edges are `FOREGROUND_RECEDE.out` = `[FOREGROUND_MAX_DISTANCE_MPC / 2, FOREGROUND_MAX_DISTANCE_MPC]` (`src/data/bands/foregroundRecede.ts`).
- "Far" is measured from the thing's own region (ruling). Slab rows measure `|frame camera − anchor|`; entry bands set `from: BodyRegionId`.
- Frame-file purity: files in `src/services/engine/frame/` export only their own symbol.
- One symbol per file in `utils/` and `@types/`; comments within budget (`docs/superpowers/conventions/comments.md`).
- Briefs say `npx prettier --write <files>`, never `npm run format`.

## Review Focus

1. **Inside the cutoff nothing changes.** Planets, Earth tiles, atmospheres, glints, seeded stars and the Sgr A* marker draw exactly as on main at home, Saturn, the galactic centre and a nearby star. Covered by the eye-check pairs in the DoD.
2. **Focus far away, eye near home.** Focused on M31 and zoomed in, the eye is near M31, so body slabs are gone. This is the intended change; no test, eye check only.
3. **Atmosphere sky-view bake and shell agree.** Both read `atmosphereDrawList`, so moving its roster must not split them. Task 1's test pins the list to the active rows.
4. **The S-stars measure from the galactic centre, the neighbourhood stars from the Sun's neighbourhood.** A wrong `from` would cut the S-stars when the eye is at the galactic centre, 8 kpc from home. Task 2 pins both.
5. **The `starCatalog` survey item is not banded.** The Gaia survey stars must still draw from far out. Task 2 pins it.

**Perf (priced at plan time):** past the cutoff fewer rows are derived (no body slabs). Admission adds one `bandValueOf` per covering item (3 seeded catalogs) per frame. Per-frame CPU change at the worst pose is ≈ 0. No perf gate.

---

### Task 1: Body slab rows yield at the foreground band

**review: yes** (slab rows feed NEAR0 depth, a landmine area)

**Files:**
- Create: `src/data/bands/foregroundRecedeFadeBand.ts`
- Modify: `src/layers/body/present/bodyLayerSlabRow.ts`, `src/utils/scene/bodySlabRowOf.ts`
- Modify (delete the hand gate and its import): `src/layers/body/passes/planetsPass.ts` (both `enabled` and `pickEnabled`), `texturedBodiesPass.ts`, `cloudShellPass.ts`, `earthPass.ts`, `ringsPass.ts`, `surfaceTilesPass.ts`; `src/layers/body/subsystems/surfaceTiles/tileBodiesInView.ts`
- Modify: `src/layers/body/present/atmosphereDrawList.ts`
- Modify: `src/data/rendering/foregroundMaxDistance.ts` (doc), `src/data/bands/foregroundRecede.ts` (doc pointer only if needed)
- Test: `tests/layers/body/present/bodySlabRows.test.ts`, `tests/layers/body/present/atmosphereDrawList.test.ts`, plus any pass test that asserted the hand gate

**Interfaces:**
- Produces: `FOREGROUND_RECEDE_FADE_BAND: FadeBand` = `{ fullAt: FOREGROUND_RECEDE.out[0], goneAt: FOREGROUND_RECEDE.out[1] }`. It is derived by import, never by retyping numbers. It is the `SlabRow.activeBand` shape of the same band.
- `bodyLayerSlabRow(body)` and `bodySlabRowOf(body)` both return rows with `activeBand: FOREGROUND_RECEDE_FADE_BAND`.
- `atmosphereDrawList(state, ctx)` takes its candidates from `ctx.snapshot.slabBodyCandidates`, keeping only anchors among `[SCENE_EARTH, ...SCENE_PLANETS]` (the bodies with `ATMOSPHERE_PARAMS`). The `cam.distance` short-circuit goes.

- [x] Add test `every body slab row is active at 1 AU and inactive at the foreground cutoff` in `bodySlabRows.test.ts`. It runs `slabRowActive(row, camPos, states)` over `BODY_SLAB_ROWS` and `bodySlabRowOf(<a hostless mesh body>)`, with the eye at 1 AU from the row's anchor (true) and at `FOREGROUND_MAX_DISTANCE_MPC` from it (false).
- [x] Add test `atmosphereDrawList lists no body whose slab row is inactive` in `atmosphereDrawList.test.ts`: a snapshot whose `slabBodyCandidates` omits Earth yields no Earth entry, even with the eye close to Earth. Rewrite or delete the existing case that asserts emptiness from `cam.distance`, whichever the file has.
- [x] Run both: they fail.
- [x] Implement the constant, the two `activeBand`s and the `atmosphereDrawList` roster change; delete the 8 hand gates. Rewrite the `foregroundMaxDistance.ts` doc paragraph that names "core's body passes AND it into `enabled` by hand" to say body rows yield via `activeBand`.
- [x] Run `npx vitest run tests/layers/body tests/services/engine/frame` and `npm run typecheck:fast`: green.
- [x] Commit.

### Task 2: Admission reads bands; the star catalog declares region bands

**review: yes** (core visibility rule, ADR 0012 territory)

**Files:**
- Modify: `src/services/engine/frame/frameContext.ts` (the `isAboveZero` admission at `:96-118`)
- Modify: `src/services/engine/presentation/bandValueOf.ts` (narrow the `view` param only if needed: it reads `drawCamPos` and `snapshot.bodyStates`)
- Modify: `src/layers/starCatalog/visibility.ts`, `src/layers/starCatalog/passes/starPointsPass.ts`, `src/layers/starCatalog/passes/starSpheresPass.ts`
- Modify: `src/services/engine/presentation/resolveViewFadeValue.ts` (doc: admission no longer keeps the band out)
- Test: `tests/compositions/appVisibility.test.ts` (delete `no entry declares both bodies and bands`), `tests/compositions/appBandValues.test.ts`, `tests/services/engine/frame/frameContext.test.ts` (or wherever admission is tested), `tests/layers/starCatalog/passes/starPointsPass.test.ts`

**Interfaces:**
- Admission: a covered body is admitted while every covering `(address, item)` has `resolveVisibilityOpacity(...) × viewBandOf(entries, address, item, frameEye) > 0`. Here `frameEye = { drawCamPos: cam.position, snapshot: { bodyStates } }`, the frame camera, which slab rows also use. Keep the per-key memo.
- `bandValueOf(entry, item, view: { drawCamPos: Readonly<Vec3>; snapshot: Pick<ReadyFrameContext, 'bodyStates'> })`, and the same narrowing on `viewBandOf`, so admission can pass the frame eye without casting.
- `starCatalog` entry gains:
  ```ts
  bands: {
    foreground: { ...FOREGROUND_RECEDE, from: 'solar-neighbourhood', items: ['famousStar', 'sun'] },
    sStarForeground: { ...FOREGROUND_RECEDE, from: 'galactic-centre', items: ['sStar'] },
  }
  ```
  Check the item ids against `SEEDED_STAR_CATALOGS` keys and `STAR_CATALOG_IDS`; the survey item stays unbanded.
- `starPointsPass` / `starSpheresPass`: their hand gate goes. Their inner `enabled` returns false when every seeded item they draw hands 0 in the record `gatePassByFade` passes in.

- [x] Add tests in `appBandValues.test.ts`, using `valueAt` with `from` resolved against real `bodyStates` (extend the helper to pass them):
  - `seeded neighbourhood stars are full at 1 kpc from home and gone at the cutoff` (items `famousStar`, `sun`).
  - `S-stars are full at the galactic centre and gone at the cutoff from it`: eye 1 pc from the galactic centre anchor gives 1 (this is the Review Focus 4 trap); eye `FOREGROUND_MAX_DISTANCE_MPC` from it gives 0.
  - `the survey star item has no foreground band`: 1 at `10 * FOREGROUND_MAX_DISTANCE_MPC`.
- [x] Add an admission test `a star body is not admitted past its region's band`: with every fade at 1, a frame camera at the cutoff from the solar neighbourhood admits no `famousStar` body, and one at 1 AU admits them.
- [x] Delete the `no entry declares both bodies and bands` test.
- [x] Run: new tests fail.
- [x] Implement admission, the param narrowing, the bands, and the two pass changes; remove the stale "No `foreground` band here" comment in `starCatalog/visibility.ts` and the hand-gate sentence in `foregroundMaxDistance.ts`.
- [x] Update `starPointsPass.test.ts`'s wholesale-skip test so its state resolves the real entries (as #958 did for orbit-trails); its assertion stays: the group is empty above the cutoff and non-empty below.
- [x] Run `npx vitest run tests/compositions tests/services/engine tests/layers/starCatalog` and `npm run typecheck:fast`: green.
- [x] Commit.

### Task 3: Glints and the Sgr A* marker yield through their own fades

**Files:**
- Modify: `src/layers/body/passes/bodyGlintsPass.ts` (`enabled` `:55`, `pickEnabled` `:66`), `src/services/engine/frame/glintsPassOver.ts` (`enabled`; the missions and earthScenes Layers' glints)
- Modify: `src/layers/blackHoles/present/blackHoleMarkerBrightness.ts`, `src/layers/blackHoles/passes/blackHoleMarkerPass.ts`, `src/layers/blackHoles/present/blackHolePickable.ts`
- Test: `tests/layers/blackHoles/present/blackHoleMarkerBrightness.test.ts`, `tests/layers/body/passes/bodyGlintsPass.test.ts` (only if it asserts the deleted gate)

**Interfaces:**
- `bodyGlintsPass.enabled` and `glintsPassOver`'s `enabled`: delete the hand gate. `bodyGlintBackdropFade` already returns 0 far inside the cutoff. Confirm with `backdropBand(SOLAR_SYSTEM_EXTENT_MPC).goneAt < FOREGROUND_MAX_DISTANCE_MPC` and state the numbers in the commit. No new test: the existing backdrop test covers it.
- `bodyGlintsPass.pickEnabled`: replace the hand gate with `bodyGlintBackdropFade(ctx.drawCamPos, sceneBodyStates(state, ctx)) <= 0 && !earthCaptionPickable(ctx) → false`. The Earth caption pick keeps its own `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` rule (out of scope).
- `blackHoleMarkerBrightness(row, camPos, states)` multiplies by `fadeBand(FOREGROUND_RECEDE_FADE_BAND, |camPos − anchor|)`. `blackHoleMarkerPass.enabled` and `blackHolePickable` drop their hand gates; they already test brightness > `GLINT_MIN_BRIGHTNESS`.

- [x] Add test `marker brightness is 0 at the foreground cutoff from its anchor and unchanged at 1 kpc`.
- [x] Run: it fails.
- [x] Implement; delete the five hand gates.
- [x] Run `npx vitest run tests/layers/blackHoles tests/layers/body` and `npm run typecheck:fast`: green.
- [x] Commit.

### Task 4: Ratchet: no hand-written foreground gate returns

**Files:**
- Test: `tests/data/rendering/foregroundMaxDistance.test.ts` (extend)

- [x] Add test `only bands and slab rows import FOREGROUND_MAX_DISTANCE_MPC`. It globs `src/**/*.ts` and asserts the importers are exactly `src/data/bands/foregroundRecede.ts`, `src/data/bands/surveyDeepZoom.ts` and `src/layers/structure/visibility.ts` (today's 17 importers minus the 14 sites Tasks 1–3 remove). A pass or present helper importing it fails.
- [x] Run it: green after Tasks 1–3. Mutation-check it by re-adding one import to `planetsPass.ts`; it fails.
- [x] Commit.

## Definition of Done

- **Deliverables:** `FOREGROUND_RECEDE_FADE_BAND`. Body and hostless mesh slab rows carry `activeBand`. Admission multiplies by the frame-camera band. The `starCatalog` entry has `foreground` and `sStarForeground` bands. The ratchet test exists. Zero `cam.distance` comparisons against `FOREGROUND_MAX_DISTANCE_MPC` remain (19 sites today, `glintsPassOver` included).
- **Eye checks (before main / after branch pairs, deep links to the wt server):** home (`#focus=body-earth`), Saturn (`#focus=body-saturn`), galactic centre with S-stars on, a famous star (e.g. Sirius), M31 focus zoomed in (body and star content off where it was enabled-but-empty before).
- **Deferred:** `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, `STAR_BACKDROP_DISSOLVE`, the horizon shell's own ramp, the satellites Layer's Earth-distance fade.
