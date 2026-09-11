# Camera radar residuals: wake vote, channel expiry, authoredOverride

**Raised:** 2026-09-10/11, wave-end entanglement radar on PR #647
(`.superpowers/sdd/2026-09-01-camera-pivot/wave-end-radar.md`, findings H3,
M4, M5). User ruled: backlog, not this PR.

Three separate residuals from the camera-pivot branch's driver-table
architecture, each a case of one fact re-derived by hand in a second place.

## H3 — `selectCameraActive` restates five driver `isActive` predicates by hand

**Where** — `src/state/camera/selectors.ts:29-38` (the `selectCameraActive`
body) hand-copies each driver's activity test against the table rows at
`src/services/engine/camera/cameraDrivers.ts:187` (clip), `:216` (orbitDrag),
`:258` (tween), `:285` (autoRotate, arm gate included). The follow rows are
covered separately by a third term in a third file
(`src/services/engine/helpers/shouldKeepTicking.ts:26-32`).

**The braid** — "is any camera driver authoring motion this frame?" restated
independently by two watchers, the same shape as the pre-existing
`selectionWakeSaga`/`selectionRowsSaga` knot in `simplicity.md`'s known list.
`selectors.ts:26-28` carries a comment explaining that the auto-rotate term
"carries the same arm gate as the driver it stands for" — the comment is
standing in for the un-braid.

**The cost** — adding a driver row, or changing one's gate (as this branch did
for autoRotate's arm gate), means remembering to edit a selector two
directories away; missing it either pins the loop at 60fps in a body arm or
lets it sleep mid-motion, and no existing test catches either.

**Un-braided shape** — a `wakesLoop` boolean field on each driver-table row,
then `drivers.some((d) => d.wakesLoop && d.isActive(s))`. `runFrame` already
holds `deps.drivers` and already passes `rootState` into `shouldKeepTicking`,
so the wiring exists. ~25 lines; care needed because `selectCameraActive` is
also read from React. No golden-trace impact (wake vote, not pose).

## M4 — two hand-written channel-expiry branches, plus a third rule in `clipPlayer`

**Where** — `src/services/engine/camera/stepCameraRuntime.ts:144-149`
(frameTween → `clearFrameTween`) and `:153-159` (tween → `cancelCameraTween`).
The clip driver's equivalent expiry rule lives separately in
`src/services/engine/subsystems/clipPlayer.ts`.

**The braid** — the generic rule "a timed camera channel whose elapsed has
reached its descriptor's `durationMs` must clear itself" is open-coded per
channel instead of read off `CameraEpochs` (already a five-row record with
`EpochRow` as a derived key type). The two existing branches also differ
silently — the tween branch gates on `winnerId === 'tween'`, the frameTween
branch does not, and the reason lives in a different file
(`EpochRow.d.ts:3-4`).

**The cost** — a third timed channel would add a third copy and a third
undocumented gate choice.

**Un-braided shape** — an expiry row per epoch: `{ epoch, descriptorOf(intent),
onExpire, requiresWin }`, folded once. Three rows replace two branches plus
the `clipPlayer` special case. ~30 lines; no behavior change if the
`requiresWin` flags are transcribed faithfully. Re-run the golden traces —
`stepCameraRuntime`'s header names the two pushed actions' order as contract,
and that ordering must survive the fold.

## M5 — `commitOnEdge.authoredOverride` carries two pipeline stages in one nullable field

**Where** — `src/services/engine/camera/commitOnEdge.ts:29-31,43-48` returns
`authoredOverride: FramedCameraPose | null`; `src/services/engine/frame/projectFramePose.ts:87`
reads it as `register = authoredOverride ?? displayed`.

**The braid** — non-null means the **pre-pin** register; null means "take the
**post-pin** displayed" — the two arms of one `??` are values from opposite
sides of `applyFocusedBodyPivot`. One nullable field is doing "which pose the
frame draws" and "at which pipeline stage that value was captured" at once.

**The cost** — inserting a stage between the pin and `projectFramePose.ts:87`
would only need to update one arm, and the type gives no warning if that's
missed. `commitOnEdge`'s header needs nine lines to explain a two-line
function body because of the two-question return.

**Un-braided shape** — return both poses at the same pipeline stage: either
both pre-pin (let `projectFramePose` pin both), or move the pin inside
`commitOnEdge` so both are post-pin. Either way the `??` disappears. ~15
lines. If the pin moves, re-run both golden traces — expected bit-identical,
but the pin is a pose writer and its ordering is the spec's contract.
