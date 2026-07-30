# S-star prep 01 — focus graph + capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every scene body's position come from one per-frame state map rooted at explicit anchors, and make the body renderers' capacities derive from their tables instead of hardcoded 24s.

**Architecture:** Two prep refactors (P1, P2) from [the spec](../specs/2026-07-30-s-star-orbits-design.md). Neither adds a feature. P1 replaces the `parentId === null` discriminant with a focus graph whose roots are positioned anchors, un-braids `StarBody`'s baked position, and splits "has a position" from "moves". P2 makes the orbit-trail and planet renderers match `starPointRenderer`, which already grows dynamically.

**Tech Stack:** TypeScript, Vitest. No GPU or shader changes beyond buffer sizing.

## Global Constraints

- **Zero behaviour change.** Every task in this plan is a refactor. `deriveBodyStates(CONST_J2000)` must reproduce today's values bit-for-bit, and every existing scale-fade edge must be unchanged.
- **`type` aliases, never `interface`.** One type per file in `src/@types/`, filename = exported symbol.
- **One exported function per file** in `src/utils/`.
- **Didactic comments.** Multi-paragraph module headers explaining *why* and *what the alternative was*, matching the surrounding files.
- **No file moves by hand.** Any rename or relocation goes through `npm run move-files -- <from> <to>` (`--dry` first). Never `git mv` plus hand-edited imports.
- **Test what can break.** No runtime type tests, no constant restatements. See `docs/superpowers/conventions/testing.md`.
- Read [docs/RENDERER.md](../../RENDERER.md) before Tasks 7–8.

---

### Task 1: `AnchorBody` type and the anchor table

**Files:**
- Create: `src/@types/scene/AnchorBody.d.ts`
- Create: `src/data/bodies/sceneAnchors.ts`
- Test: `tests/data/bodies/sceneAnchors.test.ts`

**Interfaces — Produces:**
```ts
export type AnchorBody = {
  readonly id: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
};

export const SCENE_ANCHORS: readonly AnchorBody[];
```

The table holds one row this task: the Sun, at an **authored** heliocentric `[0, 0, 0]`. The module header must explain why that is authored rather than referencing `RENDER_ORIGIN_MPC` — they are two different facts (the Sun's position; the frame's origin) that share a value only by today's coincidence, and `renderOrigin.ts:14` documents a dynamic origin as a future customization point.

Nothing consumes this table yet.

- [ ] Add the test `the Sun anchor is heliocentric zero, independent of RENDER_ORIGIN_MPC` — assert `SCENE_ANCHORS` contains `sun` at `[0,0,0]` and that the module does not import `renderOrigin`.
- [ ] Implement the type and the table.
- [ ] `npm test -- sceneAnchors` → passes.
- [ ] Commit.

---

### Task 2: `parentId` → `focusId`, null eliminated

**Files:**
- Modify: `src/@types/scene/OrbitalElements.d.ts`
- Modify: `src/data/bodies/orbitalElements.ts` (all 23 rows)
- Modify: `src/services/engine/frame/deriveBodyStates.ts:81,96,97,100`
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:120,227`
- Modify: `src/data/bodies/sceneOrbitConics.ts`
- Modify: `src/data/bodies/makers/satellite.ts`, `makers/heliocentricPlanet.ts`, `makers/satelliteBody.ts`

**Interfaces — Produces:**
```ts
// OrbitalElements delta:
//   - readonly parentId: string | null
//   + readonly focusId: string
```

Mechanical rename plus a semantic one: the eight `parentId: null` rows become `focusId: 'sun'`. Every `x === null ? RENDER_ORIGIN_MPC : …` branch becomes an unconditional lookup that will resolve through the anchor map in Task 4 — for this task it may still special-case `'sun'`, because `deriveBodyStates` does not yet seed anchors. Write that as ordinary prose in the comment ("the `'sun'` case resolves through the anchor map once anchors are seeded"); do not leave a `TODO` marker, which the codebase treats as a defect.

Update every docblock that asserts "`null` is heliocentric" — `OrbitalElements.d.ts:23-26`, `deriveBodyStates.ts:49`, `sceneOrbitConics.ts:19-23`.

- [ ] Add the test `every orbital element row names a focus` asserting no row has an empty/absent `focusId`.
- [ ] Perform the rename and the null elimination.
- [ ] `npm run typecheck` → clean. `npm test` → green, with no snapshot or value changes.
- [ ] Commit.

---

### Task 3: Split "moves this frame" from "has a position"

**Files:**
- Create: `src/utils/scene/bodyMovesThisFrame.ts`
- Modify: `src/services/engine/camera/liveBodyPosition.ts`
- Modify: `src/services/engine/camera/cameraDrivers.ts:276,297`
- Modify: `src/state/selection/watchFocusTweenSaga.ts:97`
- Modify: `src/services/engine/frame/runFrame.ts` (pivot pin), NEAR0 selection-ring layer
- Test: `tests/utils/scene/bodyMovesThisFrame.test.ts`

**Interfaces — Produces:**
```ts
export function bodyMovesThisFrame(focusRow: SelectionRow | null): boolean;
```

`liveBodyPosition` currently conflates two questions. Its non-null return is the membership predicate for `followBody.isActive`, the focus-tween skip, the pivot pin, and selection-ring centring — see its own docblock at `liveBodyPosition.ts:1-21`, which states "null when the focus is not a body present in the snapshot". Once anchors enter the map (Task 4), presence stops meaning "moves".

**This task must land before Task 4.** Today `bodyMovesThisFrame` is exactly "the focus is a body with an `ORBITAL_ELEMENTS` row", which is behaviour-identical to the current null check — so this commit changes nothing and stays correct after anchors join.

`liveBodyPosition` keeps returning a position; the four call sites take their *membership* from the new predicate and their *position* from `liveBodyPosition`. Rewrite `liveBodyPosition`'s docblock so it no longer claims to answer the membership question.

- [ ] Add the test `a famous star does not move this frame` and `a planet moves this frame`.
- [ ] Add the test `the Sun does not move this frame` — this is the case Task 4 would otherwise silently flip.
- [ ] Extract the predicate; repoint the four call sites.
- [ ] `npm test` → green, no behaviour change.
- [ ] Commit.

---

### Task 4: `deriveBodyStates` seeds anchors and resolves in dependency order

**Files:**
- Modify: `src/services/engine/frame/deriveBodyStates.ts`
- Test: `tests/services/engine/frame/deriveBodyStates.test.ts`

Replace the two-pass structure (`:81` skip-if-not-null, `:96` skip-if-null) with: seed the map from `SCENE_ANCHORS`, then resolve element rows in focus-dependency order. This retires the documented one-hop limit at `:49` and `:117` ("every parent is heliocentric, one hop suffices") — a focus chain of any depth now resolves, and a cycle must throw with the offending ids named.

**The bit-for-bit obligation is the point of this task.** `deriveBodyStates(CONST_J2000)` must return values identical to today's for all 23 bodies.

- [ ] Add the test `J2000 snapshot is unchanged after the anchor rewrite` — capture today's values as a committed fixture first, then assert against it.
- [ ] Add the test `a focus cycle throws naming both ids`.
- [ ] Add the test `a focus chain deeper than one hop resolves` using a synthetic three-level fixture.
- [ ] Implement.
- [ ] `npm test -- deriveBodyStates` → passes, including the unchanged-snapshot fixture.
- [ ] Commit.

---

### Task 5: Trail focus resolution through the same seam

**Files:**
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:117-121,227`
- Modify: `src/data/bodies/sceneOrbitConics.ts`

Two sites still resolve a focus their own way. `maxHeliocentricReachMpc` (`:117`) recurses one level through `elementsById`, and `sceneOrbitConics` resolves the focus through `elementsById` too — which **throws on any id absent from the element table**, so an anchor focus is currently unrepresentable there.

Both must resolve through the Task 4 seam. `maxHeliocentricReachMpc` keeps computing a heliocentric reach for now; Plan 02 re-keys it per region.

- [ ] Add the test `an orbit focused on an anchor resolves its conic centre` using a synthetic anchor + element pair.
- [ ] Repoint both sites.
- [ ] `npm test` → green; J2000 conic values unchanged.
- [ ] Commit.

---

### Task 6: `StarBody` loses its baked position

**Files:**
- Modify: `src/@types/scene/StarBody.d.ts`
- Modify: `src/data/bodies/makers/star.ts`
- Modify: `src/data/bodies/sceneAnchors.ts` (famous stars join the table)
- Modify: `src/services/engine/frame/passes/starPointsLayer.ts:257`, `starSpheresLayer.ts`
- Modify: `src/services/engine/frame/foregroundMaxDistance.ts:92`
- Modify: `src/services/engine/presentation/sceneBodyLabels.ts`, `src/services/engine/data/createEngineData.ts`

`StarBody` becomes identity + photometry only, matching `PlanetBody`, whose docblock (`PlanetBody.d.ts:1-13`) already states the principle: position "live[s] in its `BodyState` … never baked here". The `star` maker's `raDecDistToCartesian` result becomes an `AnchorBody` row rather than a field on the drawn record. All 119 famous stars (the Sun included) become anchors.

Picking is unaffected — it keys on `seedIndexOfBody(star.id, SCENE_STARS)`, not on position.

- [ ] Add the test `a famous star's drawn position comes from the snapshot` asserting the layer reads the state map, not the record.
- [ ] Add the test `every famous star seed has a matching anchor` (totality — a seed with no anchor would render at the origin).
- [ ] Implement.
- [ ] `npm test` → green; `FARTHEST_BODY_MPC` still 2300 pc; no camera-behaviour change (Task 3 already guards this).
- [ ] Commit.

---

### Task 7: Orbit-trail capacity derives from the table

**Files:**
- Modify: `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts:52,96-105,164-166`
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:181`
- Test: `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts`

`MAX_ORBITS = 24` against 23 rows today, and `orbitTrailsLayer.ts:181` silently truncates with `Math.min(ORBITAL_ELEMENTS.length, MAX_ORBITS)`. The feature brings the table to 62.

**Follow the sibling that is already correct:** `starPointRenderer.ts:172-214` grows its instance buffer when `stars.length > capacityStars`. Match that pattern. Silent truncation becomes a loud failure.

- [ ] Add the test `the trail buffer grows past the initial capacity` driving more orbits than the initial allocation.
- [ ] Add the test `an over-count draw throws rather than silently truncating`.
- [ ] Implement.
- [ ] `npm test -- orbitTrail` → passes.
- [ ] Commit.

---

### Task 8: Planet capacity, the same treatment

**Files:**
- Modify: `src/services/gpu/renderers/bodies/planetRenderer.ts:61,126-134,197-200`
- Modify: `src/services/gpu/renderers/bodies/bodyPickRenderer.ts:142` (stale comment only)
- Delete: `docs/backlog/2026-07-29-planet-renderer-max-planets-cap.md`
- Modify: `docs/BACKLOG.md` (remove that item's index line)

`MAX_PLANETS = 24` has the identical defect — the draw caps, the pick does not — and is an open backlog item, folded in here by explicit decision. Per the backlog-hygiene convention, picking the item up **deletes both the index line and the detail file in this same commit**.

`bodyPickRenderer.ts:142` claims `SCENE_STARS.length ~= 25`; it is 119. Benign, because spheres resolve nearest-one-at-a-time, but correct the comment rather than inherit it.

- [ ] Add the test `the planet buffer grows past the initial capacity`.
- [ ] Add the test `pick and draw agree on the planet count` — the asymmetry the backlog item names.
- [ ] Implement; correct the stale comment; delete the backlog item and its index line.
- [ ] `npm test` → green. `npm run build` → clean.
- [ ] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- `deriveBodyStates(CONST_J2000)` bit-for-bit unchanged against the Task 4 fixture.
- No `parentId` identifier remains in `src/`.
- No `MAX_ORBITS` / `MAX_PLANETS` literal remains.
- `docs/BACKLOG.md` no longer lists the `MAX_PLANETS` item, and its detail file is gone.
- Visual spot-check: the solar system, its trails, and the famous stars look and behave exactly as before, including the camera's landing distance on selecting a famous star.
