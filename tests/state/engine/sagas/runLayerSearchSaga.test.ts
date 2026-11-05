/**
 * runLayerSearchSaga — a static Layer yields its rows once and its feed ends,
 * yet the rows must survive that end and vanish only at teardown's cancel.
 * A finished task ignores `cancel()`, so a saga that returned with its feed
 * would leave the old rows beside a re-created engine's (HMR, exhibit switch).
 */

import { describe, it, expect } from 'vitest';
import { runSaga, stdChannel } from 'redux-saga';
import type { UnknownAction } from '@reduxjs/toolkit';

import reducer from '../../../../src/state/engine/engineSlice';
import { runLayerSearchSaga } from '../../../../src/state/engine/sagas/runLayerSearchSaga';
import type { LayerSearchEntry } from '../../../../src/@types/engine/layer/LayerSearchEntry';

const ROWS: readonly LayerSearchEntry[] = [
  { id: 'blackhole-sgr-a-star', names: ['Galactic Centre'], class: 'primary' },
];

describe('runLayerSearchSaga', () => {
  it('keeps a one-yield feed’s rows after the feed ends, and clears them on cancel', async () => {
    let state = reducer(undefined, { type: '@@init' });
    const task = runSaga(
      {
        channel: stdChannel(),
        dispatch: (action: UnknownAction) => {
          state = reducer(state, action);
        },
        getState: () => ({}),
      },
      () =>
        runLayerSearchSaga(
          'blackHoles',
          (async function* () {
            yield ROWS;
          })(),
        ),
    );

    // Let the feed yield and end.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(task.isRunning()).toBe(true);
    expect(state.layerSearch['blackHoles']).toEqual(ROWS);

    task.cancel();
    expect(state.layerSearch).not.toHaveProperty('blackHoles');
  });
});
