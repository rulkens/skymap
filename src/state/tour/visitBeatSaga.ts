/**
 * visitBeatSaga — the per-beat worker of the guided tour. Returns the outcome
 * the outer loop steers by: `'next'` (advance / auto-advance) or `'prev'`
 * (step back). `exitTour` is NOT handled here — it aborts the whole run via
 * `guidedTourSaga`'s outer race, which cancels this worker mid-flight.
 *
 * ### What each step does and why
 *
 * 1. **Mark the beat active** (`put(beatChanged(index))`): sets the slice's
 *    `beatIndex` for the "02 / 03" readout AND signals the overlay to hide the
 *    previous caption while the establishing fly is in flight. The new beat's
 *    caption is derived (registry + index), so the saga never dispatches caption
 *    text — only the index that selectors resolve it from.
 *
 * 2. **Wait for clip foci AND camera runtime** (`waitUntil`): a clip carrying
 *    `moveTargetId`/`dollyToId`/`focusId` cues cannot resolve until the relevant
 *    catalog data is loaded; `resolveClipFoci` also needs the current FOV, which
 *    is null pre-bootstrap. Poll until both are available. The gate covers BOTH
 *    the establishing clip and the dwell clip, so an id-bearing dwell (a flyPath
 *    ring around a structure, say) resolves like any other clip.
 *
 * 3. **Resolve foci once, then race the fly against navigation**: the resolved
 *    clip IS the establishing move, but it is not a lock — `advanceTour` /
 *    `prevBeat` mid-fly win the race, cancel the clip (the playClip promise's
 *    `[CANCEL]` hook stops the driver where it is), and steer the outer loop
 *    immediately, skipping this beat's dwell. The next beat's enter clip starts
 *    `'live'` from wherever the camera was cut, so a skip is seamless.
 *
 * 4. **Start the dwell** (`put(dwellStarted({ dwellSec }))`): the fly has landed.
 *    The dwell length is the RESOLVED dwell clip's compiled duration — computed
 *    here (the one place the resolved clip exists) and carried on the action so
 *    the overlay's countdown ring can render it without compiling anything.
 *    Bumping the dwell nonce is what fades the caption in and starts the ring —
 *    kept separate from `beatChanged` (fly START) so the ring begins on the
 *    LANDING, not during the fly.
 *
 * 5. **Delegate the pausable hold** (`pausableDwellSaga`): the interruptible
 *    countdown — including pause/resume and the ambient dwell clip — is its own
 *    concern, owned by `pausableDwellSaga`. Its return is this beat's outcome.
 *
 * ### getContext is read INSIDE the worker
 *
 * The engine registers its saga context AFTER the root saga forks, so reading it
 * here (not at the call site) guarantees it is populated by the time the worker
 * runs — same pattern as `watchFocusTweenSaga`.
 */

import { call, put, race, take, getContext, select } from 'typed-redux-saga';

import { advanceTour, prevBeat } from './tourActions';
import { pausableDwellSaga } from './pausableDwellSaga';
import { waitUntil } from './waitUntil';
import { clipFociReady } from './clipFociReady';
import { beatChanged, dwellStarted } from './tourSlice';
import { resolveClipFoci } from '../../services/engine/animation/resolveClipFoci';
import { compileClip } from '../../services/engine/animation/compileClip';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { BeatData } from '../../@types/animation/tour/BeatData';
import type { BeatOutcome } from './pausableDwellSaga';
import type { SagaContext } from '../../store/types';

export type { BeatOutcome };

/**
 * Play one beat: announce the index, wait for clip data, resolve foci, fly,
 * then hand off to the pausable dwell. The outer `guidedTourSaga` loop adjusts
 * its index from the returned outcome.
 */
export function* visitBeatSaga(beat: BeatData, index: number): Generator<unknown, BeatOutcome> {
  // Read context inside the worker — the engine sets it after root-saga forks.
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
  const playClip = yield* getContext<SagaContext['playClip']>('playClip');

  // (1) Announce the beat — sets the index, hides the previous caption.
  yield* put(beatChanged(index));

  // (2) Block until every id-bearing cue — in BOTH clips — resolves AND the
  // camera runtime exists.
  yield* call(
    waitUntil,
    () =>
      (beat.enterClip === undefined || clipFociReady(beat.enterClip, resolveDeps())) &&
      clipFociReady(beat.dwellClip, resolveDeps()) &&
      cameraRuntime() !== null,
  );

  // (3) Resolve foci once, then race the establishing fly against navigation —
  // a mid-fly Next/Prev cancels the clip and steers at once (no dwell). A beat
  // with no `enterClip` is already framed (the previous beat landed here) — the
  // dwell begins immediately and the caption reveals at once.
  if (beat.enterClip !== undefined) {
    const rt = cameraRuntime()!;
    // Steady orientation basis so authored lookAt bearings encode through the
    // committed frame (see resolveClipFoci / orbitAnglesLookingAlong). The same
    // id pins the clip's frame for its whole run (see playClip's `frame` arg).
    const orientation = yield* select(selectOrientation);
    const frameBasis = ORIENTATION_FRAMES[orientation];
    // Off-frame resolve — live sim instant, same derivation as watchGoHomeSaga,
    // so an id-bearing cue targeting a scene body frames on where it is now.
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const enterClip = resolveClipFoci(
      beat.enterClip,
      resolveDeps(),
      rt.fovYRad,
      rt.from,
      simDays,
      frameBasis,
    );
    const winner = yield* race({
      landed: call(playClip, enterClip, orientation),
      next: take(advanceTour),
      prev: take(prevBeat),
    });
    if (winner.next) return 'next';
    if (winner.prev) return 'prev';
  }

  // (4) The fly landed — start the dwell (fades caption in, starts the ring).
  // The dwell length is the resolved dwell clip's compiled duration; carrying
  // it on the action is what lets the ring render without compiling. The
  // runtime is re-read here: the enter clip just moved the camera, and a
  // lookAt in the dwell must bear from where it LANDED, not where it began.
  const rt = cameraRuntime()!;
  const dwellOrientation = yield* select(selectOrientation);
  const dwellBasis = ORIENTATION_FRAMES[dwellOrientation];
  const dwellSimDays = deriveSimDays(yield* select(selectTimeState), performance.now());
  const dwellClip = resolveClipFoci(
    beat.dwellClip,
    resolveDeps(),
    rt.fovYRad,
    rt.from,
    dwellSimDays,
    dwellBasis,
  );
  const dwellSec = compileClip(dwellClip).durationSec;
  yield* put(dwellStarted({ dwellSec }));

  // (5) Hold interactively until the viewer advances / steps back / the timer fires.
  return yield* pausableDwellSaga(dwellClip, dwellSec, dwellOrientation);
}
