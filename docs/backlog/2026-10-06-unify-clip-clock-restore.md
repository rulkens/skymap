# Unify the clip clock restore with the takeover scene capture

P5 made the takeover scene capture include the clock, so exhibits and tours restore time through `withSceneSnapshotSaga`. Clips do not use it: `src/state/camera/clipBodySaga.ts` keeps its own `priorTime` read and its own restore in a `finally` (re-anchoring with `pause`/`resume`/`goLiveNowAction`). Two mechanisms now restore the same clock, with different edge handling (live clocks, a pause during the clip).

Fix shape: run clips under the same capture bracket and delete the saga's private restore. Check `watchClipSaga` too, and keep the "nothing drifts under a scripted move" guarantee, which is why the saga pauses the clock for the move.
