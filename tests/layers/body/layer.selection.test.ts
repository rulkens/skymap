/**
 * The `body` kind is the body Layer's, so before `createLayers` no row claims or extracts
 * anything. The home ref (seeded at boot) waits on the engineStatusChanged pulse `wireSlots`
 * fires after `createLayers`; a focus request instead retires as absent. The boot arrival
 * never races this (it asks once the camera runtime exists, after the rows); a hash change
 * during boot does, and loses its focus.
 */

import { describe, expect, it, vi } from 'vitest';
import { createLayers } from '../../../src/services/engine/phases/createLayers';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { bodyLayerWithoutGpu } from '../../helpers/engine/bodyLayerWithoutGpu';
import { EARTH_HOME } from '../../../src/data/selection/earthHome';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { selectFocusRef, selectPendingFocusId } from '../../../src/state/selection/selectors';
import { engineStatusChanged } from '../../../src/state/engine/engineSlice';
import { selectionRowsRoute } from '../../../src/store/constants';
import { createAppStore } from '../../../src/store/createAppStore';
import { NOOP_SAGA_CONTEXT } from '../../support/createTestStore';
import { NO_KINDS_OFF } from '../../support/noKindsOff';
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
  it('the home ref resolves once the body kind composes', async () => {
    const handle = createAppStore();
    const { store } = handle;
    const state = makeState();
    handle.setSagaContext({
      ...NOOP_SAGA_CONTEXT,
      selection: composeSelectionRows(
        () => state.selectionKindRows,
        () => NO_KINDS_OFF,
      ),
    });
    const rows = () => store.getState()[selectionRowsRoute];

    store.dispatch(updateSelectionSelect(EARTH_HOME.focus!.ref));
    await flush();
    expect(rows().select).toBeNull();

    await createLayers(state, {
      canvas: {},
      cb: { store, runSaga: handle.runSaga },
      composition: { layers: [bodyLayerWithoutGpu] },
      phaseLocals: { device: {}, context: {}, format: 'bgra8unorm' },
    } as unknown as BootstrapDeps);
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    await flush();

    expect(rows().select).toMatchObject({ type: 'body', id: 'earth' });
  });

  it('a request before createLayers retires as absent', async () => {
    const handle = createAppStore();
    handle.setSagaContext({
      ...NOOP_SAGA_CONTEXT,
      selection: composeSelectionRows(
        () => [],
        () => NO_KINDS_OFF,
      ),
    });
    handle.store.dispatch(requestFocus({ id: 'body-mars', transition: 'cut' }));
    await flush();
    expect(selectPendingFocusId(handle.store.getState())).toBeNull();
    expect(selectFocusRef(handle.store.getState())).toBeNull();
  });
});
