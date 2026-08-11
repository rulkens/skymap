/**
 * runCompareFit — orchestration tests. These exercise the full sequence
 * (descriptor load → camera setup → warm-up → `fitStarted` → `autoFit` →
 * report → `fitFinished`) against a real `createGalaxyStore` reducer graph
 * and a fake `GalaxyEngineHandle` of typed `vi.fn`s, with an injected
 * `loadDescriptor` so no DOM `Image`/`canvas` is needed. `autoFit` itself is
 * NOT mocked — it's cheap enough (a handful of `computeDescriptor` passes
 * over a small synthetic frame) to run for real, which is what lets these
 * tests assert on genuine store dispatches rather than a stubbed sequence.
 */
import { describe, expect, it, vi } from 'vitest';

import { runCompareFit } from '../../../../tools/galaxy-renderer/src/state/runCompareFit';
import { computeDescriptor } from '../../../../tools/galaxy-renderer/src/matcher/computeDescriptor';
import { loadImageDescriptor } from '../../../../tools/galaxy-renderer/src/matcher/loadImageDescriptor';
import { createGalaxyStore } from '../../../../tools/galaxy-renderer/src/state/createStore';
import { fitStopRequested } from '../../../../tools/galaxy-renderer/src/state/slices/compareSlice';
import { autoRotateSet } from '../../../../tools/galaxy-renderer/src/state/slices/uiSlice';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import type { GalaxyEngineHandle } from '../../../../tools/galaxy-renderer/@types/engine/GalaxyEngineHandle';
import type { GalaxyDescriptor } from '../../../../tools/galaxy-renderer/@types/matcher/GalaxyDescriptor';
import type { ReferenceGalaxy } from '../../../../tools/galaxy-renderer/@types/data/ReferenceGalaxy';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

const SIZE = 24; // tiny grab size — keeps computeDescriptor's pixel loops fast

/** A centred grayscale gaussian blob — enough structure for computeDescriptor
 * to return a non-null descriptor, but not chosen to converge toward any
 * particular params (these tests assert orchestration, not fit quality). */
function blob(size: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / 6;
      const dy = (y - c) / 6;
      const v = Math.min(255, 180 * Math.exp(-0.5 * (dx * dx + dy * dy)));
      const j = (y * size + x) * 4;
      buf[j] = v;
      buf[j + 1] = v;
      buf[j + 2] = v;
      buf[j + 3] = 255;
    }
  }
  return buf;
}

const CANNED_DESCRIPTOR: GalaxyDescriptor = computeDescriptor(blob(SIZE), SIZE)!;

// Elliptical: no arm sweep, only 1 fit dimension — the smallest candidate
// surface `autoFit` can run, which keeps these orchestration tests fast.
const REFERENCE: ReferenceGalaxy = {
  id: 'test-ref',
  short: 'Test',
  name: 'Test galaxy',
  hubbleType: 'E1 — elliptical',
  dist: '—',
  diam: '—',
  arms: '—',
  viewLabel: 'Any',
  notable: '',
  credit: '',
  img: 'https://example.test/ref.png',
  params: { type: 'E1', shared: { bulgeSize: 1 }, legacy: { starCount: 5000 } },
  view: { az: 0.4, el: 0.5, dist: 20 },
};

const SEED_PARAMS: GalaxyParams = { ...DEFAULT_GALAXY_PARAMS, ...REFERENCE.params };

function makeFakeEngine(): {
  engine: GalaxyEngineHandle;
  mocks: {
    readonly setParams: ReturnType<typeof vi.fn<GalaxyEngineHandle['setParams']>>;
    readonly setView: ReturnType<typeof vi.fn<GalaxyEngineHandle['setView']>>;
    readonly setAutoRotate: ReturnType<typeof vi.fn<GalaxyEngineHandle['setAutoRotate']>>;
    readonly step: ReturnType<typeof vi.fn<GalaxyEngineHandle['step']>>;
    readonly grab: ReturnType<typeof vi.fn<GalaxyEngineHandle['grab']>>;
  };
} {
  const setParams = vi.fn<GalaxyEngineHandle['setParams']>(async () => {});
  const setView = vi.fn<GalaxyEngineHandle['setView']>();
  const setAutoRotate = vi.fn<GalaxyEngineHandle['setAutoRotate']>();
  const step = vi.fn<GalaxyEngineHandle['step']>();
  const grab = vi.fn<GalaxyEngineHandle['grab']>(async (size = SIZE) => ({
    S: size,
    data: blob(size),
  }));

  const engine: GalaxyEngineHandle = {
    setParams,
    setRender: vi.fn<GalaxyEngineHandle['setRender']>(),
    setFieldTuning: vi.fn<GalaxyEngineHandle['setFieldTuning']>(),
    setView,
    setAutoRotate,
    setInsets: vi.fn<GalaxyEngineHandle['setInsets']>(),
    setExtras: vi.fn<GalaxyEngineHandle['setExtras']>(async () => {}),
    step,
    sample: vi.fn<GalaxyEngineHandle['sample']>(async () => ({
      mean: 0,
      max: 0,
      litPct: 0,
      stars: 0,
    })),
    grab,
    getCamera: vi.fn<GalaxyEngineHandle['getCamera']>(() => ({ az: 0, el: 0, dist: 1 })),
    getIsmMapTexture: vi.fn<GalaxyEngineHandle['getIsmMapTexture']>(),
    getIsmMapData: vi.fn<GalaxyEngineHandle['getIsmMapData']>(),
    requestRingMeansReadback: vi.fn<GalaxyEngineHandle['requestRingMeansReadback']>(),
    requestArmRidgeSampleReadback: vi.fn<GalaxyEngineHandle['requestArmRidgeSampleReadback']>(),
    requestIsmMapDustCdfScanReadback:
      vi.fn<GalaxyEngineHandle['requestIsmMapDustCdfScanReadback']>(),
    requestDustPlacementReadback: vi.fn<GalaxyEngineHandle['requestDustPlacementReadback']>(),
    requestArmSpurCloudPlacementReadback:
      vi.fn<GalaxyEngineHandle['requestArmSpurCloudPlacementReadback']>(),
    requestArmSpurCloudBufferPeek: vi.fn<GalaxyEngineHandle['requestArmSpurCloudBufferPeek']>(),
    dispose: vi.fn<GalaxyEngineHandle['dispose']>(),
  };

  return { engine, mocks: { setParams, setView, setAutoRotate, step, grab } };
}

function makeLoadDescriptor(): ReturnType<typeof vi.fn<typeof loadImageDescriptor>> {
  return vi.fn<typeof loadImageDescriptor>(async () => ({
    desc: CANNED_DESCRIPTOR,
    width: SIZE,
    height: SIZE,
  }));
}

describe('runCompareFit', () => {
  it('dispatches fitStarted, then a done fitProgressed, then fitFinished, in order', async () => {
    const { engine } = makeFakeEngine();
    const store = createGalaxyStore();
    const loadDescriptor = makeLoadDescriptor();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    await runCompareFit({
      engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store,
      descriptorCache: new Map(),
      loadDescriptor,
    });

    const compareActions = dispatchSpy.mock.calls
      .map(([action]) => action as { type: string; payload?: unknown })
      .filter((action) => action.type.startsWith('compare/'));

    expect(compareActions[0]!.type).toBe('compare/fitStarted');
    expect(compareActions.at(-1)!.type).toBe('compare/fitFinished');

    const doneIndex = compareActions.findIndex(
      (action) =>
        action.type === 'compare/fitProgressed' &&
        (action.payload as { note: string }).note === 'done',
    );
    expect(doneIndex).toBeGreaterThan(0);
    expect(doneIndex).toBeLessThan(compareActions.length - 1);
  });

  it('disables auto-rotate for the run and restores the store setting after', async () => {
    const { engine, mocks } = makeFakeEngine();
    const store = createGalaxyStore();
    store.dispatch(autoRotateSet(true)); // seed a non-default value to prove restore, not just disable
    const loadDescriptor = makeLoadDescriptor();

    expect(store.getState().ui.autoRotate).toBe(true);

    await runCompareFit({
      engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store,
      descriptorCache: new Map(),
      loadDescriptor,
    });

    expect(mocks.setAutoRotate.mock.calls[0]).toEqual([false]);
    expect(mocks.setAutoRotate.mock.calls.at(-1)).toEqual([true]);
  });

  it('stopRequested in the store stops the fit early', async () => {
    const loadDescriptor = makeLoadDescriptor();

    const full = makeFakeEngine();
    const fullStore = createGalaxyStore();
    await runCompareFit({
      engine: full.engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store: fullStore,
      descriptorCache: new Map(),
      loadDescriptor,
    });

    const partial = makeFakeEngine();
    const partialStore = createGalaxyStore();
    const originalDispatch = partialStore.dispatch.bind(partialStore);
    let paramsPatchedCount = 0;
    vi.spyOn(partialStore, 'dispatch').mockImplementation(((action: { type: string }) => {
      const result = originalDispatch(action as Parameters<typeof originalDispatch>[0]);
      if (action.type === 'galaxy/paramsPatched') {
        paramsPatchedCount++;
        // Fire the stop request from a dispatch-triggered observer, exactly
        // as the compare panel's "stop" button would: a store write, not a
        // direct call into the fit loop.
        if (paramsPatchedCount === 2) originalDispatch(fitStopRequested());
      }
      return result;
    }) as typeof partialStore.dispatch);

    await runCompareFit({
      engine: partial.engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store: partialStore,
      descriptorCache: new Map(),
      loadDescriptor,
    });

    expect(partial.mocks.setParams.mock.calls.length).toBeLessThan(
      full.mocks.setParams.mock.calls.length,
    );
    expect(partialStore.getState().compare.fitting).toBe(false);
    expect(partialStore.getState().compare.stopRequested).toBe(false); // fitFinished resets it
  });

  it('a failing image load reports an error note and still finishes', async () => {
    const { engine } = makeFakeEngine();
    const store = createGalaxyStore();
    const loadDescriptor = vi.fn<typeof loadImageDescriptor>(async () => {
      throw new Error('network down');
    });

    await runCompareFit({
      engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store,
      descriptorCache: new Map(),
      loadDescriptor,
    });

    const compare = store.getState().compare;
    expect(compare.fitting).toBe(false);
    expect(compare.fitNote.startsWith('error:')).toBe(true);
    expect(compare.fitNote).toContain('network down');
    // fitStarted dispatches before the (failing) descriptor load, so its
    // reset values — null score, 0.02 progress — are what the error path
    // re-sends unchanged, not some earlier/default state.
    expect(compare.fitScore).toBeNull();
    expect(compare.fitProgress).toBe(0.02);
  });

  it('memoizes the reference descriptor across runs', async () => {
    const store = createGalaxyStore();
    const loadDescriptor = makeLoadDescriptor();
    const cache = new Map<string, GalaxyDescriptor>();

    const first = makeFakeEngine();
    await runCompareFit({
      engine: first.engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store,
      descriptorCache: cache,
      loadDescriptor,
    });

    const second = makeFakeEngine();
    await runCompareFit({
      engine: second.engine,
      reference: REFERENCE,
      seedParams: SEED_PARAMS,
      store,
      descriptorCache: cache,
      loadDescriptor,
    });

    expect(loadDescriptor).toHaveBeenCalledTimes(1);
  });
});
