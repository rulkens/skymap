/**
 * createLayers — a composed Layer's `sagas` are forked through `deps.cb.runSaga`
 * at Layer-creation time (the D3 fix round's ruling): `mainSaga` cannot import
 * the composition, so this fork is the ONLY thing that starts one. Proven
 * end-to-end against a real store, not a spy — a saga that never actually
 * forked would leave `TEST_MARKER` un-reacted-to.
 */

import { describe, it, expect, vi } from 'vitest';
import { takeEvery } from 'typed-redux-saga';
import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import { createAppStore } from '../../../../src/store/createAppStore';
import type { Layer } from '../../../../src/@types/engine/layer/Layer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';

function makeState(): EngineState {
  return {
    gpu: {
      fadeBgl: {},
      sourceBgl: {},
      focusBgl: {},
      focusUniform: {},
      uiCtx: { device: {}, context: {}, canvas: {}, hdrCapable: true },
    },
    subsystems: { fades: {}, scheduler: { requestRender: vi.fn() } },
    layers: [],
    selectionKindRows: [],
  } as unknown as EngineState;
}

function makeDeps(
  layers: readonly Layer<string, unknown>[],
  cb: { store: ReturnType<typeof createAppStore>['store']; runSaga: unknown },
): BootstrapDeps {
  return {
    canvas: {},
    cb: { ...cb, setSagaContext: vi.fn() },
    composition: { layers, home: { focus: null, seedSelection: false } },
    frameRef: { current: () => {} },
    allSlots: new Map(),
    phaseLocals: { device: {}, context: {}, format: 'bgra8unorm' },
  } as unknown as BootstrapDeps;
}

describe('createLayers — Layer sagas', () => {
  it("forks a composed Layer's declared saga so it reacts to a dispatched action", async () => {
    const { store, runSaga } = createAppStore();
    let markerSeen = false;
    function* watchMarkerSaga() {
      yield* takeEvery('TEST_MARKER', function* () {
        markerSeen = true;
      });
    }
    const layer: Layer<string, unknown> = {
      name: 'stub',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      sagas: [watchMarkerSaga],
    };
    const state = makeState();

    await createLayers(state, makeDeps([layer], { store, runSaga }));
    store.dispatch({ type: 'TEST_MARKER' });

    expect(markerSeen).toBe(true);
  });
});
