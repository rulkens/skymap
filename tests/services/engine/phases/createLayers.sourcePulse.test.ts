/**
 * createLayers — the catalog-landed pulse core runs a Layer's `sourceCounts`
 * feed through: the count report, the content-version bump the sky capture
 * re-bakes on, and the splash's running-total ready echo (Rulings 3, 13).
 *
 * The puts are collected off the saga's own `dispatch`, not a spy on a real
 * store: redux-saga binds the dispatch it was constructed with, so a
 * `spyOn(store, 'dispatch')` would see none of them.
 */

import { describe, it, expect, vi } from 'vitest';
import { runSaga, stdChannel } from 'redux-saga';
import type { UnknownAction } from '@reduxjs/toolkit';

import { createLayers } from '../../../../src/services/engine/phases/createLayers';
import {
  engineSourceCountReported,
  engineStatusChanged,
} from '../../../../src/state/engine/engineSlice';
import { Source } from '../../../../src/data/sources';
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
    subsystems: {
      fades: {},
      scheduler: { requestRender: vi.fn() },
      cosmoLabelDirector: { registerProducer: vi.fn() },
      foregroundLabelDirector: { registerProducer: vi.fn() },
    },
    contentVersion: 0,
    layers: [],
    layerSagaTasks: [],
    selectionKindRows: [],
  } as unknown as EngineState;
}

function makeDeps(
  layers: readonly Layer<string, unknown>[],
  dispatched: UnknownAction[],
): BootstrapDeps {
  const dispatch = (action: UnknownAction): unknown => (dispatched.push(action), action);
  return {
    canvas: {},
    cb: {
      store: { dispatch, getState: () => ({}) },
      setSagaContext: vi.fn(),
      runSaga: (saga: () => Generator) =>
        runSaga({ channel: stdChannel(), dispatch, getState: () => ({}) }, saga),
    },
    composition: { layers, home: { focus: null, seedSelection: false } },
    frameRef: { current: () => {} },
    allSlots: new Map(),
    phaseLocals: { device: {}, context: {}, format: 'bgra8unorm' },
  } as unknown as BootstrapDeps;
}

describe('createLayers — a Layer sourceCounts feed', () => {
  it('reports each count, bumps the content version and echoes a running-total ready status', async () => {
    const dispatched: UnknownAction[] = [];
    const layer = {
      name: 'stub',
      create: () => ({}),
      destroy: () => {},
      passes: () => [],
      sourceCounts: async function* () {
        yield { source: Source.SDSS, count: 3 };
        yield { source: Source.TwoMRS, count: 4 };
        yield { source: Source.Glade, count: 0 };
      },
    } as unknown as Layer<string, unknown>;
    const state = makeState();

    await createLayers(state, makeDeps([layer], dispatched));
    // The feed is a saga, so its puts land on later microtasks than the
    // synchronous callback it replaced — every pulse consumer `take`s them.
    await Promise.all(state.layerSagaTasks.map((task) => task.toPromise()));

    expect(state.contentVersion).toBe(3);

    const counts = dispatched.filter(engineSourceCountReported.match).map((a) => a.payload);
    expect(counts).toEqual([
      { source: Source.SDSS, count: 3 },
      { source: Source.TwoMRS, count: 4 },
      { source: Source.Glade, count: 0 },
    ]);

    const statuses = dispatched.filter(engineStatusChanged.match).map((a) => a.payload);
    expect(statuses).toEqual([
      { kind: 'ready', count: 3 },
      { kind: 'ready', count: 7 },
    ]);

    // Per report, count then echo — the three pulse sagas `take` these in this
    // order, and a saga `put` must not reorder them against the direct dispatch.
    expect(dispatched.map((action) => action.type)).toEqual([
      engineSourceCountReported.type,
      engineStatusChanged.type,
      engineSourceCountReported.type,
      engineStatusChanged.type,
      engineSourceCountReported.type,
    ]);
  });
});
