/**
 * connectEngineBridge — reaction-table tests. Every case drives the real
 * `createGalaxyStore` reducer graph (so RTK's own reference-identity
 * guarantees do the diffing, not a mock) against a fake `GalaxyEngineHandle`
 * of typed `vi.fn`s. The bridge has no debounce or timer machinery left, so
 * every assertion is a plain synchronous check after a dispatch — no fake
 * timers required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { connectEngineBridge } from '../../../../tools/galaxy-renderer/src/state/engineBridge';
import {
  createGalaxyStore,
  type AppStore,
} from '../../../../tools/galaxy-renderer/src/state/createStore';
import { paramsPatched } from '../../../../tools/galaxy-renderer/src/state/slices/galaxySlice';
import { renderPatched } from '../../../../tools/galaxy-renderer/src/state/slices/renderSlice';
import { lodPatched } from '../../../../tools/galaxy-renderer/src/state/slices/lodSlice';
import {
  comparePanelToggled,
  fitFinished,
  fitStarted,
  viewRequested,
} from '../../../../tools/galaxy-renderer/src/state/slices/compareSlice';
import {
  extrasCountSet,
  extrasToggled,
} from '../../../../tools/galaxy-renderer/src/state/slices/extrasSlice';
import { autoRotateSet } from '../../../../tools/galaxy-renderer/src/state/slices/uiSlice';
import { fieldTuningPatched } from '../../../../tools/galaxy-renderer/src/state/slices/fieldTuningSlice';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import { DEFAULT_RENDER_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultLodSettings';
import { DEFAULT_EXTRAS_STATE } from '../../../../tools/galaxy-renderer/src/data/defaultExtrasState';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';
import type { GalaxyEngineHandle } from '../../../../tools/galaxy-renderer/@types/engine/GalaxyEngineHandle';

type EngineMocks = {
  readonly setParams: ReturnType<typeof vi.fn<GalaxyEngineHandle['setParams']>>;
  readonly setRender: ReturnType<typeof vi.fn<GalaxyEngineHandle['setRender']>>;
  readonly setFieldTuning: ReturnType<typeof vi.fn<GalaxyEngineHandle['setFieldTuning']>>;
  readonly setView: ReturnType<typeof vi.fn<GalaxyEngineHandle['setView']>>;
  readonly setAutoRotate: ReturnType<typeof vi.fn<GalaxyEngineHandle['setAutoRotate']>>;
  readonly setInsets: ReturnType<typeof vi.fn<GalaxyEngineHandle['setInsets']>>;
  readonly setExtras: ReturnType<typeof vi.fn<GalaxyEngineHandle['setExtras']>>;
};

function makeFakeEngine(): { engine: GalaxyEngineHandle; mocks: EngineMocks } {
  const mocks: EngineMocks = {
    setParams: vi.fn<GalaxyEngineHandle['setParams']>().mockResolvedValue(undefined),
    setRender: vi.fn<GalaxyEngineHandle['setRender']>(),
    setFieldTuning: vi.fn<GalaxyEngineHandle['setFieldTuning']>(),
    setView: vi.fn<GalaxyEngineHandle['setView']>(),
    setAutoRotate: vi.fn<GalaxyEngineHandle['setAutoRotate']>(),
    setInsets: vi.fn<GalaxyEngineHandle['setInsets']>(),
    setExtras: vi.fn<GalaxyEngineHandle['setExtras']>().mockResolvedValue(undefined),
  };
  const engine: GalaxyEngineHandle = {
    ...mocks,
    step: vi.fn<GalaxyEngineHandle['step']>(),
    sample: vi
      .fn<GalaxyEngineHandle['sample']>()
      .mockResolvedValue({ mean: 0, max: 0, litPct: 0, stars: 0 }),
    grab: vi
      .fn<GalaxyEngineHandle['grab']>()
      .mockResolvedValue({ S: 0, data: new Uint8ClampedArray() }),
    getCamera: vi.fn<GalaxyEngineHandle['getCamera']>().mockReturnValue({ az: 0, el: 0, dist: 1 }),
    getIsmMapTexture: vi.fn<GalaxyEngineHandle['getIsmMapTexture']>(),
    getIsmMapData: vi.fn<GalaxyEngineHandle['getIsmMapData']>(),
    requestRingMeansReadback: vi.fn<GalaxyEngineHandle['requestRingMeansReadback']>(),
    requestArmRidgeSampleReadback: vi.fn<GalaxyEngineHandle['requestArmRidgeSampleReadback']>(),
    requestIsmMapDustCdfScanReadback:
      vi.fn<GalaxyEngineHandle['requestIsmMapDustCdfScanReadback']>(),
    requestDustPlacementReadback: vi.fn<GalaxyEngineHandle['requestDustPlacementReadback']>(),
    requestDustBufferPeek: vi.fn<GalaxyEngineHandle['requestDustBufferPeek']>(),
    requestDustMapChannelSum: vi.fn<GalaxyEngineHandle['requestDustMapChannelSum']>(),
    requestFieldTexChannelSum: vi.fn<GalaxyEngineHandle['requestFieldTexChannelSum']>(),
    requestArmCloudRenderedFluxSum: vi.fn<GalaxyEngineHandle['requestArmCloudRenderedFluxSum']>(),
    requestArmSpurCloudRenderedFluxSum:
      vi.fn<GalaxyEngineHandle['requestArmSpurCloudRenderedFluxSum']>(),
    requestArmSpurCloudPlacementReadback:
      vi.fn<GalaxyEngineHandle['requestArmSpurCloudPlacementReadback']>(),
    requestArmSpurCloudBufferPeek: vi.fn<GalaxyEngineHandle['requestArmSpurCloudBufferPeek']>(),
    requestArmCloudPlacementReadback:
      vi.fn<GalaxyEngineHandle['requestArmCloudPlacementReadback']>(),
    requestArmCloudBufferPeek: vi.fn<GalaxyEngineHandle['requestArmCloudBufferPeek']>(),
    requestDigVeilPlacementReadback:
      vi.fn<GalaxyEngineHandle['requestDigVeilPlacementReadback']>(),
    requestDigVeilBufferPeek: vi.fn<GalaxyEngineHandle['requestDigVeilBufferPeek']>(),
    dispose: vi.fn<GalaxyEngineHandle['dispose']>(),
  };
  return { engine, mocks };
}

/**
 * What the engine actually receives at boot. The DUST (LEGACY) pill is off by
 * default, and the bridge gates it on the OUTGOING copy rather than in the
 * stored `galaxy` slice — so the engine sees the two legacy-dust lanes zeroed
 * while the sliders still hold the values a re-enable must restore. Spelled
 * out rather than routed back through `paramsForEngine`, which would only
 * restate the implementation.
 */
const ENGINE_PARAMS = {
  ...DEFAULT_GALAXY_PARAMS,
  legacy: { ...DEFAULT_GALAXY_PARAMS.legacy, spriteDust: 0, dustRingStrength: 0 },
};

describe('connectEngineBridge', () => {
  let store: AppStore;

  beforeEach(() => {
    store = createGalaxyStore();
  });

  it('connect performs the initial sync', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);

    expect(mocks.setRender).toHaveBeenCalledTimes(1);
    expect(mocks.setRender).toHaveBeenCalledWith({
      ...DEFAULT_RENDER_SETTINGS,
      ...DEFAULT_LOD_SETTINGS,
    });
    expect(mocks.setInsets).toHaveBeenCalledTimes(1);
    expect(mocks.setInsets).toHaveBeenCalledWith(0, 340);
    expect(mocks.setAutoRotate).toHaveBeenCalledTimes(1);
    expect(mocks.setAutoRotate).toHaveBeenCalledWith(false);
    expect(mocks.setParams).toHaveBeenCalledTimes(1);
    expect(mocks.setParams).toHaveBeenCalledWith(ENGINE_PARAMS);

    disconnect();
  });

  it('galaxy slice change calls setParams immediately', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    expect(mocks.setParams).toHaveBeenCalledTimes(1); // initial sync only

    store.dispatch(paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 3 } }));
    expect(mocks.setParams).toHaveBeenCalledTimes(2);
    expect(mocks.setParams).toHaveBeenLastCalledWith({
      ...ENGINE_PARAMS,
      shared: { ...ENGINE_PARAMS.shared, armCount: 3 },
    });

    store.dispatch(paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 4 } }));
    expect(mocks.setParams).toHaveBeenCalledTimes(3);
    expect(mocks.setParams).toHaveBeenLastCalledWith({
      ...ENGINE_PARAMS,
      shared: { ...ENGINE_PARAMS.shared, armCount: 4 },
    });

    disconnect();
  });

  it('render changes call setRender immediately and never setParams', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);

    store.dispatch(renderPatched({ exposure: 1.5 }));

    expect(mocks.setRender).toHaveBeenCalledTimes(2); // initial sync + this change
    expect(mocks.setRender).toHaveBeenLastCalledWith({
      ...DEFAULT_RENDER_SETTINGS,
      exposure: 1.5,
      ...DEFAULT_LOD_SETTINGS,
    });
    expect(mocks.setParams).toHaveBeenCalledTimes(1); // initial sync only — never scheduled

    disconnect();
  });

  it('lod changes ride the same setRender path', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);

    // Derived from the default, not a literal: a literal here silently
    // becomes a no-op the day it coincides with the (seeded) default, and the
    // failure — one fewer setRender call than expected — reads as a bridge
    // bug rather than what it actually is, a fixture collision.
    const patchedLodApparent = DEFAULT_LOD_SETTINGS.lodApparent + 0.01;
    store.dispatch(lodPatched({ lodApparent: patchedLodApparent }));

    expect(mocks.setRender).toHaveBeenCalledTimes(2); // initial sync + this change
    expect(mocks.setRender).toHaveBeenLastCalledWith({
      ...DEFAULT_RENDER_SETTINGS,
      ...DEFAULT_LOD_SETTINGS,
      lodApparent: patchedLodApparent,
    });
    expect(mocks.setParams).toHaveBeenCalledTimes(1); // initial sync only — never scheduled

    disconnect();
  });

  it('view intent fires setView once per nonce', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    const pose = { az: 0.6, el: 0.3, dist: 4 };

    store.dispatch(viewRequested(pose));
    expect(mocks.setView).toHaveBeenCalledTimes(1);
    expect(mocks.setView).toHaveBeenLastCalledWith(pose);

    // Unrelated dispatch must not re-fire setView.
    store.dispatch(autoRotateSet(false));
    expect(mocks.setView).toHaveBeenCalledTimes(1);

    // Same pose, but a fresh request (nonce bump) fires again.
    store.dispatch(viewRequested(pose));
    expect(mocks.setView).toHaveBeenCalledTimes(2);
    expect(mocks.setView).toHaveBeenLastCalledWith(pose);

    disconnect();
  });

  it('compare open/close drives setInsets 390/0', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    expect(mocks.setInsets).toHaveBeenLastCalledWith(0, 340); // initial sync, panel closed

    store.dispatch(comparePanelToggled());
    expect(mocks.setInsets).toHaveBeenCalledTimes(2);
    expect(mocks.setInsets).toHaveBeenLastCalledWith(390, 340);

    store.dispatch(comparePanelToggled());
    expect(mocks.setInsets).toHaveBeenCalledTimes(3);
    expect(mocks.setInsets).toHaveBeenLastCalledWith(0, 340);

    disconnect();
  });

  it('extras enable → immediate setExtras; disable → setExtras([])', () => {
    const { engine, mocks } = makeFakeEngine();
    const rng = mulberry32(7);
    const disconnect = connectEngineBridge(store, engine, { rng });

    store.dispatch(extrasToggled(true));
    expect(mocks.setExtras).toHaveBeenCalledTimes(1);
    expect(mocks.setExtras.mock.calls[0]![0]).toHaveLength(DEFAULT_EXTRAS_STATE.count);

    store.dispatch(extrasToggled(false));
    expect(mocks.setExtras).toHaveBeenCalledTimes(2);
    expect(mocks.setExtras).toHaveBeenLastCalledWith([]);

    disconnect();
  });

  it('extras count change calls setExtras immediately', () => {
    const { engine, mocks } = makeFakeEngine();
    const rng = mulberry32(7);
    const disconnect = connectEngineBridge(store, engine, { rng });

    store.dispatch(extrasToggled(true));
    expect(mocks.setExtras).toHaveBeenCalledTimes(1);

    store.dispatch(extrasCountSet(20));
    expect(mocks.setExtras).toHaveBeenCalledTimes(2);
    expect(mocks.setExtras.mock.calls[1]![0]).toHaveLength(20);

    disconnect();
  });

  it('params changes during compare.fitting still forward to the engine', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    expect(mocks.setParams).toHaveBeenCalledTimes(1); // initial sync only

    store.dispatch(fitStarted());
    store.dispatch(paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 9 } }));
    expect(mocks.setParams).toHaveBeenCalledTimes(2);
    expect(mocks.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ shared: expect.objectContaining({ armCount: 9 }) }),
    );

    store.dispatch(fitFinished());
    store.dispatch(paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 10 } }));
    expect(mocks.setParams).toHaveBeenCalledTimes(3);
    expect(mocks.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ shared: expect.objectContaining({ armCount: 10 }) }),
    );

    disconnect();
  });

  it('fieldTuning slice change calls setFieldTuning with the new object; an unrelated slice change does not', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    expect(mocks.setFieldTuning).toHaveBeenCalledTimes(1); // initial sync only

    const patchedTuning = { ...DEFAULT_GALAXY_FIELD_TUNING, disc: { enabled: false } };
    store.dispatch(fieldTuningPatched(patchedTuning));
    expect(mocks.setFieldTuning).toHaveBeenCalledTimes(2);
    expect(mocks.setFieldTuning).toHaveBeenLastCalledWith(patchedTuning);

    // Unrelated dispatch must not re-fire setFieldTuning — the bridge gates
    // on `next.fieldTuning !== prev.fieldTuning` (reference identity), and
    // this dispatch changes neither that slice nor render.dustCloudEnabled.
    store.dispatch(renderPatched({ exposure: 1.5 }));
    expect(mocks.setFieldTuning).toHaveBeenCalledTimes(2);

    disconnect();
  });

  it('the DUST CLOUD pill zeroes dust.cloud.count for the engine while the store keeps the user count', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);

    const userCount = 12345;
    store.dispatch(
      fieldTuningPatched({
        dust: {
          ...DEFAULT_GALAXY_FIELD_TUNING.dust,
          cloud: { ...DEFAULT_GALAXY_FIELD_TUNING.dust.cloud, count: userCount },
        },
      }),
    );
    store.dispatch(renderPatched({ dustCloudEnabled: false }));

    expect(mocks.setFieldTuning).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dust: expect.objectContaining({ cloud: expect.objectContaining({ count: 0 }) }),
      }),
    );
    // The pill patches only the OUTGOING copy — the stored slice still shows
    // what the sliders display, so re-enabling the pill restores it exactly.
    expect(store.getState().fieldTuning.dust.cloud.count).toBe(userCount);

    disconnect();
  });

  it('disconnect silences everything', () => {
    const { engine, mocks } = makeFakeEngine();
    const disconnect = connectEngineBridge(store, engine);
    disconnect();

    store.dispatch(paramsPatched({ shared: { ...DEFAULT_GALAXY_PARAMS.shared, armCount: 2 } }));
    store.dispatch(renderPatched({ exposure: 2 }));
    store.dispatch(autoRotateSet(false));
    store.dispatch(comparePanelToggled());
    store.dispatch(extrasToggled(true));

    expect(mocks.setParams).toHaveBeenCalledTimes(1); // initial sync only
    expect(mocks.setRender).toHaveBeenCalledTimes(1);
    expect(mocks.setAutoRotate).toHaveBeenCalledTimes(1);
    expect(mocks.setInsets).toHaveBeenCalledTimes(1);
    expect(mocks.setExtras).toHaveBeenCalledTimes(0);
  });
});
