/**
 * watchSwapFormatSaga tests — verifies the saga asks the engine for the
 * right swap-chain format on both trigger actions: the HDR setting toggle
 * AND a live display-capability report (spec D2). The second case is the
 * one a "watch the setting only" saga would miss: capability can drop while
 * the setting stays on, and the desired format must still fall back.
 *
 * Bound to the REAL production saga tree — `createAppStore`, which runs the
 * actual `rootSaga.ts` `mainSaga` — rather than a parallel test-only watcher
 * list. A prior task on this plan shipped a listener test that only
 * exercised a helper in isolation, so the suite stayed green when the real
 * dispatch wiring was swapped for a no-op; running the genuine `mainSaga`
 * means dropping `watchSwapFormatSaga()` from `rootSaga.ts`'s fork list
 * fails these tests, confirmed by mutation (see task-7-report.md).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { NOOP_SAGA_CONTEXT, NOOP_RECONCILE } from '../../support/createTestStore';
import { setHdrEnabled } from '../../../src/state/settings/settingsSlice';
import { engineHdrCapabilityChanged } from '../../../src/state/engine/engineSlice';

describe('watchSwapFormatSaga', () => {
  let store: ReturnType<typeof createAppStore>['store'];
  let applySwapFormat: ReturnType<typeof vi.fn<(desired: GPUTextureFormat) => void>>;

  beforeEach(() => {
    // navigator.gpu is unavailable under jsdom; stub the one method the
    // saga's fallback branch calls.
    vi.stubGlobal('navigator', {
      gpu: { getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm') },
    });

    applySwapFormat = vi.fn<(desired: GPUTextureFormat) => void>();
    const handle = createAppStore();
    store = handle.store;
    handle.setSagaContext({
      ...NOOP_SAGA_CONTEXT,
      reconcile: { ...NOOP_RECONCILE, applySwapFormat },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the saga asks for rgba16float when the toggle turns on with a capable display', () => {
    store.dispatch(engineHdrCapabilityChanged(true));
    store.dispatch(setHdrEnabled(true));

    expect(applySwapFormat).toHaveBeenLastCalledWith('rgba16float');
  });

  it('losing display capability while enabled asks for the preferred format', () => {
    store.dispatch(engineHdrCapabilityChanged(true));
    store.dispatch(setHdrEnabled(true));
    applySwapFormat.mockClear();

    // The setting never changes here — only the display's capability report
    // does. A saga that watches setHdrEnabled alone would never see this.
    store.dispatch(engineHdrCapabilityChanged(false));

    expect(applySwapFormat).toHaveBeenCalledWith('bgra8unorm');
  });
});
