/**
 * watchHashWriteSaga — integration over a real store + saga middleware, with the
 * `services/url` write seam mocked so no `window` is touched (the suite runs
 * under `environment: 'node'`). Only this saga is forked, not `mainSaga`: the
 * subject is the trigger wiring, and a full root fork would drag in every other
 * watcher's engine context for nothing.
 *
 * ### What these cases are for
 *
 * The `writesOn` lists are prose-guarded — nothing at runtime checks that a row
 * named every action that can move its value — so the residual risk is a typo'd
 * or forgotten trigger, which shows up as a URL that quietly stops updating.
 * These cases dispatch the REAL action for each declared trigger and assert the
 * body that reached the seam. Body composition itself is `hashBodyFor`'s test
 * and per-row serialization is `hashParamSources`'s; what only this file can
 * catch is "the action fired and no write followed".
 *
 * The last case is the inverse and the most load-bearing: `commitCameraPose`
 * must NOT write. It stands for the whole 60 Hz frame stream, and it is the
 * reason `writesOn` is enumerated at all rather than the saga taking `'*'`.
 *
 * ### Why every case awaits a tick
 *
 * The saga publishes on the TRAILING EDGE of a burst of triggers, not on each
 * one (`debounce(0, …)`), so nothing has reached the seam at the instant
 * `dispatch` returns. `settle()` is that macrotask. It is also what keeps each
 * case honest about which trigger it is pinning: two dispatches with no settle
 * between them coalesce into a single write, and a case that asserted only the
 * final body would then pass whether or not its own trigger fired at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../../../src/services/url/writeHashBody', () => ({ writeHashBody: vi.fn() }));

import { writeHashBody } from '../../../src/services/url/writeHashBody';
import { rootReducer } from '../../../src/store/rootReducer';
import { watchHashWriteSaga } from '../../../src/state/url/watchHashWriteSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { clearSelection } from '../../../src/state/selection/selectionSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { manualPausedAtActions } from '../../../src/state/time/enterManualPausedAt';
import { commitCameraPose } from '../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import { timeRoute } from '../../../src/store/constants';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

const write = vi.mocked(writeHashBody);

/** The most recent body handed to the seam, or `undefined` if it never was. */
const lastBody = () => write.mock.lastCall?.[0];

/** A macrotask — the write saga's debounce window, so the publish has landed. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** JD 2451545.0 — the J2000.0 epoch, and the instant it names. */
const J2000_ISO = '2000-01-01T12:00:00.000Z';

const virgoRow: SelectionRow = {
  type: 'structure',
  id: 'cluster-virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [0, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

function buildHarness() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.run(watchHashWriteSaga);
  return store;
}

describe('watchHashWriteSaga', () => {
  beforeEach(() => {
    write.mockClear();
  });

  it('writes the pending id on requestFocus', async () => {
    // The cold deep-link case: the id is still resolving, no ref slot holds
    // anything, and the URL must carry the intent anyway.
    buildHarness().dispatch(requestFocus('m31'));
    await settle();

    expect(lastBody()).toBe('focus=m31');
  });

  it('writes the resolved target on setSelectionRow for the focus slot', async () => {
    // `setSelectionRow` is the SOLE writer of `selectionRows.focus`, so every
    // resolution path — a late catalog pulse, the star-count pulse, a direct ref
    // write — arrives here as this one action. Covering it covers all of them.
    buildHarness().dispatch(setSelectionRow({ slot: 'focus', row: virgoRow }));
    await settle();

    expect(lastBody()).toBe('focus=cluster-virgo-m87');
  });

  it('does NOT write on setSelectionRow for the hover slot', async () => {
    // The other half of the frame-stream guard, and the reason the focus row's
    // trigger is slot-aware rather than the bare action. The hover row is
    // rewritten once per GPU pick readback for as long as the pointer moves, and
    // the `focus` row's `write` reads only the FOCUS row — so a slot-blind
    // trigger re-admits, through the derived cache, exactly the `selection/*`
    // hot stream the named-action list was chosen to exclude.
    buildHarness().dispatch(setSelectionRow({ slot: 'hover', row: virgoRow }));
    await settle();

    expect(write).not.toHaveBeenCalled();
  });

  it('writes an empty body on clearSelection', async () => {
    const store = buildHarness();
    store.dispatch(requestFocus('m31'));

    // Settled BETWEEN the two dispatches on purpose. Without it they share one
    // debounce window and the only publish is the clear's — which would pass
    // even if `clearSelection` were not a trigger at all, because `requestFocus`
    // would have opened the window and the worker would read the cleared state.
    await settle();
    expect(lastBody()).toBe('focus=m31');

    store.dispatch(clearSelection());
    await settle();

    // Empty, not `focus=`: dropping the param entirely is what returns the
    // visitor to a bare, shareable "nothing selected" URL.
    expect(lastBody()).toBe('');
  });

  it('writes t on any time-slice action, including one this file cannot name', async () => {
    const store = buildHarness();

    for (const action of manualPausedAtActions(new Date(J2000_ISO))) store.dispatch(action);
    await settle();
    expect(lastBody()).toBe(`t=${J2000_ISO}`);

    // The `t` row declares its triggers as a slice PREFIX rather than a list, so
    // a time reducer added later is covered with no edit to the table. A
    // synthetic type is the only way to assert that property — pinning it with
    // today's six real reducers would pass just as well against an explicit
    // list, which is precisely the regression worth catching.
    write.mockClear();
    store.dispatch({ type: `${timeRoute}/aReducerAddedLater` });
    await settle();

    expect(lastBody()).toBe(`t=${J2000_ISO}`);
  });

  it('writes a non-default frame on setOrientation', async () => {
    buildHarness().dispatch(setOrientation('galactic'));
    await settle();

    expect(lastBody()).toBe('orientation=galactic');
  });

  it('does NOT write on commitCameraPose', async () => {
    // The frame path. `commitCameraPose` fires on every orbit gesture and lands
    // in the same slice family the hash reads from, but it cannot move any row's
    // value — and this is the case that keeps a `pushState` off a 60 Hz path.
    // Widening any row's `writesOn` to a slice prefix over camera, or to `'*'`,
    // fails here and nowhere else.
    buildHarness().dispatch(
      commitCameraPose(absoluteArm({ target: [1, 2, 3], yaw: 0.5, pitch: 0.2, distance: 12 })),
    );
    await settle();

    expect(write).not.toHaveBeenCalled();
  });
});
