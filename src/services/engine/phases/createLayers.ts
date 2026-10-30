/**
 * createLayers — bootstrap phase, between `initGpu` and `wireSlots` (D8).
 * `create`s every composed Layer, seeding its facts key first (D6, Ruling 6),
 * then composes each instance's contributions onto core's `state.passes` /
 * `.computes` / `.assetRows` / `.slotsByKey` / `.visibilityEntries` / `.selectionKindRows`,
 * asserting the keyed sets stay disjoint (D5) — a bad composition throws at boot.
 * `.label3DProducers` and `.orbitTrailGroups` are unkeyed concatenations instead.
 */

import { put } from 'typed-redux-saga';
import type { SagaIterator, Task } from 'redux-saga';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { SourceCountReport } from '../../../@types/engine/layer/SourceCountReport';
import type { SourceType } from '../../../@types/data/SourceType';
import type { Label2DDirector } from '../../../@types/engine/subsystems/Label2DDirector';

import { composeTerrainHeightAt } from '../layer/composeTerrainHeightAt';
import { instantiateLayer } from '../layer/instantiateLayer';
import { NEAR0, COSMO, slabName } from '../frame/slabs';
import { runLayerFeedSaga } from '../../../state/engine/sagas/runLayerFeedSaga';
import { runLayerSearchSaga } from '../../../state/engine/sagas/runLayerSearchSaga';
import {
  factsReported,
  layerFactsSeeded,
  engineSourceCountReported,
  engineStatusChanged,
} from '../../../state/engine/engineSlice';
import { assertSelectionRowsDisjoint } from '../../../utils/selection/assertSelectionRowsDisjoint';
import { expandCompanionRows } from '../../../utils/loading/expandCompanionRows';
import { concatUniqueRows } from '../../../utils/object/concatUniqueRows';
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';
import { gateComputeByFade } from '../layer/gateComputeByFade';
import { gateLabelProducer } from '../layer/gateLabelProducer';
import { gateOrbitTrailGroup } from '../layer/gateOrbitTrailGroup';
import { gatePassByFade } from '../layer/gatePassByFade';
import { gatePlannerByFade } from '../layer/gatePlannerByFade';
import { gateWorldLabelProducer } from '../layer/gateWorldLabelProducer';
import { LAYER_SLAB_ROW_HEADROOM } from '../../../data/rendering/layerSlabRowHeadroom';
import { CONTENT_PASSES } from '../frame/passes';
import { meshAssetRows } from '../wiring/meshAssetRows';

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
  // Core's "a source's catalog landed" pulse. The running total equals
  // `galaxyPointRenderer.totalCount()` by construction (per-source last count, summed,
  // replaced on tier swap). The echo is per-arrival, so a catalog enabled mid-session
  // echoes too.
  const countBySource = new Map<SourceType, number>();
  function* consumeSourceCountSaga(report: SourceCountReport): SagaIterator {
    yield* put(engineSourceCountReported(report));
    // A catalog landing IS a content change for the sky capture keyed on it.
    state.contentVersion += 1;
    countBySource.set(report.source, report.count);
    if (report.count > 0) {
      const total = [...countBySource.values()].reduce((sum, n) => sum + n, 0);
      yield* put(engineStatusChanged({ kind: 'ready', count: total }));
    }
  }

  // Collected so `state.layers` and `state.layerSagaTasks` assign together below
  // (`RunSaga`'s doc says why `destroy()` needs them).
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
      settings: () => deps.cb.store.getState().settings,
      debugPanelOpen: () => deps.cb.store.getState().ui.debugPanelOpen,
      requestRender,
    };
    // Facts is erased to `undefined` at this boundary (`Layer<string, unknown>`), so
    // `publish` cannot appear in `LayerCoreDeps<undefined>`; the cast below bridges it.
    // Built into the literal because `publish` is `readonly`.
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
    // Feeds are tasks on the same array as `sagas`, so teardown cancels (and closes) them alike.
    const { search, sourceCounts } = instance;
    if (search) {
      layerSagaTasks.push(deps.cb.runSaga(() => runLayerSearchSaga(layer.name, search)));
    }
    if (sourceCounts) {
      layerSagaTasks.push(
        deps.cb.runSaga(() => runLayerFeedSaga(sourceCounts, consumeSourceCountSaga)),
      );
    }
    return instance;
  });

  state.layers = instances;
  state.layerSagaTasks = layerSagaTasks;
  // `expandFrameOrder` resolves a FRAME_ORDER name by the FIRST pass answering to it and
  // `checkFrameOrder` counts lines, so a core pass left under a name a Layer contributes
  // would keep drawing silently, the Layer's version never reached.
  // Fade/label gating is applied here once, so executors never see those declarations.
  state.passes = concatUniqueRows('createLayers: passes', (pass) => pass.name, [
    CONTENT_PASSES,
    ...instances.map((instance) => instance.passes),
  ]).map((pass) => gatePassByFade(pass, state));
  state.computes = concatUniqueRows(
    'createLayers: compute rows',
    (compute) => compute.name,
    instances.map((instance) => instance.computes),
  ).map((compute) => gateComputeByFade(compute, state));
  state.planners = concatUniqueRows(
    'createLayers: planner rows',
    (planner) => planner.name,
    instances.map((instance) => instance.planners),
  ).map((planner) => gatePlannerByFade(planner, state));
  // A duplicate key would leave two slots behind one key, and every key-addressed
  // read would answer with only one of them. One fold over the whole list: a
  // companion's parent may sit in the other half, and `expandCompanionRows` is
  // only correct over a list holding both. Layer rows lead: the queue breaks equal
  // ranks by array order, so body textures load ahead of craft meshes.
  state.assetRows = expandCompanionRows(
    concatUniqueRows('createLayers: asset keys', (row) => String(row.key), [
      ...instances.map((instance) => instance.assets),
      meshAssetRows(state),
    ]),
  );
  state.slotsByKey = new Map(state.assetRows.map((row) => [row.key, row.slot]));
  // Static, read off the composition. The ceiling sizes the GPU query set before any
  // Layer exists (`slabRowCeiling.ts`), so the composition must fit its headroom; a
  // duplicate `anchorId` would leave the second row silently unreachable.
  const slabRows = concatUniqueRows(
    'createLayers: slab rows',
    (row) => row.anchorId,
    deps.composition.layers.map((layer) => layer.slabs ?? []),
  );
  if (slabRows.length > LAYER_SLAB_ROW_HEADROOM) {
    throw new Error(
      `createLayers: slab rows exceed LAYER_SLAB_ROW_HEADROOM — ${slabRows.length} composed rows, ` +
        `LAYER_SLAB_ROW_HEADROOM is ${LAYER_SLAB_ROW_HEADROOM}`,
    );
  }
  state.slabRows = slabRows;
  // Static, like `slabs`; a duplicate address would put two entries on one controller.
  state.visibilityEntries = concatUniqueRows(
    'createLayers: visibility entries',
    visibilityAddressOf,
    deps.composition.layers.map((layer) => layer.visibility ?? []),
  );
  state.label3DProducers = instances.flatMap((instance) =>
    instance.worldLabels.map(gateWorldLabelProducer),
  );
  state.orbitTrailGroups = instances
    .flatMap((instance) => instance.orbitTrails)
    .map((group) => gateOrbitTrailGroup(group, state));
  state.terrainHeightAt = composeTerrainHeightAt(
    instances.flatMap((instance) =>
      instance.heightAt ? [{ name: instance.name, heightAt: instance.heightAt }] : [],
    ),
  );

  // Two directors, one per slab's screen-space projection; a producer names its slab
  // (`LayerGuides`'s header explains why NEAR0 vs COSMO matters).
  const screenLabelDirectors: Readonly<Record<number, Label2DDirector>> = {
    [NEAR0]: state.subsystems.foregroundLabelDirector,
    [COSMO]: state.subsystems.cosmoLabelDirector,
  };

  for (const instance of instances) {
    for (const { slab, ...producer } of instance.screenLabels) {
      const director = screenLabelDirectors[slab];
      if (!director) {
        throw new Error(`createLayers: no label director for slab ${slabName(slab)}`);
      }
      director.registerProducer(gateLabelProducer(producer));
    }
  }

  state.selectionKindRows = instances.flatMap((instance) => instance.selection);
  assertSelectionRowsDisjoint(state.selectionKindRows);
}
