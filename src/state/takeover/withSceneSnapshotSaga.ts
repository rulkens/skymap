/**
 * withSceneSnapshotSaga — the bracket tours and exhibits run their bodies in:
 * snapshot the scene, pin the lens, run, restore. The restore sits in a
 * `finally` inside the body, so it lands before `runTakeoverSaga` ends the run
 * and before a superseding takeover snapshots. `exitsLive` swaps the captured clock for
 * a playing live one, for runs whose arrival clock is not the viewer's own (a linked exhibit).
 */
import { call, put, select } from 'typed-redux-saga';

import { captureScene } from '../scene/captureScene';
import { restoreSceneSaga } from '../scene/restoreSceneSaga';
import { mergeSnapshot } from '../settings/mergeSnapshotAction';
import { DEFAULT_FOV_DEG } from '../../data/defaults';

export function* withSceneSnapshotSaga(
  body: () => Generator,
  { exitsLive = false }: { exitsLive?: boolean } = {},
): Generator {
  const captured = yield* select(captureScene, performance.now());
  const snapshot = exitsLive
    ? {
        ...captured,
        time: {
          ...captured.time,
          mode: 'live' as const,
          paused: false,
          rateIndex: 0,
          direction: 1 as const,
        },
      }
    : captured;

  // Every beat pose and exhibit pose is authored against the default lens, and
  // a fit-derived distance (`sphereFitDistance`) silently clamps at
  // `MAX_DISTANCE_MPC` once the FOV narrows — on a portrait phone the
  // Observable Universe shell overflows the frame below ~59°, barely under the
  // 60° default. So the lens is takeover-owned, not viewer-owned, and the
  // snapshot above carries `camera` back out on exit.
  yield* put(mergeSnapshot({ camera: { fovDeg: DEFAULT_FOV_DEG } }));

  try {
    yield* body();
  } finally {
    yield* call(restoreSceneSaga, snapshot);
  }
}
