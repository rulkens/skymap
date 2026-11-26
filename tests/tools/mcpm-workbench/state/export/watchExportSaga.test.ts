/**
 * watchExportSaga — the sidecar describes what the trace was built from, not the
 * store: between a `catalogLoaded` and the debounced rebuild the store already
 * holds the next catalog while the harness still runs the old one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '@reduxjs/toolkit';
import { runSaga, stdChannel } from 'redux-saga';
import type { CatalogPoints } from '../../../../../tools/mcpm-workbench/@types/catalog/CatalogPoints';
import type { UserFileProvenance } from '../../../../../tools/mcpm-workbench/@types/catalog/UserFileProvenance';
import type { McpmHarness } from '../../../../../tools/mcpm-workbench/@types/sim/McpmHarness';
import type { BuildInputs } from '../../../../../tools/mcpm-workbench/@types/render/BuildInputs';
import type { RenderResources } from '../../../../../tools/mcpm-workbench/@types/render/RenderResources';
import { catalogLoaded } from '../../../../../tools/mcpm-workbench/src/state/catalog/catalogSlice';
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
const weights = { weights: new Float32Array([1]), nanCount: 0 };
const userFile: UserFileProvenance = {
  fileName: 'desi.csv',
  settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
  nPoints: 1,
};

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

const otherPoints: CatalogPoints = {
  positions: new Float32Array([1, 2, 3, 4, 5, 6]),
  weight: new Float32Array([4, 5]),
  count: 2,
  sources: [],
};

async function exportedSidecar(
  built: BuildInputs,
  actions: readonly Action[],
): Promise<Record<string, unknown>> {
  const state = actions.reduce(rootReducer, rootReducer(undefined, { type: 'init' }));
  const resources: RenderResources = {
    gpu: null,
    harness,
    built,
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
  return JSON.parse(sidecar).provenance;
}

afterEach(() => vi.mocked(triggerDownload).mockClear());

describe('watchExportSaga', () => {
  it('names the file built into the trace although the store already holds another catalog', async () => {
    const built: BuildInputs = { points, weights, userFile, tier: 'large', agentCount: 1000 };
    const sidecar = await exportedSidecar(built, [
      catalogLoaded({ points: otherPoints, weights, bounds: null, userFile: null }),
    ]);
    const catalog = sidecar.catalog as Record<string, unknown>;

    expect(catalog.n_points).toBe(1);
    expect(catalog.tier).toBe('large');
    expect(sidecar.n_agents).toBe(1000);
    expect(catalog.user_file).toMatchObject({ name: 'desi.csv', n_points: 1 });
  });

  it('names no file when the trace was built without it, although the store now has one', async () => {
    const built: BuildInputs = {
      points: otherPoints,
      weights,
      userFile: null,
      tier: 'medium',
      agentCount: 1000,
    };
    const sidecar = await exportedSidecar(built, [
      catalogLoaded({ points, weights, bounds: null, userFile }),
    ]);
    const catalog = sidecar.catalog as Record<string, unknown>;

    expect(catalog.n_points).toBe(2);
    expect(catalog.user_file).toBeUndefined();
  });
});
