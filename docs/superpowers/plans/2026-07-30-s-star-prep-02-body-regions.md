# S-star prep 02 — `BodyRegion` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make near-field scale gating anchor-relative, so content that is not near the Sun can be gated on how close the camera is to *it*.

**Architecture:** P3 from [the spec](../specs/2026-07-30-s-star-orbits-design.md). `scaleFadeBands.ts:18` records that three band rows key on the camera's distance from the heliocentric render origin. That value is ~8178 pc anywhere at the Galactic Center, and identical 8 kpc the other way, so it cannot express "appears when you are near it". A `BodyRegion` carries an anchor and a derived extent; bands become a shape applied per region and keyed on `|camPos − anchorPos|`.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- **Depends on Plan 01.** Anchors must already exist in the state map (Plan 01 Task 4).
- **Zero behaviour change.** Every existing band edge must land on the same number it does today. This plan re-derives *how* an edge is computed, never *what* it evaluates to. Regression fixtures come first.
- **Three regions, not two.** `solar-system` and `solar-neighbourhood` share the Sun as anchor but differ by seven orders of magnitude in extent. Region is a *scale regime*; anchor is a *position*. Do not collapse them.
- **Extents are derived, never authored** — `max |member − anchor|` over the region's members, matching the discipline `foregroundMaxDistance.ts:85-99` already uses.
- **`type` aliases, never `interface`.** One type per file in `src/@types/`.
- **Gate at `enabled()`, not at draw.** Opacity 0 must drop the pass; pick follows visibility. See `docs/superpowers/conventions/` and the `orbitTrailsLayer.ts:130-160` precedent.
- Read [docs/RENDERER.md](../../RENDERER.md) first.

---

### Task 1: Capture today's band edges as a regression fixture

**Files:**
- Create: `tests/services/engine/presentation/scaleFadeBands.baseline.test.ts`

Before anything moves, pin every current edge. This fixture is the contract for the whole plan: `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, `FOREGROUND_MAX_DISTANCE_MPC`, `starBackdrop.fullAt/goneAt`, `bodyGlintBackdrop.fullAt/goneAt`, `MAX_ORBIT_EXTENT_MPC`, and `FARTHEST_STAR_PC`.

This is deliberately a constant-restatement test, which the testing convention normally forbids — it is justified here **only** as a temporary refactor harness, and Task 7 deletes it. Say so in the file header so a later reader does not cite it as precedent.

- [ ] Write the fixture asserting all seven current values.
- [ ] `npm test -- scaleFadeBands.baseline` → passes.
- [ ] Commit.

---

### Task 2: `BodyRegion` types and the region table

**Files:**
- Create: `src/@types/data/BodyRegionId.d.ts`
- Create: `src/@types/scene/BodyRegion.d.ts`
- Create: `src/data/bodies/bodyRegions.ts`
- Test: `tests/data/bodies/bodyRegions.test.ts`

**Interfaces — Produces:**
```ts
export type BodyRegionId = 'solar-system' | 'solar-neighbourhood' | 'galactic-centre';

export type BodyRegion = {
  readonly id: BodyRegionId;
  readonly anchorId: string;
  readonly extentMpc: number; // DERIVED: max |member − anchor|, never authored
};

export const BODY_REGIONS: readonly BodyRegion[];
```

| region | anchor | members | extent today |
| --- | --- | --- | --- |
| `solar-system` | `sun` | planets + moons (element rows focused in the Sun's subtree) | ~30 AU, Neptune |
| `solar-neighbourhood` | `sun` | famous-star anchors | 2300 pc, Eta Carinae |
| `galactic-centre` | `sgr-a-star` | — (empty until the feature plan) | 0 |

The `galactic-centre` row exists here with no members. An empty region must yield extent 0 and gate its (absent) content off, not `NaN` or `-Infinity` from an empty `Math.max`.

The module header must explain why two regions share one anchor — that is the distinction whose absence produced a single global `FARTHEST_*` pair.

- [ ] Add the test `solar-system and solar-neighbourhood share an anchor but not an extent`.
- [ ] Add the test `an empty region has extent 0, not NaN`.
- [ ] Add the test `region extents reproduce today's FARTHEST_PLANET_MPC and FARTHEST_BODY_MPC`.
- [ ] Implement.
- [ ] `npm test -- bodyRegions` → passes; the Task 1 baseline still passes.
- [ ] Commit.

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

Update the `scaleFadeBands.ts:13-21` "One table, mixed keying quantities" header: there are still mixed quantities, but the three origin-keyed rows are now **region-anchor-keyed**, and the star-caption row's content-relative keying is no longer the odd one out — it was the seam the others should have had.

- [ ] Add the test `a Sun-anchored region keys identically to hypot(camPos)`.
- [ ] Add the test `an off-origin region keys on distance to its own anchor` — camera 1 pc from Sgr A\* yields ~1 pc, not ~8178 pc. **This is the test the whole plan exists for.**
- [ ] Implement and repoint the three rows.
- [ ] `npm test` → green including the Task 1 baseline.
- [ ] Commit.

---

### Task 4: Band shape becomes per-region, not per-constant

**Files:**
- Modify: `src/services/engine/presentation/scaleFadeBands.ts:104,124`

`starBackdrop` is `{ fullAt: FARTHEST_BODY_MPC * 2, goneAt: FARTHEST_BODY_MPC * 10 }` and `bodyGlintBackdrop` is `{ fullAt: FARTHEST_PLANET_MPC * 2, goneAt: FARTHEST_PLANET_MPC * 10 }` — the identical ×2 / ×10 shape written twice against two extents.

Derive both from one shape applied to each region's extent. The two multipliers get one home with a comment explaining what they mean (fully present at twice the region's own extent; gone by ten times it).

- [ ] Add the test `both backdrop bands derive from one shape` — changing the shape moves both.
- [ ] Implement.
- [ ] `npm test` → green including the baseline.
- [ ] Commit.

---

### Task 5: Orbit-trail reach becomes per-region

**Files:**
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:114-121,148-160`

`maxHeliocentricReachMpc` computes an orbit's reach **from the Sun**, and `MAX_ORBIT_EXTENT_MPC` is the max over all of them. With a Galactic Center orbit in the table that value would jump by ~1.7 × 10⁷, and the whole-layer cull's `nearestMpc = max(|camPos| − MAX_ORBIT_EXTENT, 0)` would evaluate to **0 for any camera within 8 kpc of the Sun**, silently defeating the cull for every solar-system trail.

Reach becomes reach-from-the-region-anchor, and the cull compares against the camera's region-relative distance. Plan 01 Task 5 already routed this function's focus resolution through the anchor seam, so the recursion is gone; this task changes what it measures against.

- [ ] Add the test `a Galactic Centre orbit does not inflate the solar-system trail reach` — the regression this task prevents, using a synthetic far-anchored orbit.
- [ ] Add the test `the whole-layer cull still drops solar-system trails at galactic distance`.
- [ ] Implement.
- [ ] `npm test` → green including the baseline.
- [ ] Commit.

---

### Task 6: Global far plane and per-region label gate

**Files:**
- Modify: `src/services/engine/frame/foregroundMaxDistance.ts`
- Modify: `src/services/engine/frame/solarSystemLabelMaxDistance.ts`

Two constants split in opposite directions.

`FOREGROUND_MAX_DISTANCE_MPC` **stays global** — it is the NEAR0 far plane and must cover every region: `max over regions(|anchorPos| + extentMpc) × 100`. Today that still resolves to the Eta Carinae value.

`SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` becomes **per-region**, which is what its name already claims. Rename it to match its new shape; use `npm run move-files` if the symbol moves file.

- [ ] Add the test `the foreground far plane covers every region` using a synthetic distant region.
- [ ] Add the test `the label gate is evaluated per region`.
- [ ] Implement.
- [ ] `npm test` → green including the baseline. `npm run typecheck` clean.
- [ ] Commit.

---

### Task 7: Retire the baseline harness

**Files:**
- Delete: `tests/services/engine/presentation/scaleFadeBands.baseline.test.ts`

The fixture has done its job: it proved seven edges survived six commits unchanged. Keeping it would leave a constant-restatement test in the suite permanently, which the testing convention forbids and which would fail on any legitimate future re-tuning.

- [ ] Confirm the baseline is green immediately before deleting it.
- [ ] Delete; `npm test` → green.
- [ ] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- The Task 1 baseline passed unchanged through Tasks 2–6, then was deleted in Task 7.
- No consumer computes a fade key from `hypot(camPos)` directly.
- `FARTHEST_BODY_MPC` and `FARTHEST_PLANET_MPC` no longer exist as independent constants; both are region extents.
- The ×2 / ×10 band shape has exactly one home.
- Visual spot-check: the descent from cosmic scale to Earth's surface crossfades exactly as before — surveys receding, star backdrop dissolving, planet glints fading — with no shifted edge.
