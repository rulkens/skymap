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
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import { DEFAULT_GALAXY_DUST_PARAMS } from '../../../../src/services/engine/galaxyGenerator/v2/defaultGalaxyDustParams';
import { buildExtraSpecs } from '../data/buildExtraSpecs';

const COMPARE_OPEN_INSET_PX = 390;
const COMPARE_CLOSED_INSET_PX = 0;
const REFERENCE_INSET_PX = 340; // the reference thumbnail strip, constant regardless of open/closed

// DUST (LEGACY) / DUST CLOUD pill gates: both patch the OUTGOING copy handed
// to the engine, never the stored `galaxy` params — toggling a pill back on
// must restore exactly the values the sliders still show while it was off.
function paramsForEngine(galaxy: GalaxyParams, render: RenderSettings): GalaxyParams {
  let out = galaxy;
  if (!render.legacyDustEnabled) out = { ...out, spriteDust: 0, dustRingStrength: 0 };
  if (!render.dustCloudEnabled) {
    const dust = out.dust ?? DEFAULT_GALAXY_DUST_PARAMS;
    out = { ...out, dust: { ...dust, cloud: { ...dust.cloud, count: 0 } } };
  }
  return out;
}

/**
 * The same pill gates, applied to every background extra. Extras carry their
 * own randomly-drawn `GalaxyParams` and never pass through `paramsForEngine`,
 * so without this they keep rendering legacy sprite dust after the pill turns
 * it off — the scatter and the hero galaxy visibly disagree about what dust
 * is. Extras have no analytic dust of their own yet (it is primary-gated in
 * splat.wesl), so with the legacy pill off they currently render dustless.
 */
function extrasForEngine(
  specs: readonly ExtraGalaxySpec[],
  render: RenderSettings,
): ExtraGalaxySpec[] {
  return specs.map((spec) => ({ ...spec, params: paramsForEngine(spec.params, render) }));
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
  engine.setFieldTuning(prev.fieldTuning);
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
      next.render.legacyDustEnabled !== prev.render.legacyDustEnabled ||
      next.render.dustCloudEnabled !== prev.render.dustCloudEnabled
    ) {
      void engine.setParams(paramsForEngine(next.galaxy, next.render));
    }

    if (next.render !== prev.render || next.lod !== prev.lod) {
      engine.setRender({ ...next.render, ...next.lod });
    }

    if (next.fieldTuning !== prev.fieldTuning) {
      engine.setFieldTuning(next.fieldTuning);
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
