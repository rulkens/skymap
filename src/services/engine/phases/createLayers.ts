/**
 * createLayers — bootstrap phase, between `initGpu` and `wireSlots` (D8).
 * `create`s every composed Layer, seeding its facts key first (D6, Ruling 6),
 * then composes each instance's contributions onto core's `state.passes` /
 * `.computes` / `.assetRows` / `.fadeRows` / `.layerSlots` / `.selectionKindRows`,
 * asserting the keyed sets stay disjoint (D5) — a bad composition throws at boot.
 * `.label3DProducers` and `.orbitTrailRows` are unkeyed concatenations instead.
 */

import { put } from 'typed-redux-saga';
import type { SagaIterator, Task } from 'redux-saga';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { SourceType } from '../../../@types/data/SourceType';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { Label2DDirector } from '../../../@types/engine/subsystems/Label2DDirector';

import { instantiateLayer } from '../layer/instantiateLayer';
import { NEAR0, COSMO, slabName } from '../frame/slabs';
import { runLayerFeed } from '../../../state/engine/sagas/runLayerFeed';
import {
  factsReported,
  layerFactsSeeded,
  layerSearchReported,
  engineSourceCountReported,
  engineStatusChanged,
} from '../../../state/engine/engineSlice';
import { assertSelectionRowsDisjoint } from '../../../utils/selection/assertSelectionRowsDisjoint';
import { expandCompanionRows } from '../../../utils/loading/expandCompanionRows';
import { concatUniqueRows } from '../../../utils/object/concatUniqueRows';
import { CORE_TRAIL_ELEMENTS } from '../../../data/bodies/coreTrailElements';
import { CONTENT_PASSES } from '../frame/passes';
import { CORE_COMPUTES } from '../frame/computes';
import { CORE_PLANNERS } from '../frame/planners';
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
  // swap — so the splash's ready echo needs no renderer read of its own. The
  // echo is per-arrival, not per-boot: a catalog the user enables mid-session
  // echoes too, where the deleted gate only subscribed to boot-enabled sources.
  const countBySource = new Map<SourceType, number>();
  function* consumeSourceCount(report: SourceCountReport): SagaIterator {
    yield* put(engineSourceCountReported(report));
    // A catalog landing IS a content change for the sky capture keyed on it.
    state.contentVersion += 1;
    countBySource.set(report.source, report.count);
    if (report.count > 0) {
      const total = [...countBySource.values()].reduce((sum, n) => sum + n, 0);
      yield* put(engineStatusChanged({ kind: 'ready', count: total }));
    }
  }

  // Collected here (not read back off `runSaga`'s call sites) so `state.layers = instances`
  // and `state.layerSagaTasks = layerSagaTasks` assign together below — see `RunSaga`'s
  // doc comment for why `destroy()` needs these.
  const layerSagaTasks: Task[] = [];
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
      store: deps.cb.store,
      requestRender,
    };
    // Facts is erased to `undefined` at this composition boundary
    // (`Layer<string, unknown>`), so `publish` cannot appear in a
    // `LayerCoreDeps<undefined>` — only a Layer's own `create` sees it typed,
    // against its literal Facts. Built into the literal rather than assigned
    // after: `publish` is `readonly`, and the cast below is the one place that
    // erasure boundary is bridged.
    const declaresFacts = layer.facts !== undefined;
    if (declaresFacts) {
      deps.cb.store.dispatch(
        layerFactsSeeded({ layer: layer.name, facts: layer.facts as Record<string, unknown> }),
      );
    }
    // The only place a Layer's `sagas` ever run — see `RunSaga`'s doc comment.
    for (const sagaFactory of layer.sagas ?? []) {
      layerSagaTasks.push(deps.cb.runSaga(sagaFactory));
    }
    const coreDeps = declaresFacts
      ? {
          ...common,
          publish: (patch: Record<string, unknown>) =>
            deps.cb.store.dispatch(factsReported({ layer: layer.name, patch })),
        }
      : common;
    const instance = instantiateLayer(layer, coreDeps as LayerCoreDeps<unknown>);
    // The feeds are tasks like `sagas`, on the same array, so `engine.ts`'s
    // teardown cancels them the same way — which is what closes each iterator.
    const { search, sourceCounts } = instance;
    if (search) {
      layerSagaTasks.push(
        deps.cb.runSaga(() =>
          runLayerFeed(search, (rows) => put(layerSearchReported({ layer: layer.name, rows }))),
        ),
      );
    }
    if (sourceCounts) {
      layerSagaTasks.push(deps.cb.runSaga(() => runLayerFeed(sourceCounts, consumeSourceCount)));
    }
    return instance;
  });

  state.layers = instances;
  state.layerSagaTasks = layerSagaTasks;
  // `expandFrameOrder` resolves a FRAME_ORDER name by the FIRST pass that
  // answers to it, and `checkFrameOrder` counts order lines rather than passes —
  // so a core pass left behind under a name a Layer now contributes would keep
  // drawing, silently, with the Layer's own version never reached.
  state.passes = concatUniqueRows('createLayers: passes', (pass) => pass.name, [
    CONTENT_PASSES,
    ...instances.map((instance) => instance.passes),
  ]);
  state.computes = concatUniqueRows('createLayers: compute rows', (compute) => compute.name, [
    CORE_COMPUTES,
    ...instances.map((instance) => instance.computes),
  ]);
  state.planners = concatUniqueRows('createLayers: planner rows', (planner) => planner.name, [
    CORE_PLANNERS,
    ...instances.map((instance) => instance.planners),
  ]);
  // Two maps answer "the slot for key K", and `slotFor` consults the Layer one
  // first — so a duplicate would silently SHADOW the other rather than surface,
  // leaving whichever slot core still mints loading into nothing. One fold over
  // the whole list: a companion's parent may sit in the other half, and
  // `expandCompanionRows` is only correct over a list holding both.
  state.assetRows = expandCompanionRows(
    concatUniqueRows('createLayers: asset keys', (row) => String(row.key), [
      ASSET_WIRING,
      ...instances.map((instance) => instance.assets),
    ]),
  );
  state.fadeRows = [...FADE_LAYERS, ...instances.flatMap((instance) => instance.fades)];
  state.label3DProducers = instances.flatMap((instance) => instance.worldLabels);
  state.orbitTrailRows = [
    ...CORE_TRAIL_ELEMENTS,
    ...instances.flatMap((instance) => instance.orbitTrails),
  ];

  // Two directors, each owning one slab's screen-space projection — a
  // producer names the slab whose director it registers on (`LayerGuides`'s
  // header explains why NEAR0 vs COSMO matters).
  const screenLabelDirectors: Readonly<Record<number, Label2DDirector>> = {
    [NEAR0]: state.subsystems.foregroundLabelDirector,
    [COSMO]: state.subsystems.cosmoLabelDirector,
  };

  const layerSlots = new Map<AssetKey, AssetSlot<unknown, unknown>>();
  for (const instance of instances) {
    for (const row of instance.assets) {
      // Once, here — not per frame: the slot IS the Layer's runtime-owned
      // object, and a second call would mint a second subscriber. `SlotDeps` is
      // passed for signature parity; a Layer row's factory ignores it.
      layerSlots.set(row.key, row.factory({ state, cb: deps.cb }) as AssetSlot<unknown, unknown>);
    }
    for (const { slab, ...producer } of instance.screenLabels) {
      const director = screenLabelDirectors[slab];
      if (!director) {
        throw new Error(`createLayers: no label director for slab ${slabName(slab)}`);
      }
      director.registerProducer(producer);
    }
  }
  state.layerSlots = layerSlots;

  state.selectionKindRows = [
    ...state.selectionKindRows,
    ...instances.flatMap((instance) => instance.selection),
  ];
  assertSelectionRowsDisjoint(state.selectionKindRows);
}
