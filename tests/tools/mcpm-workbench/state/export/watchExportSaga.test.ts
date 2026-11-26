/**
 * watchExportSaga — the sidecar's `user_file` follows what the trace was built
 * from, not the toggle: a refetch is still in flight when the visitor toggles
 * the file and exports, so the toggle and `points` disagree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '@reduxjs/toolkit';
import { runSaga, stdChannel } from 'redux-saga';
import type { CatalogPoints } from '../../../../../tools/mcpm-workbench/@types/catalog/CatalogPoints';
import type { McpmHarness } from '../../../../../tools/mcpm-workbench/@types/sim/McpmHarness';
import type { UserCatalog } from '../../../../../tools/mcpm-workbench/@types/catalog/UserCatalog';
import type { RenderResources } from '../../../../../tools/mcpm-workbench/@types/render/RenderResources';
import {
  catalogLoaded,
  setUserCatalogOn,
  userCatalogLoaded,
} from '../../../../../tools/mcpm-workbench/src/state/catalog/catalogSlice';
import { exportNpyRequested } from '../../../../../tools/mcpm-workbench/src/state/commands';
import { watchExportSaga } from '../../../../../tools/mcpm-workbench/src/state/export/watchExportSaga';
import { triggerDownload } from '../../../../../tools/mcpm-workbench/src/export/triggerDownload';
import { rootReducer } from '../../../../../tools/mcpm-workbench/src/store/rootReducer';

vi.mock('../../../../../tools/mcpm-workbench/src/export/triggerDownload', () => ({
  triggerDownload: vi.fn(),
}));

const points: CatalogPoints = {
  positions: new Float32Array([1, 2, 3]),
  weight: new Float32Array([4]),
  count: 1,
  sources: [],
};
const userCatalog: UserCatalog = {
  points,
  fileName: 'desi.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  weightStats: { min: 4, median: 4, max: 4 },
};
const weights = { weights: new Float32Array([1]), nanCount: 0, medianWeight: 1 };
const userFile = { fileName: 'desi.csv', settings: userCatalog.settings, nPoints: 1 };

const harness = {
  box: {
    centerMpc: [0, 0, 0],
    sizeMpc: [8, 8, 8],
    dims: [8, 8, 8],
    voxelSizeMpc: 1,
    rotation: [0, 0, 0, 1],
  },
  readbackTrace: async () => ({ data: new Float32Array(1), element: 'f32', dims: [1, 1, 1] }),
} as unknown as McpmHarness;

async function exportedUserFile(actions: readonly Action[]): Promise<unknown> {
  const state = actions.reduce(rootReducer, rootReducer(undefined, { type: 'init' }));
  const resources: RenderResources = {
    gpu: null,
    harness,
    weights,
    graph: null,
    previewBuffer: null,
    epoch: 0,
  };
  const channel = stdChannel();
  const task = runSaga(
    { channel, dispatch: () => {}, getState: () => state, context: { resources } },
    watchExportSaga,
  );
  channel.put(exportNpyRequested());
  await vi.waitFor(() => expect(triggerDownload).toHaveBeenCalledTimes(2));
  task.cancel();
  const sidecar = vi.mocked(triggerDownload).mock.calls[1]![1] as string;
  return JSON.parse(sidecar).provenance.catalog.user_file;
}

afterEach(() => vi.mocked(triggerDownload).mockClear());

describe('watchExportSaga', () => {
  it('names the file built into the trace although it was just toggled off', async () => {
    const userFileOut = await exportedUserFile([
      userCatalogLoaded({ catalog: userCatalog, fitBounds: null }),
      catalogLoaded({ points, weights, bounds: null, userFile }),
      setUserCatalogOn(false),
    ]);

    expect(userFileOut).toMatchObject({ name: 'desi.csv', n_points: 1 });
  });

  it('names no file when the trace was built without it, although it was just toggled on', async () => {
    const userFileOut = await exportedUserFile([
      catalogLoaded({ points, weights, bounds: null, userFile: null }),
      userCatalogLoaded({ catalog: userCatalog, fitBounds: null }),
    ]);

    expect(userFileOut).toBeUndefined();
  });
});
