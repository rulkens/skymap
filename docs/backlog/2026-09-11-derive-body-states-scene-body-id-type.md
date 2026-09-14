# `deriveBodyStates`' key type is a pre-existing lie (14 casts)

**Raised:** 2026-09-10/11, task 20 (T20) on PR #647
(`.superpowers/sdd/2026-09-01-camera-pivot/task-20-report.md`, "Could not do"
item 13). User ruled: backlog, not this PR.

`deriveBodyStates` (`src/services/engine/frame/deriveBodyStates.ts`) returns a
map keyed by SCENE body ids — string literals like `'mars'`, `'titan'`,
`'moon'`, `'io'` — but every call site casts the result to `ReadonlyMap<BodyId,
BodyState>`, where `BodyId` is the SOURCE-registry body-type union (`'planet' |
'earth' | 'sun' | 'sgr-a-star' | 's-star'`). The two id domains are unrelated;
the cast is a type lie load-bearing enough that retyping the return to its
honest `string` key produced 30+ compile errors across 14 files.

## The 14 cast sites

```
src/state/camera/watchFlyToLonLatSaga.ts:37
src/services/engine/engine.ts:608
src/services/engine/frame/runFrame.ts:100
src/services/engine/helpers/liveWorldPose.ts:17
tests/helpers/camera/simulateCameraFrame.ts:39
tests/services/engine/camera/frameAlignedRoll.test.ts:35
tests/services/engine/camera/clipKeyframeFrames.test.ts:50
tests/services/camera/singularLocusRecession.test.ts:33
tests/services/engine/camera/orientTargetSymmetry.test.ts:37
tests/helpers/camera/makeDriverCtx.ts:38
tests/services/camera/northUpToggle.test.ts:91
tests/services/engine/camera/stepCameraRuntime.test.ts:48
tests/services/engine/camera/stepCameraRuntime.test.ts:69
tests/services/engine/camera/replayInput.test.ts:42
```

All read `as ReadonlyMap<BodyId, BodyState>` (or a `?? (... as ...)` variant).

## Why the try-it revert happened

Retyping `deriveBodyStates`' declared return to its real scene-body-id key
broke `bodyRegions`, `earthFlyout`, `approachTiltedPose`, `assetWiring`,
`extractSelectionRow`, and several test files — all of which genuinely depend
on the loose `string` key today (arbitrary lookups by scene body name that a
narrow `BodyId` union would reject at the call site). Fixing this honestly
needs a real scene-body-id type introduced across those consumers, not a
one-line annotation — out of scope for a fix round.

## Fix shape

1. Introduce a `SceneBodyId` type (or similar) in `src/@types/scene/` covering
   the actual scene body keys (`'mars' | 'titan' | 'moon' | 'io' | …`),
   distinct from `BodyId`'s source-registry union.
2. Change `deriveBodyStates`' declared return to
   `ReadonlyMap<SceneBodyId, BodyState>` and drop the 14 casts.
3. Work through the ~30 compile errors this surfaces in `bodyRegions`,
   `earthFlyout`, `approachTiltedPose`, `assetWiring`, `extractSelectionRow`,
   and the affected tests — each is a real call site that needs to either
   narrow to `SceneBodyId` or accept it directly.

Two of the 14 sites above are this branch's own additions and match the
established (wrong) convention rather than inventing a third; fixing this item
resolves those too.
