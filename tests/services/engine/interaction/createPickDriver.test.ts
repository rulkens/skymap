// @vitest-environment jsdom

/**
 * createPickDriver over a real store and a fake pick program whose `pick` returns
 * a promise the test settles, so the in-flight gate's ordering is observable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createPickDriver } from '../../../../src/services/engine/interaction/createPickDriver';
import { inputHovered, inputTapped } from '../../../../src/state/input/inputSlice';
import { selectPickRequests } from '../../../../src/state/input/selectors';
import {
  updateSelectionHover,
  updateSelectionSelect,
} from '../../../../src/state/selection/selectionSlice';
import { createTestStore } from '../../../support/createTestStore';
import type { PickDriverDeps } from '../../../../src/@types/engine/interaction/PickDriverDeps';
import type { PickResult } from '../../../../src/@types/data/PickResult';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { ViewRigKey } from '../../../../src/@types/engine/frame/ViewRigKey';

type Pending = {
  x: number;
  y: number;
  resolve: (hit: PickResult | null) => void;
  reject: () => void;
};

const hitAt = (localIdx: number): PickResult =>
  ({ sourceCode: 'galaxy', localIdx }) as unknown as PickResult;
const refOf = (localIdx: number): SelectionRef => ({ type: 'structure', id: String(localIdx) });

let store: ReturnType<typeof createTestStore>['store'];
let picks: Pending[];
let picking: { pickInFlight: boolean; cursorTexPx: [number, number] | null };
let overlayOn: boolean;
let viewRig: ViewRigKey;
let requestRender: ReturnType<typeof vi.fn<() => void>>;

function makeDriver() {
  const deps: PickDriverDeps = {
    store,
    pickProgram: {
      label: 'pickProgram',
      pick: (x, y) =>
        new Promise((resolve, reject) => {
          picks.push({ x, y, resolve, reject: () => reject(new Error('readback')) });
        }),
      renderForDebug: () => [],
      destroy: () => {},
    },
    resolvePick: (hit) => (hit ? refOf(hit.localIdx) : null),
    canvas: { clientWidth: 200, clientHeight: 100 },
    state: {
      picking,
      settings: { debug: { overlays: { 'terrain-pick-marker': overlayOn } } } as never,
      get viewRig() {
        return viewRig;
      },
    },
    scheduler: { requestRender },
  };
  return createPickDriver(deps);
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const selection = () => store.getState().selection;

beforeEach(() => {
  store = createTestStore().store;
  picks = [];
  picking = { pickInFlight: false, cursorTexPx: null };
  overlayOn = false;
  viewRig = 'mono';
  requestRender = vi.fn<() => void>();
});

describe('createPickDriver', () => {
  it('a hover request picks at the view pixel and dispatches the hover ref, then resolves the request', async () => {
    makeDriver();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.25, y: 0.5 } }));
    expect(picks).toHaveLength(1);
    expect([picks[0]!.x, picks[0]!.y]).toEqual([50, 50]);
    picks[0]!.resolve(hitAt(7));
    await settle();
    expect(selection().hover).toEqual(refOf(7));
    expect(selectPickRequests(store.getState()).hover).toBeNull();
  });

  it('a hover request with at null clears hover without a GPU pick', () => {
    store.dispatch(updateSelectionHover(refOf(3)));
    makeDriver();
    store.dispatch(inputHovered({ source: 'canvas', at: null }));
    expect(picks).toHaveLength(0);
    expect(selection().hover).toBeNull();
    expect(selectPickRequests(store.getState()).hover).toBeNull();
  });

  it('a select request dispatches updateSelectionSelect', async () => {
    makeDriver();
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    picks[0]!.resolve(hitAt(4));
    await settle();
    expect(selection().select).toEqual(refOf(4));
    expect(selectPickRequests(store.getState()).select).toBeNull();
  });

  it('a tap while a hover pick is in flight selects once the hover pick settles', async () => {
    makeDriver();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.1, y: 0.1 } }));
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    expect(picks).toHaveLength(1);
    picks[0]!.resolve(hitAt(1));
    await settle();
    expect(picks).toHaveLength(2);
    expect([picks[1]!.x, picks[1]!.y]).toEqual([100, 50]);
    picks[1]!.resolve(hitAt(2));
    await settle();
    expect(selection().select).toEqual(refOf(2));
  });

  it('moves during an in-flight pick coalesce to one trailing pick at the newest point', async () => {
    makeDriver();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.1, y: 0.1 } }));
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.2, y: 0.2 } }));
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.3, y: 0.3 } }));
    expect(picks).toHaveLength(1);
    picks[0]!.resolve(null);
    await settle();
    expect(picks).toHaveLength(2);
    expect([picks[1]!.x, picks[1]!.y]).toEqual([60, 30]);
    picks[1]!.resolve(null);
    await settle();
    expect(picks).toHaveLength(2);
    expect(picking.pickInFlight).toBe(false);
  });

  it('a failed pick keeps the prior selection and resolves the request', async () => {
    store.dispatch(updateSelectionSelect(refOf(9)));
    makeDriver();
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    picks[0]!.reject();
    await settle();
    expect(selection().select).toEqual(refOf(9));
    expect(selectPickRequests(store.getState()).select).toBeNull();
  });

  it.each([
    [false, 'mono', null],
    [true, 'dome', null],
    [true, 'mono', [50, 50]],
  ] as const)(
    'the terrain marker cursor is written only with the overlay on and a pickable rig (overlay %s, %s)',
    (overlay, rig, expected) => {
      overlayOn = overlay;
      viewRig = rig;
      makeDriver();
      store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.25, y: 0.5 } }));
      expect(picking.cursorTexPx).toEqual(expected);
      expect(requestRender).toHaveBeenCalledTimes(expected ? 1 : 0);
    },
  );

  it('destroy unsubscribes', () => {
    makeDriver().destroy();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.5, y: 0.5 } }));
    expect(picks).toHaveLength(0);
  });
});
