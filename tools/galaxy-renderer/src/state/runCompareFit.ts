/**
 * runCompareFit — the "compare against a reference photo" auto-fit run,
 * ported from the spike's `autoFit` handler (`Galaxy Renderer.dc.html`)
 * as a store-driven procedure instead of a component method. Kept out of
 * `engineBridge` because the bridge is a plain diff table (state → engine
 * calls), not an async orchestrator; kept out of the component because the
 * sequence — camera setup, a progress estimate, a coordinate-descent fit, a
 * post-fit render — is exactly the kind of multi-step control flow that's
 * miserable to unit-test through a React tree and trivial to test as a
 * function.
 *
 * The sequence:
 *   1. Dispatch `fitStarted` (resets the compare slice's fit-run fields,
 *      including the 'reading photo…' note that covers the reference-photo
 *      fetch below) BEFORE that fetch starts, not after.
 *   2. Load (or reuse) the reference photo's descriptor at 116px.
 *   3. Point the camera at an inclination inferred from the descriptor's
 *      axis ratio, and stop auto-rotate so the fit's own renders are stable.
 *   4. Warm up 40 frames so that new view is actually on screen before the
 *      fit starts scoring against it.
 *   5. Estimate the total candidate count `autoFit` will evaluate, so
 *      progress can be reported as a fraction rather than a raw counter —
 *      the per-category `nParams` table and the "+6 for the discrete
 *      arm-count sweep" term both mirror `autoFit`'s own candidate
 *      generation (arm sweep, then `passes` rounds of ±1D descent).
 *   6. Run `autoFit`, mirroring each step into the store so the panel can
 *      show live params/progress/score, and mirroring `compare.stopRequested`
 *      into `autoFit`'s stop signal so the panel's "stop" button works.
 *   7. On completion, commit the best params to both the engine and the
 *      store, settle 20 frames, grab a render, and diff its descriptor
 *      against the reference for the match report.
 *   8. Any failure (bad photo, dead render, …) is reported as an error note
 *      rather than thrown — the panel has no other channel to show it.
 *   9. Always end the run: clear `fitting` and restore auto-rotate to
 *      whatever the store's `ui.autoRotate` currently says (not necessarily
 *      what it was when the run started — the user may have toggled it mid
 *      fit).
 */

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { ReferenceGalaxy } from '../../@types/data/ReferenceGalaxy';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';
import type { AppStore } from './createStore';
import { classifyHubbleType } from '../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { elevationFromQ } from '../matcher/elevationFromQ';
import { autoFit } from '../matcher/autoFit';
import { computeDescriptor } from '../matcher/computeDescriptor';
import { dominantArms } from '../matcher/dominantArms';
import { loadImageDescriptor } from '../matcher/loadImageDescriptor';
import { fitFinished, fitProgressed, fitReportSet, fitStarted } from './slices/compareSlice';
import { paramsPatched } from './slices/galaxySlice';

const DESCRIPTOR_SIZE = 116; // same size for the reference load and the post-fit grab
const WARMUP_STEPS = 40;
const SETTLE_STEPS = 20;
const FRAME_MS = 33; // ~30fps stride between synthetic step() timestamps
const ARM_SWEEP_ESTIMATE = 6; // spiral/barred only, mirrors autoFit's discrete arm-count sweep

// nParams per category — one dimension autoFit descends per pass, ×2
// directions, ×`passes` rounds, is the bulk of the progress estimate.
const N_PARAMS: Readonly<Record<GalaxyCategory, number>> = {
  spiral: 8,
  barred: 9,
  elliptical: 1,
  irregular: 5,
  lenticular: 4,
};

// loss → a 1..100 "match score" for display; floors at 1 rather than 0
// so a bad fit still reads as "some" match, not "the panel is broken".
function scoreFromLoss(loss: number): number {
  return Math.max(1, Math.round(100 / (1 + 7 * loss)));
}

export async function runCompareFit(args: {
  readonly engine: GalaxyEngineHandle;
  readonly reference: ReferenceGalaxy; // must have img !== null (UI disables the button otherwise)
  readonly seedParams: GalaxyParams; // current galaxy state merged with reference.params
  readonly store: AppStore;
  readonly descriptorCache: Map<string, GalaxyDescriptor>; // per-session ref-descriptor memo
  readonly loadDescriptor?: typeof loadImageDescriptor; // injectable for tests
}): Promise<void> {
  const { engine, reference, seedParams, store, descriptorCache } = args;
  const loadDescriptor = args.loadDescriptor ?? loadImageDescriptor;
  const category = classifyHubbleType(seedParams.type);

  // Mirrors `compare.stopRequested` into a plain flag `autoFit` polls between
  // candidates (see `AutoFitOptions.signal`). Registered for the whole run —
  // a stop request during the reference-photo load or the warm-up should
  // still short-circuit the fit once it reaches `autoFit`.
  const signal = { stop: false };
  const unsubscribeStop = store.subscribe(() => {
    if (store.getState().compare.stopRequested) signal.stop = true;
  });

  try {
    store.dispatch(fitStarted());

    let referenceDescriptor = descriptorCache.get(reference.id);
    if (!referenceDescriptor) {
      if (reference.img === null) {
        throw new Error(`compare fit: reference '${reference.id}' has no photo`);
      }
      const loaded = await loadDescriptor(reference.img, DESCRIPTOR_SIZE);
      if (!loaded.desc) {
        throw new Error(`compare fit: could not read '${reference.id}''s photo`);
      }
      referenceDescriptor = loaded.desc;
      descriptorCache.set(reference.id, referenceDescriptor);
    }

    const el = elevationFromQ(referenceDescriptor.q, category);
    engine.setAutoRotate(false);
    engine.setView({ az: 0.6, el: el ?? reference.view.el, dist: reference.view.dist });

    const warmT0 = performance.now();
    for (let i = 0; i < WARMUP_STEPS; i++) engine.step(warmT0 + i * FRAME_MS);

    const nParams = N_PARAMS[category];
    const estimate =
      1 +
      (category === 'spiral' || category === 'barred' ? ARM_SWEEP_ESTIMATE : 0) +
      3 * nParams * 2;
    let evaluated = 0;

    const result = await autoFit(engine, referenceDescriptor, seedParams, category, {
      passes: 3,
      size: 112,
      signal,
      onStep: (step) => {
        evaluated++;
        store.dispatch(paramsPatched(step.params));
        store.dispatch(
          fitProgressed({
            progress: Math.min(0.98, evaluated / estimate),
            score: scoreFromLoss(step.loss),
            note: step.note || 'iterating',
          }),
        );
      },
    });

    store.dispatch(paramsPatched(result.params));
    store.dispatch(fitProgressed({ progress: 1, score: scoreFromLoss(result.loss), note: 'done' }));
    await engine.setParams(result.params);

    const settleT0 = performance.now();
    for (let i = 0; i < SETTLE_STEPS; i++) engine.step(settleT0 + i * FRAME_MS);

    const { S, data } = await engine.grab(DESCRIPTOR_SIZE);
    const renderedDescriptor = computeDescriptor(data, S);
    // The spike threw into the catch on a null descriptor here.
    // Skipping the report while still finishing cleanly is the deliberate,
    // more graceful choice.
    if (renderedDescriptor) {
      store.dispatch(
        fitReportSet({
          armsRef: dominantArms(referenceDescriptor),
          armsRen: dominantArms(renderedDescriptor),
          qRef: referenceDescriptor.q,
          qRen: renderedDescriptor.q,
          dustRef: referenceDescriptor.dustIdx,
          dustRen: renderedDescriptor.dustIdx,
        }),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only the note changes on error — `fitProgressed` bundles all three
    // fields, so the current progress/score are re-sent unchanged rather
    // than reset, matching the spike's partial-setState behaviour.
    // `fitScore` may still be its `fitStarted`-reset `null` (a failure before
    // `autoFit` ever reports a step) — no `??` coercion, so null stays null
    // rather than being papered over with a fake score.
    const { fitProgress, fitScore } = store.getState().compare;
    store.dispatch(
      fitProgressed({ progress: fitProgress, score: fitScore, note: 'error: ' + message }),
    );
  } finally {
    unsubscribeStop();
    store.dispatch(fitFinished());
    engine.setAutoRotate(store.getState().ui.autoRotate);
  }
}
