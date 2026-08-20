/**
 * watchClipSaga — the bridge from the `startClip` / `stopClip` request actions to
 * the engine's clip-player seam.
 *
 * The UI dispatches `startClip(id)` instead of reaching an engine handle. This
 * watcher resolves the id against `clipFactories` — building the clip at the
 * frozen clip-start instant (see the clock-freeze section) so an
 * instant-dependent clip opens on the bodies the frozen frame draws — and runs
 * the hoisted `playClip` seam read from saga context — the same Promise +
 * `[CANCEL]` runner the guided tour awaits — so all of the live-pose resolution,
 * two-frame completion, and cancellation machinery is reused verbatim. The
 * factory lookup lives here, at the action boundary; the seam stays the single
 * internal entry and still takes a resolved `ClipData`.
 *
 * ### Why `takeLatest` + an inner `race(stop)`
 *
 * `takeLatest` makes a second `startClip` cancel the in-flight run; redux-saga
 * propagates that cancellation into the seam `call`, whose `[CANCEL]` hook calls
 * `clipPlayer.stop()` (dispatching `clipEnded`, resetting the opacity channel, and
 * settling the Promise). The inner `race` against `take(stopClip)` gives the same
 * cancellation path an explicit trigger. Both routes converge on the existing
 * stop machinery, so no clipPlayer reference is needed here.
 *
 * A `stopClip` dispatched while nothing is playing is a harmless no-op:
 * `takeLatest` has no active task, so the `take(stopClip)` race arm is never
 * armed and the action is simply dropped.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks. Reading
 * `getContext('playClip')` inside the worker (not at fork time) guarantees the
 * context is populated by the time a `playClip` action actually arrives — the
 * same pattern as `visitBeatSaga` / `watchFocusTweenSaga`.
 *
 * ### Foci are resolved here too, not just in the tour
 *
 * A clip carrying `moveTargetId` / `dollyToId` / `focusId` / `flyPath`-with-
 * `atFocus` cues cannot be compiled until those ids resolve against loaded
 * catalog/structure data — `compileClip` throws on an unresolved cue. The tour
 * path (`visitBeatSaga`) waits on `clipFociReady` then calls `resolveClipFoci`;
 * the standalone clip-play path must do the same, or any focus-bearing clip
 * crashes at the first frame. We mirror that step verbatim so both entry points
 * hand the seam a fully-resolved clip. (Focus-free clips like `flyout` pass
 * through `resolveClipFoci` as a structural no-op.)
 *
 * ### A clip freezes the sim clock and restores it on the way out
 *
 * A clip is a scripted camera move; the scene must not drift underneath it while
 * it plays (choreography and `record-tour` both depend on nothing else moving).
 * So before the run starts we capture the clock's prior `mode` AND `paused` flag,
 * then dispatch the ordinary `pause` — the same re-anchor primitive user-pause
 * uses, so the freeze is continuous (the clock holds exactly the pre-clip derived
 * instant, no jump). When the clip ends OR is cancelled we restore what the clip
 * interrupted, three ways: `goLive` to a fresh wall-clock JD if it was live;
 * `resume` if it was manual AND playing; and NOTHING if it was manual AND already
 * paused — a deliberately-paused clock must stay paused, so un-pausing it would be
 * a bug (the earlier `priorMode`-only restore did exactly that). Skipping the
 * restore there is safe because the clip's own `pause` only re-anchored an
 * already-paused clock, which holds its `anchor.simDays` verbatim (a paused
 * derivation ignores `realMs`) — no sim time moved. The restore sits in a
 * `finally` so it runs on every exit route this saga has — the `run` arm resolving
 * (natural end), the `stop` arm winning (`stopClip`), and `takeLatest` cancelling
 * the task for a re-play. No new clock plumbing: the clip player *sets* the clock
 * through the existing time-slice actions.
 */
import { call, race, take, takeLatest, getContext, put, select } from 'typed-redux-saga';

import { startClip, stopClip } from './clipActions';
import { clipFactories } from '../../data/animation/clips/clipRegistry';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectOrientation } from '../settings/selectors';
import { clipFociReady } from '../tour/clipFociReady';
import { waitUntil } from '../tour/waitUntil';
import { pause, resume } from '../time/timeSlice';
import { goLiveNowAction } from '../time/goLiveNowAction';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { RootState, SagaContext } from '../../store/types';

export function* watchClipSaga() {
  yield* takeLatest(startClip, function* (action) {
    const playClipSeam = yield* getContext<SagaContext['playClip']>('playClip');
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');

    // Freeze the sim clock for the clip's duration, remembering both the mode
    // AND the paused flag to return to. `pause` re-anchors from the current
    // derived instant, so the clock holds the pre-clip sim time verbatim while
    // the scripted move plays.
    const nowMs = performance.now();
    const priorTime = yield* select((state: RootState) => state.time);
    const { mode: priorMode, paused: priorPaused } = priorTime;

    // The frozen clip-start instant. Derive it from the pre-clip time intent at
    // the SAME `nowMs` the `pause` below re-anchors from, so it equals the sim
    // time the clock holds for the whole clip. The clip factory is resolved at
    // this instant: an instant-dependent clip (`earthFlyout`) opens on the body
    // positions the frozen frame draws; static clips ignore the argument.
    const frozenSimDays = deriveSimDays(priorTime, nowMs);
    const clip = clipFactories[action.payload](frozenSimDays);
    yield* put(pause({ nowMs }));
    try {
      yield* race({
        run: call(function* () {
          // Block until every id-bearing cue resolves AND the camera runtime
          // (which carries the FOV resolveClipFoci needs) exists.
          yield* call(
            waitUntil,
            () => clipFociReady(clip.data, resolveDeps()) && cameraRuntime() !== null,
          );
          const rt = cameraRuntime()!;
          // The STEADY orientation basis so a lookAtId bearing encodes through
          // the same frame the render path decodes with (world-invariant aim).
          // The same id pins the clip's frame for its whole run (see playClip's
          // `frame` arg).
          const orientation = yield* select(selectOrientation);
          const frameBasis = ORIENTATION_FRAMES[orientation];
          // Reuse the frozen clip-start instant: the sim clock is paused for the
          // clip's duration (see the module doc), so any body-targeting cue must
          // resolve against the SAME instant the clip factory opened on.
          const resolved = resolveClipFoci(
            clip.data,
            resolveDeps(),
            rt.fovYRad,
            rt.from,
            frozenSimDays,
            frameBasis,
          );
          yield* call(playClipSeam, resolved, orientation);
        }),
        stop: take(stopClip),
      });
    } finally {
      // Runs on natural end, `stopClip`, AND `takeLatest` cancellation. Restore
      // exactly what the clip interrupted:
      //   live            → re-snap to the wall-clock JD now (so "live" is still
      //                     true after the frozen interval).
      //   manual, playing → resume from the frozen instant.
      //   manual, paused  → nothing. The clock was deliberately paused and stays
      //                     paused; resuming it would un-pause a paused clock.
      //                     The clip's own `pause` merely re-anchored an already-
      //                     paused clock, which is a no-op on sim time.
      if (priorMode === 'live') {
        yield* put(goLiveNowAction());
      } else if (!priorPaused) {
        yield* put(resume({ nowMs: performance.now() }));
      }
    }
  });
}
