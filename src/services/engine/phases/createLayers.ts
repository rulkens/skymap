/**
 * createLayers — bootstrap phase, between `initGpu` and `wireSlots` (D7).
 * `create`s every composed Layer in tuple order, seeding its facts key first
 * (Ruling 7), then composes core's contributions with each instance's onto
 * `state.passes` / `.assetRows` / `.fadeRows` / `.layerSlots` / `.selectionKindRows`
 * and asserts the composed sets stay disjoint (D5) — a bad composition throws
 * at boot, not inside a click's swallowed promise.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { SourceType } from '../../../@types/data/SourceType';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';

import { instantiateLayer } from '../layer/instantiateLayer';
import {
  factsReported,
  layerFactsSeeded,
  engineSourceCountReported,
  engineStatusChanged,
} from '../../../state/engine/engineSlice';
import { assertSelectionRowsDisjoint } from '../../../utils/selection/assertSelectionRowsDisjoint';
import { expandCompanionRows } from '../../../utils/loading/expandCompanionRows';
import { CONTENT_PASSES } from '../frame/passes';
import { ASSET_WIRING } from '../wiring/assetWiring';
import { FADE_LAYERS } from '../wiring/fadeLayers';

export async function createLayers(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const phaseLocals = deps.phaseLocals;
  if (!phaseLocals) {
    throw new Error('createLayers: deps.phaseLocals is undefined — initGpu must run first');
  }
  // Narrowed to `const` locals, not read back off `state.gpu.*` inside the `.map`
  // below: a property narrow does not survive a closure boundary, but a `const`
  // binding's does. The contract is "throw naming the missing field", never `!`.
  const fadeBgl = state.gpu.fadeBgl;
  if (fadeBgl === null) throw new Error('createLayers: state.gpu.fadeBgl is null');
  const sourceBgl = state.gpu.sourceBgl;
  if (sourceBgl === null) throw new Error('createLayers: state.gpu.sourceBgl is null');
  const focusBgl = state.gpu.focusBgl;
  if (focusBgl === null) throw new Error('createLayers: state.gpu.focusBgl is null');
  const focusUniform = state.gpu.focusUniform;
  if (focusUniform === null) throw new Error('createLayers: state.gpu.focusUniform is null');
  const uiCtx = state.gpu.uiCtx;
  if (uiCtx === null) throw new Error('createLayers: state.gpu.uiCtx is null');

  const requestRender = (): void => state.subsystems.scheduler.requestRender();
  // Core's "a source's catalog landed" pulse, and everything core does on it
  // (D6, Ruling 3). The running total is `galaxyPointRenderer.totalCount()` by
  // construction — per-source last-reported count, summed, replaced on a tier
  // swap — so the splash's ready echo needs no renderer read of its own.
  const countBySource = new Map<SourceType, number>();
  const reportSourceCount = (source: SourceType, count: number): void => {
    deps.cb.store.dispatch(engineSourceCountReported({ source, count }));
    // A catalog landing IS a content change for the sky capture keyed on it.
    state.contentVersion += 1;
    countBySource.set(source, count);
    if (count > 0) {
      const total = [...countBySource.values()].reduce((sum, n) => sum + n, 0);
      deps.cb.store.dispatch(engineStatusChanged({ kind: 'ready', count: total, source }));
    }
  };

  const instances = deps.composition.layers.map((layer) => {
    const common = {
      ctx: {
        device: phaseLocals.device,
        context: phaseLocals.context,
        format: phaseLocals.format,
        canvas: deps.canvas,
        hdrCapable: uiCtx.hdrCapable,
      },
      fadeBgl,
      sourceBgl,
      focusBgl,
      focusUniform,
      fades: state.subsystems.fades,
      store: deps.cb.store,
      requestRender,
      reportSourceCount,
    };
    // Facts is erased to `undefined` at this composition boundary
    // (`Layer<string, unknown>`), so `publish` can't appear in a `LayerCoreDeps<undefined>`
    // — it's a Layer's own `create(deps: LayerCoreDeps<Facts>)` that sees it typed, once
    // its literal Facts is known (post-PR-D). Built into the literal, not assigned after
    // the fact: `publish` is `readonly` on `LayerCoreDeps`, and the cast below is the one
    // place that erasure boundary is bridged.
    const declaresFacts = layer.facts !== undefined;
    if (declaresFacts) {
      deps.cb.store.dispatch(
        layerFactsSeeded({ layer: layer.name, facts: layer.facts as Record<string, unknown> }),
      );
    }
    const coreDeps = declaresFacts
      ? {
          ...common,
          publish: (patch: Record<string, unknown>) =>
            deps.cb.store.dispatch(factsReported({ layer: layer.name, patch })),
        }
      : common;
    return instantiateLayer(layer, coreDeps as LayerCoreDeps<undefined>);
  });

  state.layers = instances;
  state.passes = [...CONTENT_PASSES, ...instances.flatMap((instance) => instance.passes)];
  // One fold over the whole list: a companion's parent may sit in the other
  // half, and `expandCompanionRows` is only correct over a list holding both.
  state.assetRows = expandCompanionRows([
    ...ASSET_WIRING,
    ...instances.flatMap((instance) => instance.assets),
  ]);
  state.fadeRows = [...FADE_LAYERS, ...instances.flatMap((instance) => instance.fades)];

  const coreAssetKeys = new Set<AssetKey>(ASSET_WIRING.map((row) => row.key));
  const layerSlots = new Map<AssetKey, AssetSlot<unknown, unknown>>();
  for (const instance of instances) {
    for (const row of instance.assets) {
      // Two maps answer "the slot for key K", and `slotFor` consults the Layer
      // one first — so a duplicate would silently SHADOW the other rather than
      // surface, leaving whichever slot core still mints loading into nothing.
      if (coreAssetKeys.has(row.key) || layerSlots.has(row.key)) {
        throw new Error(
          `createLayers: Layer '${instance.name}' mints a slot for asset key ` +
            `'${String(row.key)}', which another row already owns`,
        );
      }
      // Once, here — not per frame: the slot IS the Layer's runtime-owned
      // object, and a second call would mint a second subscriber.
      layerSlots.set(row.key, row.factory({ state, cb: deps.cb }) as AssetSlot<unknown, unknown>);
    }
    // The COSMO slab is the only director a Layer contributes to in (d); NEAR0's
    // producers are core's foreground captions.
    for (const producer of instance.labels) {
      state.subsystems.cosmoLabelDirector.registerProducer(producer);
    }
  }
  state.layerSlots = layerSlots;

  state.selectionKindRows = [
    ...state.selectionKindRows,
    ...instances.flatMap((instance) => instance.selection),
  ];
  assertSelectionRowsDisjoint(state.selectionKindRows);
}
