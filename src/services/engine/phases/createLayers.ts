/**
 * createLayers — bootstrap phase, between `initGpu` and `wireSlots` (D7).
 * `create`s every composed Layer in tuple order, seeding its facts key first
 * (Ruling 7), then appends each instance's selection rows onto the one array
 * core owns and asserts the composed set stays disjoint (D5) — a bad
 * composition throws at boot, not inside a click's swallowed promise.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { LayerCoreDeps } from '../../../@types/engine/layer/LayerCoreDeps';
import type { SourceType } from '../../../@types/data/SourceType';

import { instantiateLayer } from '../layer/instantiateLayer';
import {
  factsReported,
  layerFactsSeeded,
  engineSourceCountReported,
} from '../../../state/engine/engineSlice';
import { assertSelectionRowsDisjoint } from '../../../utils/selection/assertSelectionRowsDisjoint';

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
  const reportSourceCount = (source: SourceType, count: number): void => {
    deps.cb.store.dispatch(engineSourceCountReported({ source, count }));
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
    const coreDeps =
      layer.facts !== undefined
        ? {
            ...common,
            publish: (patch: Record<string, unknown>) =>
              deps.cb.store.dispatch(factsReported({ layer: layer.name, patch })),
          }
        : common;
    if (layer.facts !== undefined) {
      deps.cb.store.dispatch(
        layerFactsSeeded({ layer: layer.name, facts: layer.facts as Record<string, unknown> }),
      );
    }
    return instantiateLayer(layer, coreDeps as LayerCoreDeps<undefined>);
  });

  state.layers = instances;
  state.selectionKindRows = [
    ...state.selectionKindRows,
    ...instances.flatMap((instance) => instance.selection),
  ];
  assertSelectionRowsDisjoint(state.selectionKindRows);
}
