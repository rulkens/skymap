# S-star prep 02 — `BodyRegion` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make near-field scale gating anchor-relative, so content that is not near the Sun can be gated on how close the camera is to _it_.

**Architecture:** P3 from [the spec](../../specs/completed/2026-07-30-s-star-orbits-design.md). `scaleFadeBands.ts:18` records that several band rows key on the camera's distance from the heliocentric render origin (the header at `:13-21` says "three," the table today actually has six — see Task 3). That value is ~8178 pc anywhere at the Galactic Center, and identical 8 kpc the other way, so it cannot express "appears when you are near it". A `BodyRegion` carries an anchor and a derived extent; bands become a shape applied per region and keyed on `|camPos − anchorPos|`.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- **Depends on Plan 01.** Anchors must already exist in the state map (Plan 01 Task 4).
- **Zero behaviour change.** Every existing band edge must land on the same number it does today. This plan re-derives _how_ an edge is computed, never _what_ it evaluates to. Regression fixtures come first.
- **Three regions, not two.** `solar-system` and `solar-neighbourhood` share the Sun as anchor but differ by seven orders of magnitude in extent. Region is a _scale regime_; anchor is a _position_. Do not collapse them.
- **Extents are derived, never authored** — `max |member − anchor|` over the region's members, matching the discipline `foregroundMaxDistance.ts:85-99` already uses.
- **Region membership is total and disjoint** over `SCENE_BODIES` (Task 2). The palette chip the feature plan builds has no fallback literal to fall back to.
- **The two camera-distance gates stay global scalars** (Task 6). They are compared against `ctx.cam.distance`, which is camera-to-_target_, so a threshold is a scale and not a position — no per-region predicate, no layer retrofit. Only their derivations move.
- **`type` aliases, never `interface`.** One type per file in `src/@types/`.
- **Gate at `enabled()`, not at draw.** Opacity 0 must drop the pass; pick follows visibility. See `docs/superpowers/conventions/` and the `orbitTrailsLayer.ts:130-160` precedent.
- Read [docs/RENDERER.md](../../../RENDERER.md) first.

---

### Task 1: Capture today's band edges as a regression fixture

**Files:**

- Create: `tests/services/engine/presentation/scaleFadeBands.baseline.test.ts`
- Modify: `src/services/engine/presentation/scaleFadeBands.ts` — temporary `export` on `FARTHEST_STAR_PC` (today module-private, `scaleFadeBands.ts:38`)
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts` — temporary `export` on `MAX_ORBIT_EXTENT_MPC` (today module-private, `orbitTrailsLayer.ts:122`)

Before anything moves, pin every current edge. This fixture is the contract for the whole plan: `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, `FOREGROUND_MAX_DISTANCE_MPC`, `starBackdrop.fullAt` / `.goneAt`, `bodyGlintBackdrop.fullAt` / `.goneAt`, `MAX_ORBIT_EXTENT_MPC`, and `FARTHEST_STAR_PC` — **eight** scalar values, not seven (the two `.fullAt/.goneAt` pairs are two numbers each). The last two are today module-private, so the baseline cannot import them as written — add a temporary `export` to each; Task 7 reverts both alongside deleting the test.

This is deliberately a constant-restatement test, which the testing convention normally forbids — it is justified here **only** as a temporary refactor harness, and Task 7 deletes it. Say so in the file header so a later reader does not cite it as precedent.

- [x] Add the two temporary exports (`FARTHEST_STAR_PC`, `MAX_ORBIT_EXTENT_MPC`).
- [x] Write the fixture asserting all eight current values.
- [x] `npm test -- scaleFadeBands.baseline` → passes.
- [x] Commit.

---

### Task 2: `BodyRegion` types and the region table

**Files:**

- Create: `src/@types/data/BodyRegionId.d.ts`
- Create: `src/@types/scene/BodyRegion.d.ts`
- Create: `src/data/bodies/bodyRegions.ts`
- Create: `src/utils/scene/regionOfBody.ts`
- Test: `tests/data/bodies/bodyRegions.test.ts`, `tests/utils/scene/regionOfBody.test.ts`

**Interfaces — Produces:**

```ts
export type BodyRegionId = 'solar-system' | 'solar-neighbourhood' | 'galactic-centre';

export type BodyRegion = {
  readonly id: BodyRegionId;
  readonly label: string; // human-readable, e.g. command-palette category chip
  readonly anchorId: string;
  readonly memberIds: readonly string[]; // TOTAL over scene bodies; extentMpc's own input, kept not discarded
  readonly extentMpc: number; // DERIVED: max |member − anchor|, never authored; 0 when empty
};

export const BODY_REGIONS: readonly BodyRegion[];

// src/utils/scene/regionOfBody.ts — the body → region lookup the palette chip reads.
export function regionOfBody(bodyId: string): BodyRegion | null;
```

| region                | label                 | anchor       | members                                | extent today         |
| --------------------- | --------------------- | ------------ | -------------------------------------- | -------------------- |
| `solar-system`        | `Solar System`        | `sun`        | the Sun, Earth, the planets, the moons | ~30 AU, Neptune      |
| `solar-neighbourhood` | `Solar Neighbourhood` | `sun`        | the other 118 famous-star anchors      | 2300 pc, Eta Carinae |
| `galactic-centre`     | `Galactic Centre`     | `sgr-a-star` | — (empty until the feature plan)       | 0                    |

**Membership is total, and an anchor is a member of its own region.** Every scene body belongs to exactly one region. That is what lets the feature plan's palette chip replace its `'Solar System'` literal with a lookup instead of adding a second fallback beside it; a body in no region yields a silently `undefined` chip. The two consequences worth stating, because both look like special cases and neither is:

- The **Sun** is a member of `solar-system`, not of the `solar-neighbourhood` it anchors — a region is a scale regime the body sits _in_, and the Sun sits in the solar system. Its chip must read "Solar System". Extents are unaffected either way: the Sun contributes 0 to `solar-system`, and `solar-neighbourhood` still measures `max |famous star − Sun|` = 2300 pc from its Sun anchor. So `solar-neighbourhood.memberIds` is the famous-star ids _minus_ `'sun'`.
- **Earth** is a member of `solar-system` too. It is an `ORBITAL_ELEMENTS` row, so "element rows in the Sun's focus subtree, plus the Sun itself" derives the whole set with no hand-listing.

The `galactic-centre` row exists here with no members. An empty region must yield extent 0 and gate its (absent) content off, not `NaN` or `-Infinity` from an empty `Math.max`. Its anchor id is authored now and resolves to nothing until the feature plan seeds it — which is fine, because **nothing in this plan resolves an anchor's position for a region with no members**.

The module header must explain why two regions share one anchor — that is the distinction whose absence produced a single global `FARTHEST_*` pair.

**`label` is a sibling field on the row, not a second parallel map.** `paletteRows.tsx:124` hardcodes `'Solar System'` as the category chip for every non-famous body — the feature plan needs a real per-region string once bodies outside the solar system exist. The codebase's own convention for this (`CATEGORY_DISPLAY_INFO`, `src/data/structure/categoryDisplayInfo.ts:1-16`, and `SOURCE_REGISTRY`'s `id`/`label` sibling fields) is id and label together on one row, never a hand-maintained `Record<Id, string>` beside the id union — `categoryDisplayInfo.ts:6-9` calls that pattern "a second place to edit and a second place to forget". `BodyRegion.label` follows the same rule. This plan does not touch `paletteRows.tsx` itself — that repoint is the feature plan's job — but the field, `memberIds`, and `regionOfBody` must all exist here so the feature plan has them to consume.

- [x] Add the test `solar-system and solar-neighbourhood share an anchor but not an extent`.
- [x] Add the test `an empty region has extent 0, not NaN` — the empty `Math.max` guard.
- [x] Add the test `region extents reproduce today's FARTHEST_PLANET_MPC and FARTHEST_BODY_MPC`.
- [x] Add the test `every scene body belongs to exactly one region` — totality over `SCENE_BODIES` **and** disjointness, asserted through `regionOfBody`. This is the one the feature plan's chip rests on; it fails by returning `null`, never by throwing.
- [x] Add the test `the Sun belongs to the solar system, not to the neighbourhood it anchors` — the placement the chip depends on and the one an implementer will get backwards.
- [x] Implement `BODY_REGIONS` and `regionOfBody`.
- [x] `npm test -- bodyRegions regionOfBody` → passes; the Task 1 baseline still passes.
- [x] Commit.

---

### Task 3: Anchor-relative band evaluation

**Files:**

- Create: `src/utils/scene/regionRelativeDistanceMpc.ts`
- Modify: `src/services/engine/presentation/scaleFadeBands.ts`
- Test: `tests/utils/scene/regionRelativeDistanceMpc.test.ts`

**Interfaces — Produces:**

```ts
export function regionRelativeDistanceMpc(
  camPosMpc: Readonly<Vec3>,
  region: BodyRegion,
  states: ReadonlyMap<string, BodyState>,
): number;
```

The keying quantity changes from `hypot(view.camPos)` to `|camPos − anchorPos|`. For the two Sun-anchored regions those are the same number, which is exactly why the Task 1 baseline must stay green through this task.

**Correction — it is not three rows.** The header at `scaleFadeBands.ts:13-21` says "three rows key on … the heliocentric render origin," but the table as it stands today has **six**: `surveyDeepZoom`, `milkyWayApproach`, `starBackdrop`, `bodyGlintBackdrop`, `sunCaption`, `constellations` — each one's own row comment says "Keyed on: CAMERA distance from the heliocentric render origin," and each is fed by its consuming layer with a raw `camDistMpc`/`ctx.cam.distance` argument (`structureMarkersLayer.ts`, `milkyWayLayer.ts`, `pointSpritesLayer.ts`, `produceStructureLabels.ts`, `produceMilkyWayLabel.ts`, `constellationLayerOpacity.ts`, `captionFadeRules.ts`, `volumeLiveness.ts`, plus `starPointsLayer.ts` and `bodyGlintsLayer.ts`). The header undercounted its own table; fix the stale "three" in `scaleFadeBands.ts:18-19` as part of this task while it's being edited anyway.

**Resolved — narrow the scope, don't widen it.** Four of the six (`surveyDeepZoom`, `milkyWayApproach`, `sunCaption`, `constellations`) gate content that genuinely IS about distance from the Sun/origin — the survey point clouds and structure markers receding on deep zoom, the Milky Way impostor's own approach, the Sun's caption (the Sun sits at the origin, so its own distance-from-camera IS that quantity by construction), the constellation figures (Earth's sky, meaningless anywhere but near the Sun). None of them gate content that belongs to a different region's anchor, so origin-keying them is correct, not a latent bug — repointing them at a region would be motion for its own sake. Only `starBackdrop` and `bodyGlintBackdrop` gate region-scoped content (the star map's backdrop, the planet/moon glints) whose relevant distance is "how close is the camera to THIS region," which is exactly what stops being true once a region's content sits somewhere other than the Sun. This task repoints only those two.

- [x] Add the test `a Sun-anchored region keys identically to hypot(camPos)`.
- [x] Add the test `an off-origin region keys on distance to its own anchor` — camera 1 pc from Sgr A\* yields ~1 pc, not ~8178 pc. **This is the test the whole plan exists for.**
- [x] Implement `regionRelativeDistanceMpc` and repoint `starBackdrop`'s two reads (`starPointsLayer.ts:115` in `enabled`, `:151` in `draw`) and `bodyGlintBackdrop`'s three reads (`bodyGlintsLayer.ts:135` in `enabled`, `:177,293` in `draw`/`drawPick`) at the `solar-neighbourhood` region (today's dominant Sun-anchored extent — see Task 2's table; `bodyGlintBackdrop` scales off the solar-system's planet extent specifically, so it keys on `solar-system` instead). Same numbers as today; only the two files besides `scaleFadeBands.ts` change.
- [x] Fix the stale "three rows" count in `scaleFadeBands.ts`'s module header (`:18-19`) to six, and name which two are region-relative vs. which four stay origin-direct.
- [x] `npm test` → green including the Task 1 baseline.
- [x] Commit.

---

### Task 4: Band shape becomes per-region, not per-constant

**Files:**

- Modify: `src/services/engine/presentation/scaleFadeBands.ts:104,124`

`starBackdrop` is `{ fullAt: FARTHEST_BODY_MPC * 2, goneAt: FARTHEST_BODY_MPC * 10 }` and `bodyGlintBackdrop` is `{ fullAt: FARTHEST_PLANET_MPC * 2, goneAt: FARTHEST_PLANET_MPC * 10 }` — the identical ×2 / ×10 shape written twice against two extents.

Derive both from one shape applied to each region's extent. The two multipliers get one home with a comment explaining what they mean (fully present at twice the region's own extent; gone by ten times it).

- [x] Add the test `both backdrop bands derive from one shape` — changing the shape moves both.
- [x] Implement.
- [x] `npm test` → green including the baseline.
- [x] Commit.

---

### Task 5: Orbit-trail reach becomes per-region

**Files:**

- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:114-121,148-160`

`maxHeliocentricReachMpc` computes an orbit's reach **from the Sun**, and `MAX_ORBIT_EXTENT_MPC` is the max over all of them. With a Galactic Center orbit in the table that value would jump by seven-plus orders of magnitude — from Neptune's ~30 AU to ~8178 pc — and the whole-layer cull's `nearestMpc = max(|camPos| − MAX_ORBIT_EXTENT, 0)` would evaluate to **0 for any camera within 8 kpc of the Sun**, silently defeating the cull for every solar-system trail.

Reach becomes reach-from-the-region-anchor, and the cull compares against the camera's region-relative distance. Plan 01 Task 5 already routed this function's focus resolution through the anchor seam, so the recursion is gone; this task changes what it measures against.

- [x] Add the test `a Galactic Centre orbit does not inflate the solar-system trail reach` — the regression this task prevents, using a synthetic far-anchored orbit.
- [x] Add the test `the whole-layer cull still drops solar-system trails at galactic distance`.
- [x] Implement.
- [x] `npm test` → green including the baseline.
- [x] Commit.

---

### Task 6: The far plane and the label gate derive from region extents

**Files:**

- Modify: `src/services/engine/frame/foregroundMaxDistance.ts:71-127` (the whole derivation section: `BODY_STATES_J2000`, `ORBITAL_BODY_DISTANCES_MPC`/`STAR_DISTANCES_MPC`, `FARTHEST_BODY_MPC`, `FARTHEST_PLANET_MPC`, `MARGIN`, `FOREGROUND_MAX_DISTANCE_MPC`) and the module header's "Why DERIVED from the body snapshot + star records" section (`:19-40`), which stops being true
- Modify: `src/services/engine/frame/solarSystemLabelMaxDistance.ts:45-47`
- Modify: `src/services/engine/presentation/scaleFadeBands.ts:38` — `FARTHEST_STAR_PC` is `FARTHEST_BODY_MPC / SCALE_UNITS.PC_TO_MPC`; this task retires `FARTHEST_BODY_MPC`, so it must be re-derived from the `solar-neighbourhood` region's `extentMpc` in the same commit or the module fails to import
- Modify: `tests/services/engine/presentation/scaleFadeBands.test.ts:15-18,33` — the "pop-free coupling" suite imports `FARTHEST_BODY_MPC` directly; repoint that one import at the `solar-neighbourhood` extent, keeping the exact inequality it pins. `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` is **not** renamed, so `:19,34` and the other two cases need no change.
- Modify: `tests/services/engine/frame/foregroundMaxDistance.test.ts` — see "the enclosure property is the thing that is wrong" below

**Both constants stay global scalars.** Neither becomes a predicate; neither is renamed; **not one of the ~12 NEAR0 `enabled()` call sites is touched.** What changes is only what feeds them.

The reason is the one thing the earlier drafts of this task got wrong in both directions: **the threshold is a scale, not a position.** Every consumer reads `ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC` (`atmosphereDrawList.ts:59`, `bodyGlintsLayer.ts:126,149`, `cloudShellLayer.ts:120`, `earthLayer.ts:83`, `foregroundLabelsLayer.ts:395`, `orbitTrailsLayer.ts:148`, `planetsLayer.ts:90,110`, `ringsLayer.ts:135`, `starPointsLayer.ts:108`, `starSpheresLayer.ts:89`, `texturedBodiesLayer.ts:111`), and `ctx.cam.distance` is the camera's distance from its **orbit target** (`assembleOrbitCamera.ts:57`: `position = target + distance · dir`), not from the render origin. A camera orbiting Sgr A\* from 1 pc away reads `cam.distance = 1 pc`, which already clears the 0.23 Mpc gate. There is nothing to widen and nothing to retrofit. (`SCALE_FADE_BANDS.surveyDeepZoom.fullAt`, `scaleFadeBands.ts:66`, is the one consumer that takes it as a band edge against an origin distance — which is exactly why it must stay a scalar.)

New derivation, replacing the raw `FARTHEST_BODY_MPC`/`FARTHEST_PLANET_MPC` pair (both retired here):

```ts
export const FOREGROUND_MAX_DISTANCE_MPC =
  Math.max(...BODY_REGIONS.map((region) => region.extentMpc)) * MARGIN;
```

With no position resolved here, `BODY_STATES_J2000`, `ORBITAL_BODY_DISTANCES_MPC`, `STAR_DISTANCES_MPC`, and the `RENDER_ORIGIN_MPC` / `distanceMpc` / `deriveBodyStates` / `CONST_J2000` / `SCENE_STARS` imports all go dead in this module — that derivation work now lives in `bodyRegions.ts` (Task 2). Delete them rather than leaving them; `foregroundMaxDistance.ts` reduces to `BODY_REGIONS`, `MARGIN`, and the export.

**No `|anchorPos|` term, and no `.filter(region => region.extentMpc > 0)`.** An earlier draft wrote `max over regions(|anchorPos| + extentMpc) * MARGIN` and then needed the filter to dodge resolving `'sgr-a-star'`'s position, which nothing seeds until the feature plan. Both go: adding an absolute position into a threshold that is compared against a relative distance is a category error, and with the position gone **no anchor is ever resolved here**, so the unresolvable-anchor case cannot arise. The filter is not needed for the empty-`Math.max` case either — `BODY_REGIONS` always has three rows, and `galactic-centre`'s `extentMpc` is 0 (Task 2), which contributes nothing to a `Math.max`. Do not reintroduce it.

Today `solar-neighbourhood.extentMpc` dominates (`solar-system` is ~30 AU, `galactic-centre` is 0), so the value is **exactly today's `FARTHEST_BODY_MPC * 100` ≈ 0.23 Mpc, unchanged** — which is also why the Milky-Way-label coupling (`foregroundMaxDistance.ts:63-68`: the gate must stay below `MILKY_WAY_LABEL_NEAR_MPC` = 0.6 Mpc, `milkyWayLabelVisibility.ts:16`) survives. That coupling was always a property of the solar-neighbourhood extent, riding inside a name that did not say so; this task makes the attachment explicit without moving the number. It stays 0.23 Mpc through the feature plan too, because a region's extent does not grow when its anchor is 8 kpc away.

`SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (`solarSystemLabelMaxDistance.ts:47`) is the same story one line down: `FARTHEST_BODY_MPC * 4` becomes the `solar-neighbourhood` extent × 4. The ×4 margin is load-bearing against `SCALE_FADE_BANDS.starCaption.goneAt = FARTHEST_STAR_PC * 2` (the pop-free inequality its docblock derives at `:15-25`), and both sides now read the same region extent — so the inequality holds by the same construction it always did. It keeps its name: it gates the solar-system captions, which is what it says.

**The enclosure property in `foregroundMaxDistance.test.ts` is the thing that is wrong, not a number to bump.** `:26-37` maxes each `SCENE_BODIES` row's distance from the origin and asserts `gate >= farthest * 100`. Today that is a tautology — the gate _is_ that max × 100, so the assertion cannot fail. Under the new derivation it stops being a tautology and starts being **false** as soon as Sgr A\* joins `SCENE_BODIES` (max 8178 pc would demand ≥ 0.82 Mpc, which the 0.6 coupling forbids), i.e. it would fail on correct code. Delete it rather than restate it (testing.md: "the default is delete, not defend"), and put the two properties that can actually fail in its place:

- the near-field property already there (`< 1 Mpc`, `:41`) — keep verbatim;
- the Milky-Way-label coupling — `FOREGROUND_MAX_DISTANCE_MPC < MILKY_WAY_LABEL_NEAR_MPC`. This is a real cross-module inequality, currently pinned nowhere, and it is precisely what the retired origin-distance derivation broke.

- [x] Add the test `the far plane stays below the Milky-Way label's near band` — the coupling `foregroundMaxDistance.ts:63-68` documents and nothing asserts.
- [x] Delete the enclosure assertion (`foregroundMaxDistance.test.ts:26-37`) and its explaining header text; keep the `< 1 Mpc` case.
- [x] Add the test `the far plane is unchanged by a distant region's anchor` — a synthetic region anchored far from the origin with a small extent must not move the result. This is the one that fails against the retired `|anchorPos| + extentMpc` formula, and the one the feature plan's Sgr A\* landmine rests on.
- [x] Implement both derivations.
- [x] Update `scaleFadeBands.ts:38` and `scaleFadeBands.test.ts:15-18,33` per the Files note above.
- [x] `npm test` → green including the baseline (all eight values unmoved). `npm run typecheck` clean.
- [x] Commit.

---

### Task 7: Retire the baseline harness

**Files:**

- Delete: `tests/services/engine/presentation/scaleFadeBands.baseline.test.ts`
- Modify: `src/services/engine/presentation/scaleFadeBands.ts` — revert the Task 1 temporary `export` on `FARTHEST_STAR_PC`, unless Task 6 already made it a real region-derived export for another reason.
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts` — revert the Task 1 temporary `export` on `MAX_ORBIT_EXTENT_MPC`, unless Task 5 already made it a real export for another reason.

The fixture has done its job: it proved eight edges survived five commits (Tasks 2–6) unchanged. Keeping it would leave a constant-restatement test in the suite permanently, which the testing convention forbids and which would fail on any legitimate future re-tuning.

- [x] Confirm the baseline is green immediately before deleting it.
- [x] Delete the test; revert whichever Task 1 export is still module-private-by-design.
- [x] `npm test` → green.
- [x] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- The Task 1 baseline passed unchanged through Tasks 2–6, then was deleted in Task 7.
- No REGION-SCOPED fade key (`starBackdrop`, `bodyGlintBackdrop`) is computed from `hypot(camPos)` directly — both key on `regionRelativeDistanceMpc` against their region's anchor. `surveyDeepZoom`, `milkyWayApproach`, `sunCaption`, and `constellations` remain deliberately origin-keyed: they gate scene-wide/observer-relative content (the survey point clouds, the Milky Way impostor's own approach, the Sun's own caption, Earth's-sky constellation figures) whose relevant distance genuinely is the camera's distance from the Sun/origin, not from a region anchor.
- `FARTHEST_BODY_MPC` and `FARTHEST_PLANET_MPC` no longer exist as independent constants; both are region extents.
- `FOREGROUND_MAX_DISTANCE_MPC` and `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` are still single exported scalars with their existing names, still read as `ctx.cam.distance >= …` at every existing call site — **no call site was edited**. Only their derivations moved onto region extents, and neither value changed.
- `foregroundMaxDistance.test.ts` no longer asserts enclosure over absolute body positions; it pins the `< 1 Mpc` near-field property and the `< MILKY_WAY_LABEL_NEAR_MPC` coupling.
- `regionOfBody` is total over `SCENE_BODIES` — every body resolves exactly one region, the Sun to `solar-system`.
- The ×2 / ×10 band shape has exactly one home.
- Visual spot-check: the descent from cosmic scale to Earth's surface crossfades exactly as before — surveys receding, star backdrop dissolving, planet glints fading — with no shifted edge.
