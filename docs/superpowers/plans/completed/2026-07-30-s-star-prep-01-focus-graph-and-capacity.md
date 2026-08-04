# S-star prep 01 — focus graph + capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every scene body's position come from one per-frame state map rooted at explicit anchors, and make the body renderers' capacities derive from their tables instead of hardcoded 24s.

**Architecture:** Two prep refactors (P1, P2) from [the spec](../../specs/completed/2026-07-30-s-star-orbits-design.md). Neither adds a feature. P1 replaces the `parentId === null` discriminant with a focus graph whose roots are positioned anchors, un-braids `StarBody`'s baked position, and splits "has a position" from "moves". P2 makes the orbit-trail and planet renderers match `starPointRenderer`, which already grows dynamically.

**Tech Stack:** TypeScript, Vitest. No GPU or shader changes beyond buffer sizing.

## Global Constraints

- **Zero behaviour change.** Every task in this plan is a refactor. `deriveBodyStates(CONST_J2000)` must reproduce today's values bit-for-bit, and every existing scale-fade edge must be unchanged.
- **`type` aliases, never `interface`.** One type per file in `src/@types/`, filename = exported symbol.
- **One exported function per file** in `src/utils/`.
- **Didactic comments.** Multi-paragraph module headers explaining _why_ and _what the alternative was_, matching the surrounding files.
- **No file moves by hand.** Any rename or relocation goes through `npm run move-files -- <from> <to>` (`--dry` first). Never `git mv` plus hand-edited imports.
- **Test what can break.** No runtime type tests, no constant restatements. See `docs/superpowers/conventions/testing.md`.
- Read [docs/RENDERER.md](../../../RENDERER.md) before Tasks 7–8.

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

The table holds one row this task: the Sun, at an **authored** heliocentric `[0, 0, 0]`. The module header must explain why that is authored rather than referencing `RENDER_ORIGIN_MPC` — they are two different facts (the Sun's position; the frame's origin) that share a value only by today's coincidence, and `renderOrigin.ts:15-18` documents a dynamic origin as a future customization point.

Nothing consumes this table yet.

- [x] Add the test `the Sun anchor is heliocentric zero` — assert `SCENE_ANCHORS` contains `sun` at `[0,0,0]`. Don't assert the module's import list (a source-text-grep-shaped check on an implementation detail, not a behaviour) — the module header carries the "authored, not referenced" rationale instead.
- [x] Implement the type and the table.
- [x] `npm test -- sceneAnchors` → passes.
- [x] Commit.

---

### Task 2: `parentId` → `focusId`, null eliminated

**Files:**

- Modify: `src/@types/scene/OrbitalElements.d.ts`
- Modify: `src/data/bodies/orbitalElements.ts` (all 22 rows)
- Modify: `src/services/engine/frame/deriveBodyStates.ts:81,96,97,100`
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:120,227`
- Modify: `src/data/bodies/sceneOrbitConics.ts`
- Modify: `src/data/bodies/makers/satellite.ts:40,56` (`spec.parentId` → `spec.focusId`)

Note: `makers/heliocentricPlanet.ts` and `makers/satelliteBody.ts` do not reference `parentId` anywhere — they build identity-only `PlanetBody` records and are not imported by `orbitalElements.ts` (only `satellite.ts` is). Nothing to do there for this task.

**Interfaces — Produces:**

```ts
// OrbitalElements delta:
//   - readonly parentId: string | null
//   + readonly focusId: string
```

Mechanical rename plus a semantic one: the nine `parentId: null` rows become `focusId: 'sun'` (nine heliocentric — the eight planets plus the EMB — against thirteen satellites, 22 rows in all). Every `x === null ? RENDER_ORIGIN_MPC : …` branch becomes an unconditional lookup that will resolve through the anchor map in Task 4 — for this task it may still special-case `'sun'`, because `deriveBodyStates` does not yet seed anchors. Write that as ordinary prose in the comment ("the `'sun'` case resolves through the anchor map once anchors are seeded"); do not leave a `TODO` marker, which the codebase treats as a defect.

Update every docblock that asserts "`null` is heliocentric" — `OrbitalElements.d.ts:23-26`, `deriveBodyStates.ts:49`, `sceneOrbitConics.ts:19-23`.

- [x] Add the test `every orbital element row names a focus` asserting no row has an empty/absent `focusId`.
- [x] Perform the rename and the null elimination.
- [x] `npm run typecheck` → clean. `npm test` → green, with no snapshot or value changes.
- [x] Commit.

---

### Task 3: Split "moves this frame" from "has a position"

**Files:**

- Create: `src/utils/scene/bodyMovesThisFrame.ts`
- Modify: `src/services/engine/camera/liveBodyPosition.ts`
- Modify: `src/services/engine/camera/cameraDrivers.ts:276,297` (`followBody.isActive` / `.pose`)
- Modify: `src/state/selection/watchFocusTweenSaga.ts:97` (the tween skip)
- Modify: `src/services/engine/camera/applyFocusedBodyPivot.ts:42-43` (the pivot pin's own `pivot === null` short-circuit — see below, this is a THIRD site, distinct from `runFrame.ts`)
- Modify: `src/services/engine/frame/runFrame.ts:382` (the `followingBody` membership read that feeds `accumulateFollowPan`)
- Modify: `src/services/engine/frame/passes/near0SelectionRingLayer.ts:78-81,118-121` (comment-only — see below; `:75-77` is still-true prose)
- Modify: `src/services/engine/camera/cameraDrivers.ts:182-184` (module header) and `:297` (`followBody.pose`'s position read) — comment-only, but both assert the snapshot-presence contract that stops being true
- Test: `tests/utils/scene/bodyMovesThisFrame.test.ts`

**Interfaces — Produces:**

```ts
export function bodyMovesThisFrame(focusRow: SelectionRow | null): boolean;
```

`liveBodyPosition` currently conflates two questions. Its non-null return is the membership predicate for `followBody.isActive`, the focus-tween skip, the pivot pin, and selection-ring centring — see its own docblock at `liveBodyPosition.ts:1-21`, which states "null when the focus is not a body present in the snapshot". Once anchors enter the map (Task 4), presence stops meaning "moves".

**This task must land before Task 4, and this is the load-bearing ordering constraint of the whole plan.** The Sun is not an `ORBITAL_ELEMENTS` row today (it lives only in `famousStars.generated.ts`), so `deriveBodyStates` never contains it and `liveBodyPosition` already returns `null` for a Sun focus — meaning `bodyMovesThisFrame` as defined here ("the focus is a body with an `ORBITAL_ELEMENTS` row") is behaviour-identical to today's null check, so this commit changes nothing. If Task 4 landed FIRST, seeding the Sun (and the 119 famous stars) into the state map as anchors would make `liveBodyPosition` return non-null for them with no predicate yet in place to keep them out of the membership checks — `followBody.isActive` would flip true the next time a famous star is focused and any `pivotsOnFocusedBody` driver is active, silently changing camera behaviour for 119 objects with nothing to catch it.

Three call sites currently ask `liveBodyPosition(...) !== null` as a membership question and must repoint to `bodyMovesThisFrame`: `cameraDrivers.ts:276` (`followBody.isActive`), `watchFocusTweenSaga.ts:97` (the tween skip), and `runFrame.ts:382` (`followingBody`, which gates `accumulateFollowPan`). A fourth, `applyFocusedBodyPivot.ts:42-43`, is subtler: it does not test membership as a boolean — it uses `liveBodyPosition`'s return value directly as the pivot position, and its `pivot === null` early-return is what currently keeps a focused famous star's camera pose unpinned (so a right-drag pan-offset is silently dropped for a star focus today, never applied). Once anchors join the map that early-return stops firing for famous stars, so `pivotsOnFocusedBody` drivers (orbitDrag, autoRotate, resting) would start pinning the pose target onto a focused famous star and applying `panOffset` to it — new behaviour, not merely a membership leak. Gate the pin itself on `bodyMovesThisFrame(focusRow)` before calling `liveBodyPosition` for the position value, so a static-anchor focus keeps today's unpinned behaviour.

`near0SelectionRingLayer.ts` needs NO behaviour change — its `liveBodyPosition(row, ctx.simDays) ?? worldPos` fallback (`:122`) already produces the same numeric centre either way once an anchor is seeded (the anchor's live position and the row's baked `worldPos` are the same authored value), because this site uses the position, not a membership boolean. But its docblock (`:75-81`) and inline comment (`:118-121`) both assert "absent from the orbital snapshot (a famous star...)" as the reason the fallback fires — that becomes false once famous stars are anchors, so the comment needs correcting even though the code doesn't.

`liveBodyPosition` keeps returning a position; the membership call sites take their _membership_ from the new predicate and their _position_ from `liveBodyPosition`. Rewrite `liveBodyPosition`'s docblock so it no longer claims to answer the membership question.

- [x] Add the test `a famous star does not move this frame` and `a planet moves this frame`.
- [x] Add the test `the Sun does not move this frame` — this is the case Task 4 would otherwise silently flip.
- [x] Extract the predicate; repoint `cameraDrivers.ts:276`, `watchFocusTweenSaga.ts:97`, `runFrame.ts:382` to it; gate `applyFocusedBodyPivot.ts`'s pin on it; correct `near0SelectionRingLayer.ts`'s stale comment.
- [x] `npm test` → green, no behaviour change.
- [x] Commit.

---

### Task 4: `deriveBodyStates` seeds anchors and resolves in dependency order

**Files:**

- Modify: `src/services/engine/frame/deriveBodyStates.ts`
- Test: `tests/services/engine/frame/deriveBodyStates.test.ts`

Replace the two-pass structure (`:81` skip-if-not-null, `:96` skip-if-null) with: seed the map from `SCENE_ANCHORS`, then resolve element rows in focus-dependency order. This retires the documented one-hop limit — the module header's "Planets first, then moons — one parent hop" section (`:45-53`) and pass two's own comment (`:90-94`), both asserting "every parent is heliocentric, one hop suffices". A focus chain of any depth now resolves, and a cycle must throw with the offending ids named.

**The bit-for-bit obligation is the point of this task.** `deriveBodyStates(CONST_J2000)` must return values identical to today's for all 23 bodies.

- [x] Add the test `J2000 snapshot is unchanged after the anchor rewrite` — capture today's values as a committed fixture first, then assert against it.
- [x] Add the test `a focus cycle throws naming both ids`.
- [x] Add the test `a focus chain deeper than one hop resolves` using a synthetic three-level fixture.
- [x] Implement.
- [x] `npm test -- deriveBodyStates` → passes, including the unchanged-snapshot fixture.
- [x] Commit.

---

### Task 5: Trail focus resolution through the same seam

**Files:**

- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:117-121,227`
- Modify: `src/data/bodies/sceneOrbitConics.ts`

Two sites still resolve a focus their own way. `maxHeliocentricReachMpc` (`:117`) recurses one level through `elementsById`, and `sceneOrbitConics` resolves the focus through `elementsById` too — which **throws on any id absent from the element table**, so an anchor focus is currently unrepresentable there.

Both must resolve through the Task 4 seam. `maxHeliocentricReachMpc` keeps computing a heliocentric reach for now; Plan 02 re-keys it per region.

- [x] Add the test `an orbit focused on an anchor resolves its conic centre` using a synthetic anchor + element pair.
- [x] Repoint both sites.
- [x] `npm test` → green; J2000 conic values unchanged.
- [x] Commit.

---

### Task 6: `StarBody` loses its baked position

**Files:**

- Modify: `src/@types/scene/StarBody.d.ts`
- Modify: `src/data/bodies/makers/star.ts`
- Modify: `src/data/bodies/sceneAnchors.ts` (famous stars join the table)
- Create: `src/@types/scene/PositionedStar.d.ts` — see the resolved contract below
- Create: `src/services/engine/frame/positionedVisibleStars.ts` — see the resolved contract below
- Test: `tests/services/engine/frame/positionedVisibleStars.test.ts`
- Modify: `src/services/engine/frame/passes/starPointsLayer.ts:118,132,240` (the three `stars: visibleStars(state)` arguments to `partitionStarsByResolution`, in `enabled`/`draw`/`drawPick` respectively — repoint to `positionedVisibleStars(state, ctx)`) `,172-174` (`draw`'s `rebasedPoints` map, reads `star.positionMpc` — unchanged shape, now typed via `PositionedStar`) `,254-256` (`drawPick`'s `pickPoints` loop, same)
- Modify: `src/services/engine/frame/passes/starSpheresLayer.ts:92,106,156` (the three `stars: visibleStars(state)` arguments, same repoint) `,122,173` (direct `star.positionMpc` reads, unchanged shape)
- Modify: `src/services/engine/frame/foregroundMaxDistance.ts:92-94` (`STAR_DISTANCES_MPC` maps `star.positionMpc`) — and its module header at `:21-27`, which names "the static `SCENE_STARS` records" as a bound source
- Modify: `tests/services/engine/frame/foregroundMaxDistance.test.ts:23-31` — the `'positionMpc' in body ? body.positionMpc : [0,0,0]` fallback at `:28` and its explaining comment at `:23-24`. Once anchors are seeded, `states.get(body.id)` resolves for every body, so the fallback and the narrowing are dead; collapse to the snapshot lookup. (The test's enclosure _property_ is rewritten in Plan 02 Task 6 — this task only removes the dead field access.)
- Modify: `src/data/bodies/sceneBodies.ts:7` — the header claims consumers "only touch the fields the `SceneBody` union shares (`id`, `label`, `positionMpc`, `radiusKm`)". `positionMpc` stops being shared here; the claim must be corrected in the same commit, not left to rot.
- Modify: `src/services/engine/presentation/sceneBodyLabels.ts:181` (reads `star.positionMpc`) — plus both places that assert why: the inline comment at `:178-179` and the module header at `:167-168`
- Modify: `src/services/engine/data/createEngineData.ts`
- Modify: `src/services/engine/helpers/extractSelectionRow.ts:49-65` — the `body` arm's `'positionMpc' in body ? body.positionMpc : null` fallback (`:56`) exists ONLY because `StarBody` carries the field today (its own comment says so at `:53`); once anchors are seeded, `deriveBodyStates(CONST_J2000).get(body.id)` resolves every body including stars, so the fallback and its `in` narrowing become dead and should come out, not just stop compiling
- Modify: `src/services/engine/frame/partitionStarsByResolution.ts:79` and `src/@types/rendering/StarPointRenderer.d.ts:26-34` and `src/services/gpu/renderers/bodies/starPointRenderer.ts:183-219` (esp. `:197-199`) — see below, this is the widest-reaching consumer the earlier grill/spec pass did not name
- Delete: `tests/@types/scene/StarBody.test.ts` — a runtime `expectTypeOf` + object-literal-shape test, exactly the pattern the 2026-07-10 audit deleted the whole `tests/@types/` tree for (testing.md). It pins the exact field this task removes; deleting it is part of this task, not drift to fix later.

`StarBody` becomes identity + photometry only, matching `PlanetBody`, whose docblock (`PlanetBody.d.ts:1-13`) already states the principle: position "live[s] in its `BodyState` … never baked here". The `star` maker's `raDecDistToCartesian` result becomes an `AnchorBody` row rather than a field on the drawn record. All 119 famous stars (the Sun included) become anchors.

Picking is unaffected — it keys on `seedIndexOfBody(star.id, SCENE_STARS)`, not on position.

**`partitionStarsByResolution` is the consumer most likely to be underestimated.** It is the ONE function both star layers call, identically, from `enabled`/`draw`/`drawPick` (six call sites across the two files) to decide the point/sphere split, and it reads `star.positionMpc` at `:79` to compute apparent diameter — its parameter type is `stars: readonly StarBody[]`. Once `StarBody` loses `positionMpc`, this function has no position to compute with unless one is threaded in. `StarPointRenderer.d.ts`'s `setStars(stars: readonly StarBody[])` (`:34`) and `starPointRenderer.ts`'s internal `star.positionMpc[0..2]` reads (`:197-199`) have the same problem one layer down.

**Resolved — the richer shape, not a new parameter and not threading `bodyStates` through six signatures.** The thesis of this whole prep is that position lives in the per-frame state map, not on the record, and both star layers already read that map's owner (`visibleStars(state)`) before ever touching a star's position. So the fix is a small type that pairs a `StarBody` with the ONE frame's resolved position, plus one util that produces it — everything downstream (`partitionStarsByResolution`, `StarPointRenderer.setStars`, the renderer's internal reads) takes that type instead of `StarBody`, and every call site keeps reading `star.positionMpc` exactly as it does today, because the field is still there — just resolved per frame instead of baked on the record.

```ts
// src/@types/scene/PositionedStar.d.ts
export type PositionedStar = StarBody & {
  readonly positionMpc: Vec3; // this frame's resolved position, from BodyState — never baked on the record
};
```

```ts
// src/services/engine/frame/positionedVisibleStars.ts
export function positionedVisibleStars(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly PositionedStar[];
```

`positionedVisibleStars` zips `visibleStars(state)` with `sceneBodyStates(state, ctx).get(star.id)!.positionMpc` — the same `sceneBodyStates(state, ctx)` seam `cloudShellLayer.ts:95,134` already uses to read a live body position inside both `enabled` and `draw`. The non-null assertion is backed by this task's own totality test (below): every seeded star has a matching anchor by construction, so the lookup cannot miss.

Signature deltas that follow from this:

- `partitionStarsByResolution`'s `stars` param and both return arrays (`spheres`, `points`) become `readonly PositionedStar[]` (was `readonly StarBody[]`) — only the type changes, the body (`star.positionMpc`, `star.radiusKm`, …) is untouched.
- `StarPointRenderer.setStars(stars: readonly PositionedStar[]): void` (was `readonly StarBody[]`) — `starPointRenderer.ts`'s internal `star.positionMpc[0..2]` reads at `:197-199` need no change, only the type they narrow from.
- The six call sites in `starPointsLayer.ts`/`starSpheresLayer.ts` swap their `stars: visibleStars(state)` argument for `stars: positionedVisibleStars(state, ctx)` (both functions have `ctx` in scope at every call site: `enabled(state, ctx)`, `draw(pass, view, ctx, state)`, `drawPick(pass, view, ctx, state)`). `starPointsLayer.ts`'s `draw` already builds a camera-relative copy per star (`{ ...star, positionMpc: [...] }`, `:169-181`) — spreading a `PositionedStar` produces another `PositionedStar`, so that map needs no shape change, only its input's type.

- [x] Add the test `a famous star's drawn position comes from the snapshot` asserting the layer reads the state map, not the record.
- [x] Add the test `every famous star seed has a matching anchor` (totality — a seed with no anchor would render at the origin, and is what makes `positionedVisibleStars`'s non-null lookup safe).
- [x] Add the test `positionedVisibleStars pairs each visible star with the snapshot's position, not a baked one` — a star whose seed position and snapshot position differ (a synthetic fixture) must read back the snapshot value.
- [x] Implement; correct the three stale claims (`sceneBodies.ts:7`, `sceneBodyLabels.ts:167-168,178-179`, `foregroundMaxDistance.ts:21-27`) in the same commit.
- [x] `npm test` → green; `FARTHEST_BODY_MPC` still 2300 pc; no camera-behaviour change (Task 3 already guards this).
- [x] Commit.

---

### Task 7: Orbit-trail capacity derives from the table

**Files:**

- Modify: `src/services/gpu/renderers/bodies/orbitTrailRenderer.ts:52,96-105,164-166`
- Modify: `src/services/engine/frame/passes/orbitTrailsLayer.ts:181`
- Test: `tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts`

`MAX_ORBITS = 24` against 22 rows today, and `orbitTrailsLayer.ts:181` silently truncates with `Math.min(ORBITAL_ELEMENTS.length, MAX_ORBITS)`. The feature brings the table to 61.

**Follow the sibling that is already correct:** `starPointRenderer.ts:172-214` grows its instance buffer when `stars.length > capacityStars`. Match that pattern. Silent truncation becomes a loud failure.

- [x] Add the test `the trail buffer grows past the initial capacity` driving more orbits than the initial allocation.
- [x] Add the test `an over-count draw throws rather than silently truncating`.
- [x] Implement.
- [x] `npm test -- orbitTrail` → passes.
- [x] Commit.

---

### Task 8: Planet capacity, the same treatment

**Files:**

- Modify: `src/services/gpu/renderers/bodies/planetRenderer.ts:61,126-134,197-200`
- Modify: `src/services/gpu/renderers/bodies/bodyPickRenderer.ts:142` (stale comment only)
- Delete: `docs/backlog/2026-07-29-planet-renderer-max-planets-cap.md`
- Modify: `docs/BACKLOG.md` (remove that item's index line)

`MAX_PLANETS = 24` has the identical defect — the draw caps, the pick does not — and is an open backlog item, folded in here by explicit decision. Per the backlog-hygiene convention, picking the item up **deletes both the index line and the detail file in this same commit**.

`bodyPickRenderer.ts:142` claims `SCENE_STARS.length ~= 25`; it is 119. Benign, because spheres resolve nearest-one-at-a-time, but correct the comment rather than inherit it.

- [x] Add the test `the planet buffer grows past the initial capacity`.
- [x] Add the test `pick and draw agree on the planet count` — the asymmetry the backlog item names.
- [x] Implement; correct the stale comment; delete the backlog item and its index line.
- [x] `npm test` → green. `npm run build` → clean.
- [x] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- `deriveBodyStates(CONST_J2000)` bit-for-bit unchanged against the Task 4 fixture.
- No `parentId` identifier remains in `src/`.
- No `positionMpc` field remains on `StarBody`, and no comment still claims one does — `sceneBodies.ts:7`, `sceneBodyLabels.ts:167-168,178-179` and `foregroundMaxDistance.ts:21-27` all read true.
- No `MAX_ORBITS` / `MAX_PLANETS` literal remains.
- `docs/BACKLOG.md` no longer lists the `MAX_PLANETS` item, and its detail file is gone.
- Visual spot-check: the solar system, its trails, and the famous stars look and behave exactly as before, including the camera's landing distance on selecting a famous star.
