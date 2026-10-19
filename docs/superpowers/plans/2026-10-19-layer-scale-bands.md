# Layer-declared distance bands: implementation plan

**Goal:** each Layer declares where its content is visible as named in/out distance windows on its `visibility` entries (`bands`); core measures the camera distance per view, multiplies the band into the value it hands every per-view consumer, and skips at 0. No Layer measures a camera distance for a visibility band or culls on one by hand.

**Architecture:** `visibility.ts` entry `bands` → `bandValueOf(entry, item, view)` in core → `resolveViewFadeValue(state, view, address)` = fade × clip × band (× the `of` entry's band, for a label with `of`) → the per-view gates (`gatePassByFade`, the perView branches of `gatePlannerByFade` / `gateComputeByFade`, `gateLabelProducer`, `gateWorldLabelProducer`). Once-scope planners and computes and scene-body admission keep `resolveFadeValue` (no band: one plan serves several views). Label producers also skip when every item's band is 0.

**Spec:** `docs/superpowers/specs/2026-10-19-layer-scale-bands-design.md`. Rationale and rulings: `docs/grill-sessions/layer-scale-bands-2026-10-18.md` (B1, S1, B3, R1, C1, O1, K1, D1, E1, V1); running log `.superpowers/grill/2026-10-18-layer-scale-bands-rulings.md`.

**Branch:** `docs/scale-fade-bands-refresh` (draft PR #920), worktree `.claude/worktrees/scale-bands-backlog`. Prep (Group P) is its own commits, sequenced first; separate PR vs riding #920 is the checkpoint answer recorded in the ledger.

## Global Constraints

- **Layer contract:** the only new member is `VisibilityEntryCommon.bands` with the `EntryBand` type (consented, B2/B3). Any other contract change: STOP and report.
- **Units:** every edge is Mpc. Write kpc edges as `n * SCALE_UNITS.KPC_TO_MPC`.
- **Curve:** a band term is `smoothstep(in[0], in[1], d)` or `1 - smoothstep(out[0], out[1], d)` with `src/utils/math/smoothstep.ts`, the same curve `fadeBand` uses, so moved rows are value-identical.
- **Distance:** `|view.drawCamPos|` when `from` is omitted; `regionRelativeDistanceMpc(view.drawCamPos, regionById(from), sceneBodyStates(state, view))` otherwise (`src/utils/regions/regionRelativeDistanceMpc.ts:17`, `regionById.ts:16`, `sceneBodyStates.ts:35`). The region id type is `BodyRegionId` (`src/@types/data/BodyRegionId.d.ts:8`).
- **Moves** use `npm run move-files -- <from> <to>` (`--dry` first), never `git mv` plus hand-edited imports; grep the old path afterwards.
- **One symbol per file** in `src/utils/`, `src/@types/`, `src/data/`; frame and pass files export only their one symbol (`tests/services/engine/frame/frameFilePurity.test.ts` only shrinks).
- **Comments:** why, not what; module header ≤ 10 lines; comment lines ≤ half the code lines (`docs/superpowers/conventions/comments.md`). A comment that described a deleted band row is reworded or deleted.
- **Format** with `npx prettier --write <paths>`, never `npm run format`.
- **Commits:** stage by path, never `git add -A`; no `Co-Authored-By` or any attribution trailer; one commit per task unless the task says otherwise.
- **Per-frame cost (priced at plan time):** per view, about ten banded entries × at most two bands, plus about 40 structure items × one band, plus at most two region distances: under 100 `smoothstep`s, memoised per `FrameView` and address. It replaces the same evaluations the consumers do today (ZoA's window alone is evaluated by three sites). Expected neutral; `npm run perf:cpu` before/after in Task 8 is the only perf gate.

## Review Focus

1. A per-view consumer must see the band and a once-scope consumer must not. A planner or compute that silently loses its band (or gains one) is the bug class.
2. `gateLabelProducer` and `gateWorldLabelProducer`: band 0 skips; clip 0 does not (the #912 pin `off with raw fade > 0 and clip 0 → still called` stays green).
3. Value identity: every moved row produces the same number at the same distance (approach rows become `in: [goneAt, fullAt]`, recede rows `out: [fullAt, goneAt]`). The one intended change is the Milky Way disk's min → product.
4. `starBackdrop` stays out of `visibility` (on the entry it would drop seeded stars from scene-body admission, `frameContext.ts:121-133`).

## Dispatch groups

| Group | Tasks | Notes |
| --- | --- | --- |
| P: prep | 1, 2 | pure moves, behaviour-neutral; one Sonnet dispatch |
| A: core | 3 | `review: yes`; Opus |
| B: Layers | 4, 5, 6, 7 | one Sonnet dispatch per two tasks, after A |
| C: verify | 8 | controller: shots, perf, ledger |

## Group P: ground preparation

### Task 1: Anchor constants to `src/data/`

**Files:** move `src/services/engine/frame/foregroundMaxDistance.ts` → `src/data/rendering/foregroundMaxDistance.ts`; move `src/services/engine/frame/solarSystemLabelMaxDistance.ts` → `src/data/labels/solarSystemLabelMaxDistance.ts`; extract `MILKY_WAY_RADIUS_MPC` (and the `MILKY_WAY_DISC_RADIUS_KPC` it derives from, `src/services/engine/galaxyGenerator/v1/milkyWayCalibration.ts:28`) to `src/data/milkyWay/milkyWayRadiusMpc.ts` (one constant per file: the disc radius gets its own `src/data/milkyWay/milkyWayDiscRadiusKpc.ts` if anything else reads it); update `tests/services/engine/frame/frameFilePurity.test.ts` (its `'frame/foregroundMaxDistance': 1` entry at `:45` goes, the file has left `frame/`); every importer (16 src + 21 test files for the first, 3 + 5 for the second, 3 + 7 for the third, per the touchpoint map).

- [ ] `npm run move-files -- --dry …` then the real moves; the v1 calibration file imports the radius from its new home.
- [ ] `git grep` for each old path prints nothing; `src/data/` imports nothing from `src/services/` for these three.
- [ ] No new test: pure moves.

### Task 2: `scaleFadeBands.ts` to `src/data/`

**Files:** move `src/services/engine/presentation/scaleFadeBands.ts` → `src/data/scaleFadeBands.ts` (13 src + 18 test importers); `tests/services/engine/presentation/scaleFadeBands.test.ts` follows via `move-files`.

- [ ] Move; the table's imports now all come from `src/data/` (after Task 1) and `src/utils/regions/regionById.ts`.
- [ ] No new test: a pure move.

## Group A: core

### Task 3: `EntryBand`, `bands`, the band resolver and the gates

**review: yes**: a frame-path contract (Review Focus #1, #2).

**Files:** create `src/@types/engine/layer/EntryBand.d.ts`, `src/services/engine/presentation/bandValueOf.ts`, `src/services/engine/presentation/resolveViewFadeValue.ts`; modify `src/@types/engine/layer/VisibilityEntryCommon.d.ts`, `src/services/engine/layer/gatePassByFade.ts`, `src/services/engine/layer/gatePlannerByFade.ts` (perView branch only, `:27-31`), `src/services/engine/layer/gateComputeByFade.ts` (perView only), `src/services/engine/layer/gateLabelProducer.ts`, `src/services/engine/layer/gateWorldLabelProducer.ts`; tests create `tests/services/engine/presentation/bandValueOf.test.ts`, `tests/services/engine/presentation/resolveViewFadeValue.test.ts`; modify `tests/services/engine/layer/gateLabelProducer.test.ts`, `tests/services/engine/layer/gatePassByFade.test.ts`, `tests/compositions/appVisibility.test.ts`.

**Contract:**

```ts
// src/@types/engine/layer/EntryBand.d.ts
export type EntryBand = {
  readonly in?: readonly [number, number];
  readonly out?: readonly [number, number];
  readonly from?: BodyRegionId;
  readonly items?: readonly string[];
};

// VisibilityEntryCommon
readonly bands?: Readonly<Record<string, EntryBand>>;

// src/services/engine/presentation/bandValueOf.ts
export function bandValueOf(
  entry: VisibilityEntry,
  item: string | undefined,
  view: Pick<FrameView, 'drawCamPos' | 'snapshot'>,
): number;

// src/services/engine/presentation/resolveViewFadeValue.ts
export function resolveViewFadeValue<A extends VisibilityAddress>(
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
  view: FrameView,
  address: A,
): FadeValueOf<A>;
```

- `bandValueOf`: product over `entry.bands` whose `items` contain `item` or are omitted; an entry without `bands` gives 1. For a label entry with `of`, `resolveViewFadeValue` also multiplies `bandValueOf(ofEntry, item, view)`, mirroring the clip at `resolveVisibilityOpacity.ts:23-24`.
- `resolveViewFadeValue` = `resolveFadeValue(state, view.snapshot, address)` × band, per item for a per-item address; memoised per `FrameView` (a `WeakMap<FrameView, Map<address, value>>`, like `cosmoLabelProjection.ts`).
- The per-view gates call `resolveViewFadeValue`; the once-scope branches of `gatePlannerByFade` (`:20-25`) and `gateComputeByFade`, and `frameContext.ts:127`, keep `resolveFadeValue`.
- Label gates: skip when `!labelLiveOf(...)` (unchanged) or when every item's `bandValueOf` (with `of`) is 0.

**Tests (the acceptance criteria):**

- `bandValueOf`: `in window is 0 at in[0], 1 at in[1], and smoothstep between`; `out window is 1 at out[0] and 0 at out[1]`; `in and out together multiply`; `a band with items does not touch other items`; `from galactic-centre measures from the region anchor` (camera at the anchor + 0.0006 Mpc → 0 for `in: [0.0006, 0.012]`); `an entry without bands gives 1`.
- `resolveViewFadeValue`: `per-view value is fade × clip × band`; `a label with of multiplies its show entry's band for the same item`; `memoised per view` (a second call with the same view does not re-read the registry).
- `gatePassByFade`: `a pass whose band is 0 for every item is skipped and not picked`.
- `gateLabelProducer`: `band 0 for every item skips a live producer`; keep `off with raw fade > 0 and clip 0 → still called`.
- `gatePlannerByFade`: `a once-scope planner gets no band` (the value equals `resolveFadeValue`'s at a distance where the band is 0).
- `appVisibility.test.ts`: `every band's in and out are ascending and in[1] ≤ out[0]`; `a band's items are a subset of its entry's items`; `no entry declares both bodies and bands`.

## Group B: Layers

Each task: add the entry's `bands` (values from the spec table, which copies `scaleFadeBands.ts`), delete the consumer's measure/apply/cull lines, and update or delete the tests that pinned the old band. A test that only re-pinned a moved constant is deleted; a test that pinned behaviour (fade at a distance, cull at 0) moves to the band resolver's level or stays on the consumer against the handed value.

### Task 4: Shared bands, Local Bubble, constellations, ZoA, density

**Files:** create `src/data/bands/surveyDeepZoom.ts` (`SURVEY_DEEP_ZOOM = { in: [0.002, FOREGROUND_MAX_DISTANCE_MPC] } as const`), `src/data/bands/neighbourhoodRecedeKpc.ts` (`NEIGHBOURHOOD_RECEDE_KPC = 10`); modify `src/layers/localBubble/visibility.ts`, `src/layers/localBubble/present/localBubbleOpacity.ts` (drops the window; keeps fade × `clampLocalBubbleIntensity`; inline it into `localBubblePass.ts` and delete the file if it becomes a one-liner), `src/layers/localBubble/passes/localBubblePass.ts:23-33`; `src/layers/constellations/visibility.ts`, `src/layers/constellations/passes/constellationsPass.ts:27,37`, `src/layers/constellations/present/produceConstellationCaptions.ts:63`, delete `src/layers/constellations/present/constellationsBand.ts`; `src/layers/zoneOfAvoidance/visibility.ts`, `src/layers/zoneOfAvoidance/present/deriveZoneOfAvoidanceLiveness.ts:21-24` (and its callers `zoneOfAvoidancePass.ts:20,26,47`, `zoneOfAvoidanceUpsamplePass.ts:20`, `produceZoneOfAvoidanceLettering.ts:34`); `src/layers/cosmicWebDensity/visibility.ts`, `src/@types/settings/VolumeFieldSettings.d.ts:64-71` (delete `bands`), `src/layers/cosmicWebDensity/state/defaults.ts:21`, `src/utils/clampVolumeFieldSettings.ts:13`, `src/utils/volume/deriveVolumeLiveness.ts:25-29`, `src/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness.ts:30`; tests `tests/layers/localBubble/**`, `tests/layers/constellations/**`, `tests/layers/zoneOfAvoidance/**`, `tests/utils/volume/deriveVolumeLiveness.test.ts`, `tests/utils/clampVolumeFieldSettings.test.ts`, `tests/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness.test.ts`, `tests/services/engine/frame/passes/createScalarVolumePass.test.ts`, `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`.

Bands: `localBubble.shell { in: [0.4, 1] kpc, out: [4 kpc, NEIGHBOURHOOD_RECEDE_KPC] }`; `constellations.neighbourhood { out: [1 kpc, NEIGHBOURHOOD_RECEDE_KPC] }`; `zoneOfAvoidance.veil { in: [2 R, 10 R], out: [2, 6] }` (R = `MILKY_WAY_RADIUS_MPC`); `cosmicWebDensity.deepZoom: SURVEY_DEEP_ZOOM`. The two label entries inherit via `of`.

- [ ] Saved snapshots: `mergeSettingsSnapshot.ts:35-43` keeps unknown fields, but snapshots live only in memory (`captureScene.ts:39`) and nothing persists settings (`persistedValues.ts:9`), so no restore path can carry a stale `bands`. No migration; say so in the commit body.

### Task 5: Milky Way disk and label, survey

**Files:** `src/layers/milkyWay/visibility.ts`, `src/layers/milkyWay/present/milkyWayCloudLiveness.ts:34-44` (drops the two bands and the min; keeps `milkyWayFadeAlpha` and emphasis; callers `milkyWayPass.ts:53,58,64`, `milkyWayAggregatePass.ts:27,31`, `milkyWayUpsamplePass.ts:22`), `src/layers/milkyWay/present/produceMilkyWayLabel.ts:28-56` (delete `MILKY_WAY_LABEL_FADE_BAND` and the band early return; the near-plane blowup comment at `:44-51` moves to the `youAreHere` band in `visibility.ts`, since the band's 0 is now what keeps the producer from being called); `src/layers/galaxyCatalog/visibility.ts`, `src/layers/galaxyCatalog/passes/galaxyPointSpritesPass.ts:33-38,72,79-86`; tests `tests/layers/milkyWay/**`, `tests/state/tour/tour.integration.test.ts` (if it pins the min), `tests/layers/galaxyCatalog/passes/galaxyPointSpritesPass.test.ts`, `tests/data/bodies/bodyRegions.test.ts` and the `foregroundMaxDistance` test (each pins `MILKY_WAY_LABEL_FADE_BAND`'s 0.6 edge; reread it from the `youAreHere` band).

Bands: `milkyWayDisk.approachSun { in: [0.0002, 0.002] }`, `milkyWayDisk.approachCentre { from: 'galactic-centre', in: [0.0006, 0.012] }`; `label:milkyWay.youAreHere { in: SURVEY_DEEP_ZOOM.in, out: [0.6, 2] }`; `survey.deepZoom { ...SURVEY_DEEP_ZOOM, items: SURVEY_IDS }` with `SURVEY_IDS = GALAXY_CATALOG_IDS.filter((id) => id !== 'famousGalaxy')`.

- [ ] Test `the disk's two approach bands multiply` (at 1 kpc from the Sun the disk value is the product, not the min): the one intended behaviour change (C1).
- [ ] The once-scope `galaxyCatalogPlanner` (`frame.ts:44`) gets no band (Review Focus #1); its output is unchanged.

### Task 6: Structures

**review: yes**: the marker passes change how they skip, and the pick indices must stay aligned (`produceStructureMarkers.ts:74-77`).

**Files:** `src/layers/structure/visibility.ts`; `src/layers/structure/render/createStructureMarkersPass.ts:15-53` (declare `fade: 'structureRing'`; `enabled`/`pickEnabled` read the handed per-item value for the pass's own scale's items); `src/layers/structure/present/produceStructureMarkers.ts:66,83,111,123`; `src/layers/structure/present/produceStructureLabels.ts:50-52,82,114`; delete `StructureMarkerStyle.visibleBand` (`src/layers/structure/@types/StructureMarkerStyle.d.ts:39`, values `structureMarkerStyles.ts:35,58,76,92,126`), `src/layers/structure/present/structureVisibleBands.ts`, and `src/utils/math/anyFadeBandVisible.ts` if nothing else reads it; tests `tests/layers/structure/**`.

Bands: `structureRing.cosmic { ...SURVEY_DEEP_ZOOM, items: STRUCTURE_IDS_BY_SCALE.cosmic }`, `structureRing.milkyWayPlaces { out: [2 R, FOREGROUND_MAX_DISTANCE_MPC], items: STRUCTURE_IDS_BY_SCALE.milkyWay }`; `label:structure` inherits via `of`.

- [ ] Descriptors at value 0 are still emitted where pick-index alignment needs them (`produceStructureMarkers.ts:74-77`).

### Task 7: `starBackdrop` to the star Layer; core's table keeps core's rows; backlog

**Files:** create `src/layers/starCatalog/data/starBackdropDissolve.ts` (the `backdropBand(NEIGHBOURHOOD_EXTENT_MPC)` value, `scaleFadeBands.ts:45,85`, as a `FadeBand`); modify `src/layers/starCatalog/passes/starPointsPass.ts:131-136,156-159`; delete the ten Layer rows from `src/data/scaleFadeBands.ts` (after Task 2) and their now-unused locals (`CONSTELLATIONS_*_KPC`, …); update `tests/services/engine/presentation/scaleFadeBands.test.ts` (moved with Task 2) and `tests/layers/starCatalog/passes/starPointsPass.test.ts`; delete `docs/backlog/2026-09-19-layer-owned-scale-fade-bands.md`, `docs/backlog/2026-08-31-scale-fade-bands-to-data.md` and their `docs/BACKLOG.md` lines; create `docs/backlog/2026-10-19-per-subject-fades.md` (kinds 2 and 3, with L1 as its first prep and the greenfield note that per-subject kinds hand the consumer the band's edges) and `docs/backlog/2026-10-19-band-debug-panel.md`, each with a `needs-design` index line.

- [ ] `git grep -n 'SCALE_FADE_BANDS\.\(surveyDeepZoom\|milkyWayApproach\|starBackdrop\|constellations\|milkyWayStructures\|zoneOfAvoidance\|localBubble\)' -- src tests` prints nothing.
- [ ] `backdropBand`'s shared shape stays one home: `bodyGlintBackdrop` (core's row) and `starBackdropDissolve` both read one helper (move `backdropBand` to `src/utils/math/backdropBand.ts` if two files need it).

## Group C: verify

### Task 8: Before/after, perf, smoke

- [ ] Before/after pairs (main server vs branch server, deep links): the Milky Way disk at about 1 kpc and 0.5 kpc from the Sun (behaviour change #1); and value-identical checks at each moved band's mid-ramp: Local Bubble at 0.7 kpc and 7 kpc, constellations at 5 kpc, ZoA at 0.1 Mpc and 4 Mpc, survey and density at 0.005 Mpc, Milky Way places at 0.1 Mpc, the "You are here" label at 1.2 Mpc.
- [ ] `npm run perf:cpu`, two interleaved main/branch runs each (the load on this machine makes single runs noisy).

## Definition of Done

- [ ] `EntryBand` exists and `VisibilityEntryCommon.bands` is the only Layer contract change.
- [ ] Eleven entries declare their bands as in the spec table; `SURVEY_DEEP_ZOOM` and `NEIGHBOURHOOD_RECEDE_KPC` live in `src/data/bands/`.
- [ ] No Layer file imports `SCALE_FADE_BANDS`; `src/data/scaleFadeBands.ts` holds only core's seven rows.
- [ ] `constellationsBand.ts`, `structureVisibleBands.ts`, `StructureMarkerStyle.visibleBand`, `VolumeFieldSettings.bands`, `MILKY_WAY_LABEL_FADE_BAND` and the survey fade's famous ternary are gone.
- [ ] `FOREGROUND_MAX_DISTANCE_MPC`, `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` and `MILKY_WAY_RADIUS_MPC` live in `src/data/`; `src/data/` imports nothing from `src/services/` for them.
- [ ] Once-scope planners and computes get no band; per-view consumers do (tests in Task 3).
- [ ] The two old backlog items are gone; "per-subject fades" and "band debug panel" exist.
- [ ] Deferral boundary respected: kinds 2 and 3, L1, core's caption/glint/cubemap rows untouched.

## Manual smoke

- [ ] The Milky Way disk descending toward the Sun from 3 kpc: the hand-off to the Gaia stars reads as smooth as on main, or is retuned (behaviour change #1).
- [ ] Flying out from Earth to 20 kpc: the Local Bubble shell fades in, then out with the constellation figures and names at 10 kpc.
- [ ] Flying out to 8 Mpc: the ZoA veil and lettering fade in and out together; the "You are here" label fades by 2 Mpc.
- [ ] Diving to the Sun from 1 Mpc: survey points, cosmic structure rings and labels and the density field fade out together; the famous galaxies stay; Milky Way places fade in.
- [ ] Clicking a survey galaxy and a structure ring mid-ramp still selects it; at band 0 neither is clickable.
