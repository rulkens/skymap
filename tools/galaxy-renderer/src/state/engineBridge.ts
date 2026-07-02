/**
 * connectEngineBridge — the single imperative boundary between the RTK store
 * and the engine handle. Every other module in this tool only ever dispatches
 * actions or reads state; this is the one place that holds a live
 * `GalaxyEngineHandle` and calls its methods, so the engine's mutable,
 * callback-shaped API never leaks into components or sagas.
 *
 * The bridge is a plain `store.subscribe` diff, not a saga: there's no async
 * orchestration here beyond two debounce timers, and RTK already guarantees a
 * fresh slice reference on every real change (each slice's reducer either
 * mutates via Immer, which produces a new reference when something actually
 * changed, or leaves the object alone). Comparing `next.<slice> !== prev.<slice>`
 * is therefore a correct, cheap "did this slice change" test — no deep-equal
 * needed.
 *
 * Two reactions are trailing-debounced rather than immediate, both ported
 * from the spike's own timings (`Galaxy Renderer.dc.html:506,581`):
 * `galaxy` → `setParams` regenerates the whole star buffer on a worker, so a
 * slider drag would otherwise queue a regen per pixel of movement; `extras`
 * count → `setExtras` rebuilds every satellite galaxy, same cost shape at
 * smaller scale. Everything else (`setRender`, `setAutoRotate`, `setInsets`,
 * `setView`) is a cheap live-uniform write, so those fire immediately.
 *
 * `galaxy` changes are additionally suppressed while `compare.fitting`:
 * `autoFit` (plan 03 Task 8) drives the engine directly with its own
 * `setParams` calls per optimisation step, and mirrors its progress into the
 * `galaxy` slice for the UI to display. Without the suppression the bridge
 * would react to those mirrored writes and schedule a second, redundant
 * regen for every fit step.
 */

import type { AppStore } from './createStore';
import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import { buildExtraSpecs } from '../data/buildExtraSpecs';

const PARAMS_DEBOUNCE_MS = 130; // html:506
const EXTRAS_DEBOUNCE_MS = 220; // html:581
const COMPARE_OPEN_INSET_PX = 390; // html:493
const COMPARE_CLOSED_INSET_PX = 0;
const REFERENCE_INSET_PX = 340; // html:597 — the reference thumbnail strip, constant regardless of open/closed

export function connectEngineBridge(
  store: AppStore,
  engine: GalaxyEngineHandle,
  deps?: { readonly rng?: () => number },
): () => void {
  const rng = deps?.rng ?? Math.random;

  let prev = store.getState();

  // Initial sync — the boot render. Not debounced: there is no burst to
  // collapse yet, and the first frame should reflect the seeded state
  // immediately rather than waiting out a debounce window.
  engine.setRender({ ...prev.render, ...prev.lod });
  engine.setInsets(
    prev.compare.open ? COMPARE_OPEN_INSET_PX : COMPARE_CLOSED_INSET_PX,
    REFERENCE_INSET_PX,
  );
  engine.setAutoRotate(prev.ui.autoRotate);
  void engine.setParams(prev.galaxy);

  let paramsTimer: ReturnType<typeof setTimeout> | null = null;
  let extrasTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleParams = (): void => {
    if (paramsTimer !== null) clearTimeout(paramsTimer);
    paramsTimer = setTimeout(() => {
      paramsTimer = null;
      const state = store.getState();
      // Re-check at fire time, not just at schedule time: a fit can start
      // during the debounce window between the two.
      if (state.compare.fitting) return;
      void engine.setParams(state.galaxy);
    }, PARAMS_DEBOUNCE_MS);
  };

  const scheduleExtras = (): void => {
    if (extrasTimer !== null) clearTimeout(extrasTimer);
    extrasTimer = setTimeout(() => {
      extrasTimer = null;
      const { count } = store.getState().extras;
      void engine.setExtras(buildExtraSpecs(count, rng));
    }, EXTRAS_DEBOUNCE_MS);
  };

  const unsubscribe = store.subscribe(() => {
    const next = store.getState();

    if (next.galaxy !== prev.galaxy) {
      if (next.compare.fitting) {
        // autoFit drives the engine directly; don't double-generate off its
        // per-step echo into the galaxy slice.
        if (paramsTimer !== null) {
          clearTimeout(paramsTimer);
          paramsTimer = null;
        }
      } else {
        scheduleParams();
      }
    }

    if (next.render !== prev.render || next.lod !== prev.lod) {
      engine.setRender({ ...next.render, ...next.lod });
    }

    if (next.ui.autoRotate !== prev.ui.autoRotate) {
      engine.setAutoRotate(next.ui.autoRotate);
    }

    if (next.compare.open !== prev.compare.open) {
      engine.setInsets(
        next.compare.open ? COMPARE_OPEN_INSET_PX : COMPARE_CLOSED_INSET_PX,
        REFERENCE_INSET_PX,
      );
    }

    if (next.compare.viewIntent !== null && next.compare.viewIntent !== prev.compare.viewIntent) {
      engine.setView(next.compare.viewIntent.pose);
    }

    if (next.extras.enabled !== prev.extras.enabled) {
      if (extrasTimer !== null) {
        clearTimeout(extrasTimer);
        extrasTimer = null;
      }
      if (next.extras.enabled) {
        void engine.setExtras(buildExtraSpecs(next.extras.count, rng));
      } else {
        void engine.setExtras([]);
      }
    } else if (next.extras.regenNonce !== prev.extras.regenNonce) {
      void engine.setExtras(buildExtraSpecs(next.extras.count, rng));
    } else if (next.extras.enabled && next.extras.count !== prev.extras.count) {
      scheduleExtras();
    }

    prev = next;
  });

  return () => {
    unsubscribe();
    if (paramsTimer !== null) clearTimeout(paramsTimer);
    if (extrasTimer !== null) clearTimeout(extrasTimer);
  };
}
