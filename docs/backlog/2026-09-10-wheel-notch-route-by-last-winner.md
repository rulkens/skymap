# Camera: a wheel notch is routed by LAST frame's winner

**Raised:** 2026-09-10, during PR #647's final review. User ruled: later, own change.

Two pre-existing defects with one cause, and it is stage order: the replay runs
BEFORE the winner is picked, so `replayInput` has nothing to route a notch by
except `cameraRuntime.register.winner` — last frame's answer
(`src/services/engine/camera/replayInput.ts:215`, `:242`). A third case (c) has
the same shape one stage later: the replay routes by the STORED arm, not the arm
the fold resolves this frame.

## (a) The notch on a follow→spin hand-off frame is dropped

On the exact frame `followApproach` saturates and hands off to `autoRotate`, the
notch resolves into follow memory (`isFollowDriverId(winnerLastFrame)`) that the
winning spin never adopts. Pinned by the driver golden trace at
`tests/services/engine/frame/driverGoldenTrace.test.ts:189` — "This notch lands on
the hand-off frame and is DROPPED (routed by last frame's winner into follow memory
the spin never adopts)" — the marker added by `e0985c5d4`.

Splitting the follow driver into `followApproach`/`followHold` gave every spin-on
focus a hand-off frame, so this went from rare to once per focus.

## (b) The notch on a spin-OFF frame zooms a frozen base

`spin: { owns: winnerLastFrame === 'autoRotate', … }` still reads true on the frame
autoRotate goes off, so the notch is applied to the pre-spin `base` the spin froze,
and `commitOnEdge` (`src/services/engine/camera/commitOnEdge.ts`) bakes that stale
pose on the same edge.

## (c) The notch on a fly-to's pre-fold frame takes the other zoom

Raised by T19's review (2026-09-10). `routeToSurface` gates on `camera.base.frame`
(`replayInput.ts:104-106`), and the fly-to saga now commits a body arm from
anywhere. Launched from OUTSIDE the band, `base` is a body arm for the one frame
before `projectFramePose` disengages it, so an at-rest notch in that frame runs
`surfaceStep`/`anchoredZoomStep` (and commits its own body arm) where the orbit
zoom was due. Same when the body arm names a body other than the focused one
(`regimeArmFor` rejects it). One notch's scaling in a ≤ 16 ms window, no pose
discontinuity; the fix is routing on the RESOLVED regime, not the stored one —
gating the saga on the band would put the band predicate back in the instrument
(spec §9).

## Fix shape

Route the notch by THIS frame's winner. The routing stage is the replay, so the
winner has to be known above it — and today the pick cannot simply move up, because
both of its arguments are replay OUTPUTS:

- `pickWinner(drivers, rootState, approachDone)` reads the POST-replay EFFECTIVE
  `rootState` — the snapshot with the replay's own actions folded through the camera
  reducer (`src/services/engine/camera/stepCameraRuntime.ts:89-95`). That is
  load-bearing, not incidental: the drivers must see this frame's commits, `endDrag`
  above all, or `orbitDrag` wins one frame too long.
- `approachDone` is `drained.follow.saturated` (`stepCameraRuntime.ts:100-101`) —
  the replay's follow memory.

Not a blocker, contrary to first appearances: the epochs. `pickWinner` takes none
(`src/services/engine/camera/cameraDrivers.ts:38-42`), and `advanceEpochs` already
runs AFTER the pick, consuming `winner.epoch` (`stepCameraRuntime.ts:104-112`).

Two directions, neither worked through:

- Pick from the PRE-replay snapshot and re-establish the `endDrag` guarantee some
  other way — the gesture-end edge is present in the drained steps themselves,
  before the replay folds it.
- Split the pick in two: a ROUTE decision above the replay, needing only the
  pre-replay intent plus last frame's follow memory, with the existing post-replay
  pick kept for the pose. Whether a correct route can be decided on that much is
  the open question.

Either way, re-record `tests/fixtures/camera/driverGoldenTrace.json` with a
parse-compared cell diff in the commit body, and drop the marker at the leg.

## (d) The spin phase the notch zooms off is advanced twice, under two rules

Raised by the wave-end entanglement radar (2026-09-10, finding M3). Same family:
the replay needs a fact the frame has not resolved yet, so it resolves a private
copy.

`replayInput.ts:236-239` advances the autoRotate epoch locally —
`advanceEpoch(ctx.autoRotateEpoch, active ? camera.base : null, nowMs)` — reads
`elapsedMs` off it for `applyWheelZoom`'s `spinElapsedMs`, and throws the row
away (handing it to `advanceEpochs` would keep a fold-time reset the frame's own
rule declines). The frame's advance
(`stepCameraRuntime.ts:106` → `cameraEpochs.ts:59-67`) replays `prev.ref` — a
guaranteed no-op — on every frame the winner is not `autoRotate`.

The two disagree by construction on any frame some other driver wins while
auto-rotate is on: the local advance re-bases on a changed `camera.base` (a
commit from earlier in the same drain) where the frame's does nothing. On that
frame `applyWheelZoom` zooms off a spin position the renderer never showed, and
the commit bakes it — a yaw pop on a wheel notch during auto-rotate, which is
the bug `applyWheelZoom`'s header says it fixed, re-entered through the other
door.

Fix shape: make the spin phase a VALUE rather than a place read twice — resolve
`(base ref, nowMs) → spinElapsedMs` once, above the replay, and let both the
replay and `advanceEpochs` take it. The equivalent: advance the real row before
the replay and let the winner gate only the RESET, never the read. Either
removes the discard, and with it the comment at `replayInput.ts:236-237` that
exists to teach the discard. Golden-trace re-record likely — this moves a phase
the `driverGoldenTrace` fixtures sample.
