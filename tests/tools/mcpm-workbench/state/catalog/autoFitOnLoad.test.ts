/**
 * Auto fit on load — the dialog previews `fittedGrid(grid, fitBounds, lanes)` and Load
 * hands the same bounds to watchCatalogSaga, which fits the box and frames the
 * camera beside `catalogLoaded`. Two scene triggers that far apart would build
 * the sim twice, so the real scene saga runs here with `initGpu` counted as the build.
 */
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all } from 'typed-redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserCatalog } from '../../../../../tools/mcpm-workbench/@types/catalog/UserCatalog';
import { catalogBounds } from '../../../../../tools/mcpm-workbench/src/catalog/catalogBounds';
import { deriveGridBox } from '../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { createRenderResources } from '../../../../../tools/mcpm-workbench/src/render/renderResources';
import { userCatalogLoaded } from '../../../../../tools/mcpm-workbench/src/state/catalog/catalogSlice';
import { watchCatalogSaga } from '../../../../../tools/mcpm-workbench/src/state/catalog/watchCatalogSaga';
import { fittedGrid } from '../../../../../tools/mcpm-workbench/src/state/grid/fittedGrid';
import { fitBoxToCatalog } from '../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { framingCameraPose } from '../../../../../tools/mcpm-workbench/src/state/view/framingCameraPose';
import { watchSceneSaga } from '../../../../../tools/mcpm-workbench/src/state/scene/watchSceneSaga';
import { rootReducer } from '../../../../../tools/mcpm-workbench/src/store/rootReducer';
import { resolveAutoFitBounds } from '../../../../../tools/mcpm-workbench/src/grid/autoFit/resolveAutoFitBounds';
import { initGpu } from '../../../../../src/services/gpu/device';

// A build that never finishes: each call is one build started.
vi.mock('../../../../../src/services/gpu/device', () => ({
  initGpu: vi.fn(() => new Promise(() => {})),
}));

// Far from the default origin-centred 200 Mpc cube, so a fit always changes it.
const positions = new Float32Array([300, 10, -40, 340, 30, -20, 320, -10, -60, 310, 0, -50]);
const catalog: UserCatalog = {
  points: { positions, weight: new Float32Array([1, 1, 1, 1]), count: 4, sources: [] },
  fileName: 'far.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  weightStats: { min: 1, median: 1, max: 1 },
};

function setup() {
  const actions: Action[] = [];
  const record: Middleware = () => (next) => (action) => {
    actions.push(action as Action);
    return next(action);
  };
  const saga = createSagaMiddleware({
    context: { canvas: {} as HTMLCanvasElement, resources: createRenderResources() },
  });
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(record, saga),
  });
  saga.run(function* () {
    yield* all([watchCatalogSaga(), watchSceneSaga()]);
  });
  const fits = () => actions.filter((a) => fitBoxToCatalog.match(a));
  return { store, fits };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(initGpu).mockClear();
});

describe('auto fit on load', () => {
  it('stores the box the dialog previewed and frames it, with one fit and one build', async () => {
    const { store, fits } = setup();
    const before = store.getState().grid;
    const fitBounds = resolveAutoFitBounds(
      catalog.points,
      catalogBounds(positions),
      before.autoFitPercent,
    );
    const previewed = fittedGrid(before, fitBounds, {
      agentCount: store.getState().sim.agentCount,
      pointCount: catalog.points.count,
    });

    store.dispatch(userCatalogLoaded({ catalog, fitBounds }));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.getState().grid).toEqual(previewed);
    expect(deriveGridBox(store.getState().grid)).toEqual(deriveGridBox(previewed));
    expect(deriveGridBox(previewed).centerMpc).not.toEqual(deriveGridBox(before).centerMpc);
    expect(fits()).toHaveLength(1);
    expect(initGpu).toHaveBeenCalledTimes(1);
    const { camera } = store.getState().view;
    expect(camera.targetMpc).toEqual(deriveGridBox(previewed).centerMpc);
    expect(camera).toEqual(framingCameraPose(deriveGridBox(previewed)));
  });

  it('leaves the grid slice untouched with auto fit off, and frames the file', async () => {
    const { store, fits } = setup();
    const before = store.getState().grid;

    store.dispatch(userCatalogLoaded({ catalog, fitBounds: null }));
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.getState().grid).toBe(before);
    expect(fits()).toHaveLength(0);
    expect(initGpu).toHaveBeenCalledTimes(1);
    // The file spans 300…340, −10…30, −60…−20 Mpc.
    expect(store.getState().view.camera).toEqual(
      framingCameraPose({ centerMpc: [320, 10, -40], sizeMpc: [40, 40, 40] }),
    );
  });
});
