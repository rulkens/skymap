/**
 * The `body` kind is the body Layer's, so before `createLayers` no row resolves Earth or
 * `body-<id>`: the home ref (seeded at boot) and a deep link both wait on the
 * engineStatusChanged pulse `wireSlots` fires after `createLayers`. If either missed it, the app
 * would open with nothing selected or focused.
 */

import { describe, expect, it, vi } from 'vitest';
import { createLayers } from '../../../src/services/engine/phases/createLayers';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { bodyLayerWithoutGpu } from '../../helpers/engine/bodyLayerWithoutGpu';
import { EARTH_HOME } from '../../../src/data/selection/earthHome';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { selectionRowsRoute } from '../../../src/store/constants';
import { createAppStore } from '../../../src/store/createAppStore';
import { NOOP_SAGA_CONTEXT } from '../../support/createTestStore';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../src/@types/engine/BootstrapDeps';

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeState(): EngineState {
  return {
    gpu: {
      fadeBgl: {},
      sourceBgl: {},
      focusBgl: {},
      focusUniform: {},
      uiCtx: { device: {}, context: {}, canvas: {}, hdrCapable: true },
    },
    subsystems: {
      fades: {},
      scheduler: { requestRender: vi.fn() },
      cosmoLabelDirector: { registerProducer: vi.fn() },
      foregroundLabelDirector: { registerProducer: vi.fn() },
    },
    layers: [],
    selectionKindRows: [],
  } as unknown as EngineState;
}

describe('the body selection kind at boot', () => {
  it('the home ref and a body deep link resolve once the body kind composes', async () => {
    const handle = createAppStore();
    const { store } = handle;
    const state = makeState();
    handle.setSagaContext({
      ...NOOP_SAGA_CONTEXT,
      selection: composeSelectionRows(
        () => state.selectionKindRows,
        () => ALL_KINDS_ENABLED,
      ),
    });
    const rows = () => store.getState()[selectionRowsRoute];

    store.dispatch(updateSelectionSelect(EARTH_HOME.focus!.ref));
    store.dispatch(requestFocus({ id: 'body-mars', transition: 'cut' }));
    await flush();
    expect(rows().select).toBeNull();
    expect(rows().focus).toBeNull();

    await createLayers(state, {
      canvas: {},
      cb: { store, runSaga: handle.runSaga },
      composition: { layers: [bodyLayerWithoutGpu] },
      phaseLocals: { device: {}, context: {}, format: 'bgra8unorm' },
    } as unknown as BootstrapDeps);
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();

    expect(rows().select).toMatchObject({ type: 'body', id: 'earth' });
    expect(rows().focus).toMatchObject({ type: 'body', id: 'mars' });
  });
});
