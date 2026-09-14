# World-arm wheel burst has no per-frame turn clamp

**Raised:** 2026-09-10/11, F1 fix rounds on PR #647 (`f1-fix1-report.md` concern
1; `f1-decay-review.md` finding F2). User ruled: backlog, not this PR.

The body arm's zoom settle prices its per-notch turn on `u = |ln
spentZoomFactor(factor)|`, where `spentZoomFactor` (`src/utils/camera/spentZoomFactor.ts`)
folds a frame's wheel events through a `[0.5, 2]` altitude-step clamp before
the turn is computed — a burst can never buy more settle than it bought zoom.
The world (absolute) arm has no equivalent clamp: `u` is the raw folded
`logZoom`, unbounded.

## Where

- `src/data/camera/orientDecay.ts:7-8` still documents the no-whip property
  ("a reference move beyond `rideBoundRad` in ONE notch is unauthored") — true
  of the ride, not of the decay.
- `src/utils/camera/orientStepRad.ts:12` caps at `capRadPerLogZoom · u` with no
  ceiling on `u` itself; `src/services/engine/camera/levelledPose.ts:32` same.
- `src/services/engine/camera/replayInput.ts:161,213` pass the raw folded
  factor into the world-arm path; nothing clamps it before
  `frameAlignedRoll`/`orientStepRad` see it.
- `zoomedDistance.ts:17-35` clamps only at the collision/recession envelope,
  which does not bound a large in-band burst.

## Measured consequence

`f1-decay-review.md` F2: a 20-event burst that folds to `e²` gives
`frameAlignedRoll` a `u = 2.0` cap — a 115° one-frame roll, versus the
pre-change bound of `rideBoundRad + capRad ≈ 0.4` rad. The standing "Δscreen-up
never exceeds 23° across 16,000 fuzzed notches" guarantee (H4) no longer holds
on the world arm.

## Why the obvious fix doesn't transfer

The body-arm util (`spentZoomFactor`, an eye-distance ratio) is not reusable
here: the world arm's zoom factor applies to **altitude above the pivot's
surface** (`zoomedDistance.ts:17-35`, `distance′ = radiusMpc + (distance −
radiusMpc)·factor`), not to `distance` itself, and which quantity is right
depends on `pivot.radiusMpc` — a fact only the caller (`replayInput`, three
call sites) has. `frameAlignedRoll` cannot derive `u` from its own arguments;
deriving it correctly needs a pivot-aware `spentDistanceFactor(pre, post,
pivot)` util threaded from those three sites — a larger artifact than the
current single threaded parameter, and it was explicitly flagged for a
controller ruling rather than implemented in the fix round.

## Fix shape

Author `spentDistanceFactor(pre, post, pivot)` (mirrors `zoomedDistance`'s
altitude-vs-plain-distance branch on `pivot.radiusMpc`), thread it through
`replayInput`'s three world-arm call sites in place of the raw folded factor,
and drop the now-redundant `Math.abs(Math.log(step.factor))` duplication
(`f1-fix1-report.md` §"Not collected"). Re-verify `driverGoldenTrace.json` —
`f1-fix1-report.md` measured `displayed[6]` moving at the 1e-17 level under the
naive distance-ratio approach, so the correct pivot-aware form needs its own
fixture check.
