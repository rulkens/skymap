import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import {
  engineStatusChanged,
  engineScaleChanged,
  engineSourceCountReported,
  engineStructureCountsChanged,
  engineLoadProgressChanged,
} from '../../../src/state/engine/engineSlice';
import {
  selectEngineStatus,
  selectScale,
  selectSourceCounts,
  selectStructureCounts,
  selectLoadProgress,
} from '../../../src/state/engine/selectors';

const baseSettings = buildInitialSettings();

describe('engine selectors', () => {
  it('selectEngineStatus returns the current engine status', () => {
    const { store } = createAppStore({ settings: baseSettings });
    store.dispatch(engineStatusChanged({ kind: 'loading' }));
    expect(selectEngineStatus(store.getState())).toEqual({ kind: 'loading' });
  });

  it('selectScale returns the current scale-bar descriptor', () => {
    const { store } = createAppStore({ settings: baseSettings });
    store.dispatch(engineScaleChanged({ label: '500 Mpc', widthPx: 80 }));
    expect(selectScale(store.getState())).toEqual({ label: '500 Mpc', widthPx: 80 });
  });

  it('selectSourceCounts returns accumulated per-source counts', () => {
    const { store } = createAppStore({ settings: baseSettings });
    // Source.SDSS = 1
    store.dispatch(engineSourceCountReported({ source: 1, count: 42000 }));
    expect(selectSourceCounts(store.getState())).toEqual({ 1: 42000 });
  });

  it('selectStructureCounts returns the whole-map structure counts record', () => {
    const { store } = createAppStore({ settings: baseSettings });
    // 'cluster' is a valid StructureId
    store.dispatch(engineStructureCountsChanged({ cluster: 375 }));
    expect(selectStructureCounts(store.getState())).toEqual({ cluster: 375 });
  });

  it('selectLoadProgress returns null when no fetch is in flight', () => {
    const { store } = createAppStore({ settings: baseSettings });
    expect(selectLoadProgress(store.getState())).toBeNull();
  });

  it('selectLoadProgress returns the progress state while a fetch is in flight', () => {
    const { store } = createAppStore({ settings: baseSettings });
    const progress = { loadedBytes: 1024, totalBytes: 4096, inFlightCount: 1 };
    store.dispatch(engineLoadProgressChanged(progress));
    expect(selectLoadProgress(store.getState())).toEqual(progress);
  });

  it('all selectors read from the same seeded store', () => {
    // Smoke-check: a fully populated engine state surfaces correctly through
    // every selector from a single store instance.
    const { store } = createAppStore({ settings: baseSettings });
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 500000, source: 1 }));
    store.dispatch(engineScaleChanged({ label: '1 Gpc', widthPx: 120 }));
    store.dispatch(engineSourceCountReported({ source: 1, count: 500000 }));
    store.dispatch(engineStructureCountsChanged({ cluster: 10, supercluster: 5 }));
    store.dispatch(
      engineLoadProgressChanged({ loadedBytes: 2048, totalBytes: 8192, inFlightCount: 2 }),
    );
    const state = store.getState();
    expect(selectEngineStatus(state)).toEqual({ kind: 'ready', count: 500000, source: 1 });
    expect(selectScale(state)).toEqual({ label: '1 Gpc', widthPx: 120 });
    expect(selectSourceCounts(state)).toEqual({ 1: 500000 });
    expect(selectStructureCounts(state)).toEqual({ cluster: 10, supercluster: 5 });
    expect(selectLoadProgress(state)).toEqual({
      loadedBytes: 2048,
      totalBytes: 8192,
      inFlightCount: 2,
    });
  });
});
