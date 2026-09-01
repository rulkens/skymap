/**
 * watchHistogramSaga — moves T20's throttled histogram readback off the
 * frame driver. `takeLeading` on `incrementStep` replaces the old
 * `histogramInFlight` flag; the no-harness + modulo bail runs before any
 * GPU work. Unlike `acceptBuiltHarness` (watchSceneSaga), which disposes an
 * orphaned build from OUTSIDE the generator, the epoch check here runs
 * INSIDE it, after the `yield*` — fine because a `HistogramReadback` is
 * plain CPU data with nothing to dispose.
 */
import { takeLeading, call, put, select, getContext } from 'typed-redux-saga';

import type { WorkbenchSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { HISTOGRAM_INTERVAL_STEPS } from './HISTOGRAM_INTERVAL_STEPS';
import { incrementStep } from '../sim/simSlice';
import { recordHistogramSample } from './histogramSlice';

export function* watchHistogramSaga() {
  yield* takeLeading(incrementStep, function* () {
    const resources = yield* getContext<WorkbenchSagaContext['resources']>('resources');
    const h = resources?.harness;
    if (!resources || !h) return;
    const stepCount = yield* select((s: RootState) => s.sim.stepCount);
    if (stepCount % HISTOGRAM_INTERVAL_STEPS !== 0) return;
    const epoch = resources.epoch;
    try {
      const { counts, sampledCount, densities } = yield* call(() => h.readHistogram());
      if (resources.epoch !== epoch) return; // scene rebuilt mid-readback — drop it
      yield* put(recordHistogramSample({ counts, sampledCount, densities, stepCount }));
    } catch (err) {
      console.error('mcpm-workbench: histogram readback failed', err);
    }
  });
}
