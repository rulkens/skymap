/**
 * tourBody — the beat loop `runTakeover` runs as a tour's takeover body:
 * play every beat in order, racing `exitTakeover` the whole time.
 *
 * ### Why a saga and why only exitTakeover aborts
 *
 * `exitTakeover` is the only abort signal because the tour's clip@95 camera
 * driver swallows drag input: a stray `beginDrag` or `commitCameraPose`
 * should NOT stop the show — the user must dispatch `exitTakeover` explicitly.
 *
 * ### Scene preparation is the first beat's job
 *
 * There is no tour-level setup list: the establishing strip is authored inside
 * the first beat's clip as `hide()`/`scene()` cues, so a tour has one authoring
 * surface. `runTakeover`'s snapshot is taken before this body ever runs, so its
 * restore winds back every in-tour mutation regardless of which beat made it.
 *
 * ### Every beat entry reconstructs its derived scene
 *
 * Before each `visitBeatSaga` the loop merges `computeSceneEntering(i)` — the
 * baseline folded through every scene cue of beats 0..i-1. On the natural path
 * the merge reproduces what the cues already did (dedup makes it visually a
 * no-op); after a mid-fly skip (cues never fired) or a Prev (later cues must
 * unwind) it is the correction. The invariant: the scene at beat i is a pure
 * function of i, never of the navigation path that led there.
 *
 * ### tourStarted/tourEnded stay local, guarded the same way `runTakeover` is
 *
 * `runTakeover` (generic over tour and view) owns the takeover-wide
 * start/restore/end bracket; it knows nothing about `tour.tourId`/`beatIndex`
 * bookkeeping, so this body dispatches its OWN `tourStarted`/`tourEnded` around
 * the beat loop. The `cancelled()` guard on `tourEnded` mirrors `runTakeover`'s
 * for the same reason: on a tour-to-tour `takeLatest` supersede the incoming
 * run's `tourStarted` may already have landed by the time this finally runs,
 * and an unconditional `tourEnded` here would clobber its `tourId` back to ''.
 */

import { call, put, select, take, race, cancelled, delay } from 'typed-redux-saga';

import { visitBeatSaga } from './visitBeatSaga';
import { FOLD_SETTLE_MS } from './foldSettleMs';
import { computeSceneEntering } from './computeSceneEntering';
import { exitTakeover } from '../takeover/takeoverActions';
import { tourStarted, tourEnded } from './tourSlice';
import { clearSelection } from '../selection/selectionSlice';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { mergeSettingsSnapshot } from '../settings/mergeSettingsSnapshot';
import { captureSettings } from '../scene/captureSettings';
import type { RootState } from '../../store/types';
import type { Tour } from '../../@types/animation/tour/Tour';
import type { BeatRange } from '../../@types/animation/tour/BeatRange';

/**
 * Play all beats in order. An optional `range` windows the run to a
 * contiguous slice of beats (the recorder passes one so a single-beat take
 * doesn't replay the whole tour); omitted means the full tour.
 *
 * This is a saga — not a plain async function — because `try/finally` in a
 * generator runs on BOTH natural completion (all beats finish) and
 * cancellation (exitTakeover wins the race, or a superseding takeover
 * cancels this body from outside). A plain async function whose Promise is
 * externally rejected has no equivalent guarantee: the caller must set up a
 * separate teardown path. Here the finally handles both paths with one clause.
 *
 * Only exitTakeover stops the tour. Camera-input actions (`beginDrag`,
 * `commitCameraPose`, …) must NOT abort the run — the clip@95 driver owns
 * the camera during playback and input actions arrive but have no effect on
 * tour progression. Adding a camera-input `take` here would incorrectly end
 * the tour on any background orbit-controls event.
 */
export function* tourBody(tour: Tour, range?: BeatRange): Generator {
  // Activate the tour's own bookkeeping (id + beat position). `runTakeover`
  // already captured the pre-takeover snapshot and marked the takeover source
  // before calling this body.
  yield* put(tourStarted({ tourId: tour.id }));

  // Clear any pre-tour selection: the beats only ever write the `focus` slot,
  // so a clicked halo would otherwise float on screen through the whole run.
  // Focus is cleared with it — `runTakeover`'s snapshot already holds the
  // user's value for the exit restore, and beat 1's own focus() re-establishes
  // the tour's. `select` is deliberately NOT restored: like `hover`, it is
  // ephemeral UI state (see `captureScene`).
  yield* put(clearSelection());

  try {
    yield* race({
      // `run` sequences the beats by INDEX (not a forward-only for-of), so a
      // `'prev'` outcome can step the index back and re-play the previous beat's
      // establishing fly. Advancing off the window's last beat ends the run
      // naturally. An exitTakeover that wins the outer race cancels this arm
      // mid-visitBeatSaga — redux-saga propagates the cancellation into the
      // in-flight playClip call.
      run: call(function* () {
        // Resolve the beat window. Both ends CLAMP into the tour's bounds
        // rather than throw — an authoring edit that shortens the tour must
        // not brick a saved recording command. (`from` clamps against
        // max(last, 0) so an empty tour yields an empty window — from 0 above
        // to -1 — instead of a -1 index.) Indices stay GLOBAL throughout:
        // the beats array is never sliced, because the scene fold below
        // reconstructs the skipped prefix's cues from the same indices.
        const last = tour.beats.length - 1;
        const from = range ? Math.min(Math.max(range.from, 0), Math.max(last, 0)) : 0;
        const to = range ? Math.min(Math.max(range.to, 0), last) : last;

        // The fold's baseline is the settings half of the pre-takeover
        // snapshot — the same read `captureScene` (via `captureSettings`)
        // takes, re-read here rather than threaded from `runTakeover` so
        // this body stays a single self-contained saga.
        const baselineSettings = yield* select(captureSettings);

        let i = from;
        let firstEntry = true;
        while (i <= to) {
          // Re-establish beat i's derived scene (see the module header). The
          // fold needs a FULL settings state: the captured baseline laid over
          // the live state (non-tour clusters pass through untouched). Under a
          // range the fold is also what makes a mid-tour take faithful: it
          // applies the scene cues of beats 0..i-1 even though they never played.
          const live = yield* select((s: RootState) => s.settings);
          const baseline = mergeSettingsSnapshot(live, baselineSettings);
          yield* put(mergeSnapshot(computeSceneEntering(baseline, tour.beats, i)));

          // A windowed take opening mid-tour (from > 0) has just re-created
          // the past in one dispatch — but the store change is not what the
          // viewer sees: the visibility bridge animates source fades (~600 ms)
          // and the label-fade envelope (~300 ms) plays the folded diff as a
          // dissolve. On film the reconstruction must read as "already
          // happened", so the window's opening beat waits for those bridges
          // to finish before its clip starts. Only the FIRST entry needs it:
          // every later fold reproduces cues that just played (a visual
          // no-op), a Prev back to `from` is a live in-tour transition, and a
          // full run's beat-0 fold equals the live baseline. In practice only
          // recorder-driven runs pass a range, so the UI never waits here.
          //
          // POSITION MATTERS: the recorder discards exactly this much virtual
          // time from the START of a take (tools/record/record.ts settle
          // loop), so this delay must stay a windowed run's FIRST virtual-time
          // consumer — after any other timer/waitUntil, the film's head desyncs.
          if (firstEntry && range !== undefined && from > 0) {
            yield* delay(FOLD_SETTLE_MS);
          }
          firstEntry = false;

          // Delegate (not `call`) so the typed `BeatOutcome` return flows back;
          // cancellation from the outer `exit` race still propagates through the
          // yield* into the in-flight worker.
          const outcome = yield* visitBeatSaga(tour.beats[i]!, i);
          // Prev clamps at the window's start (beat 0 on a full run) — a
          // windowed take never steps outside its range.
          i = outcome === 'prev' ? Math.max(from, i - 1) : i + 1;
        }
      }),
      // `exit` is the only abort: an explicit user/system dispatch, not a
      // stray camera-input action.
      exit: take(exitTakeover),
    });
  } finally {
    // See the module header: guarded the same way `runTakeover` guards
    // `takeoverEnded`, for the same clobber reason, one level down.
    if (!(yield* cancelled())) {
      yield* put(tourEnded());
    }
  }
}
