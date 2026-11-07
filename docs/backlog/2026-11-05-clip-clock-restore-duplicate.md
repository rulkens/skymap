# Clips restore the clock by hand

`ready` — `clipBodySaga` (`src/state/camera/clipBodySaga.ts:65-74`) pauses the clock at clip start
and restores it in its own `finally` (live → `goLiveNowAction`, playing → `resume`). Tours and
exhibits get the same "give back the clock" rule from the takeover bracket:
`withSceneSnapshotSaga` → `restoreSceneSaga` → `resolveRestoredTime`. Two homes for one rule can
drift (e.g. how a paused manual clock or a rate is restored). Route the clip through the same
capture/restore, or extract the rule both read. Found during the tour-opens-on-Earth ground check
(2026-11-05).
