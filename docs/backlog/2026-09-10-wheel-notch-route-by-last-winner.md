# Camera: a wheel notch is routed by LAST frame's winner

**Raised:** 2026-09-10, during PR #647's final review. User ruled: later, own change.

Two pre-existing defects with one cause. `replayInput` runs before the winner is
picked, so it routes a notch by `cameraRuntime.register.winner` — last frame's
answer — because the input is already drained by then
(`src/services/engine/camera/replayInput.ts:215`, `:242`).

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

## Fix shape (pre-agreed)

Pick the winner BEFORE draining input, so a notch routes to THIS frame's winner. It
is a stage-order change in `src/services/engine/camera/stepCameraRuntime.ts`; the
design work is un-braiding the order, since `pickWinner` needs the epochs and the
epochs advance after the replay today.

Then re-record `tests/fixtures/camera/driverGoldenTrace.json` with a parse-compared
cell diff in the commit body, and drop the marker at the leg.
