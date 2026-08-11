/**
 * connectEngineBridge — the single imperative boundary between the RTK store
 * and the engine handle. Every other module in this tool only ever dispatches
 * actions or reads state; this is the one place that holds a live
 * `GalaxyEngineHandle` and calls its methods, so the engine's mutable,
 * callback-shaped API never leaks into components or sagas.
 *
 * The bridge is a plain `store.subscribe` diff, not a saga: there's no async
 * orchestration here at all, and RTK already guarantees a fresh slice
 * reference on every real change (each slice's reducer either mutates via
 * Immer, which produces a new reference when something actually changed, or
 * leaves the object alone). Comparing `next.<slice> !== prev.<slice>` is
 * therefore a correct, cheap "did this slice change" test — no deep-equal
 * needed.
 *
 * Every reaction fires immediately, on the same tick as the dispatch that
 * caused it: `galaxy` → `setParams` and `extras.count` → `setExtras` regen on
 * the GPU now (a compute-shader dispatch, ~1-2 ms), not a CPU worker, so
 * there's no per-keystroke cost to collapse. A slider drag still only
 * produces one `setParams` per animation frame, because the RAF-driven
 * pointer handler coalesces intermediate drag positions before ever
 * dispatching — the debouncing already happened upstream of the store.
 *
 * `galaxy` changes are forwarded even while `compare.fitting`, and that's
 * correct rather than merely harmless: `autoFit` drives the engine directly
 * with its own awaited `setParams` per optimisation step, and mirrors each
 * step's result into the `galaxy` slice so the UI can show live progress.
 * That mirroring dispatch runs synchronously inside the fit loop, strictly
 * between the previous step's `grab` and the next step's awaited
 * `setParams` — so the bridge's echoed `setParams(best)` is redundant with
 * the state the engine already holds, not a race with it. It costs one
 * idempotent GPU dispatch per fit step, not a double-generate.
 */

import type { AppStore } from './createStore';
import type { ExtraGalaxySpec } from '../../../../src/@types/galaxy/ExtraGalaxySpec';
import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import { buildExtraSpecs } from '../data/buildExtraSpecs';

const COMPARE_OPEN_INSET_PX = 390;
const COMPARE_CLOSED_INSET_PX = 0;
const REFERENCE_INSET_PX = 340; // the reference thumbnail strip, constant regardless of open/closed

// DUST (LEGACY) pill: patches the OUTGOING copy handed to the engine, never
// the stored `galaxy` params — toggling it back on must restore exactly the
// values the sliders still show while it was off.
function paramsForEngine(galaxy: GalaxyParams, render: RenderSettings): GalaxyParams {
  if (!render.legacyDustEnabled) {
    return { ...galaxy, legacy: { ...galaxy.legacy, spriteDust: 0, dustRingStrength: 0 } };
  }
  return galaxy;
}

/**
 * The legacy-dust pill, applied to every background extra. Extras carry their
 * own randomly-drawn `GalaxyParams` and never pass through `paramsForEngine`,
 * so without this they keep rendering legacy sprite dust after the pill turns
 * it off — the scatter and the hero galaxy visibly disagree about what dust
 * is.
 */
function extrasForEngine(
  specs: readonly ExtraGalaxySpec[],
  render: RenderSettings,
): ExtraGalaxySpec[] {
  return specs.map((spec) => ({ ...spec, params: paramsForEngine(spec.params, render) }));
}

/**
 * DUST CLOUD pill: same "patch the outgoing copy, never the stored state"
 * idiom as `paramsForEngine`, now on `fieldTuning` since the tier moved off
 * `galaxy.dust` — one gate for the whole scene (central galaxy AND every
 * extra alike) rather than a per-`GalaxyParams` patch repeated per extra.
 */
function fieldTuningForEngine(
  tuning: GalaxyFieldTuning,
  render: RenderSettings,
): GalaxyFieldTuning {
  if (render.dustCloudEnabled) return tuning;
  return { ...tuning, dust: { ...tuning.dust, cloud: { ...tuning.dust.cloud, count: 0 } } };
}

export function connectEngineBridge(
  store: AppStore,
  engine: GalaxyEngineHandle,
  deps?: { readonly rng?: () => number },
): () => void {
  const rng = deps?.rng ?? Math.random;

  let prev = store.getState();

  // Initial sync — the boot render, fired immediately like every other
  // reaction below.
  engine.setRender({ ...prev.render, ...prev.lod });
  engine.setFieldTuning(fieldTuningForEngine(prev.fieldTuning, prev.render));
  engine.setInsets(
    prev.compare.open ? COMPARE_OPEN_INSET_PX : COMPARE_CLOSED_INSET_PX,
    REFERENCE_INSET_PX,
  );
  engine.setAutoRotate(prev.ui.autoRotate);
  void engine.setParams(paramsForEngine(prev.galaxy, prev.render));

  const unsubscribe = store.subscribe(() => {
    const next = store.getState();

    if (
      next.galaxy !== prev.galaxy ||
      next.render.legacyDustEnabled !== prev.render.legacyDustEnabled
    ) {
      void engine.setParams(paramsForEngine(next.galaxy, next.render));
    }

    if (next.render !== prev.render || next.lod !== prev.lod) {
      engine.setRender({ ...next.render, ...next.lod });
    }

    if (
      next.fieldTuning !== prev.fieldTuning ||
      next.render.dustCloudEnabled !== prev.render.dustCloudEnabled
    ) {
      engine.setFieldTuning(fieldTuningForEngine(next.fieldTuning, next.render));
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
      if (next.extras.enabled) {
        void engine.setExtras(
          extrasForEngine(buildExtraSpecs(next.extras.count, rng), next.render),
        );
      } else {
        void engine.setExtras([]);
      }
    } else if (next.extras.regenNonce !== prev.extras.regenNonce) {
      void engine.setExtras(extrasForEngine(buildExtraSpecs(next.extras.count, rng), next.render));
    } else if (next.extras.enabled && next.extras.count !== prev.extras.count) {
      void engine.setExtras(extrasForEngine(buildExtraSpecs(next.extras.count, rng), next.render));
    }

    prev = next;
  });

  return unsubscribe;
}
