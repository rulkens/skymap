/**
 * createSelectedSatellites — a deep-linked satellite is reported before its catalog has loaded so
 * the catalog is demanded, and a hover never counts.
 */
import { describe, expect, it } from 'vitest';
import { createSelectedSatellites } from '../../../../src/layers/satellites/subsystems/createSelectedSatellites';
import {
  updateSelectionFocus,
  updateSelectionHover,
} from '../../../../src/state/selection/selectionSlice';
import { createTestStore } from '../../../support/createTestStore';

const ISS_REF = { type: 'satellite', noradId: 25544 } as const;

describe('createSelectedSatellites', () => {
  it('reports a focused satellite, never a hovered one', () => {
    const { store } = createTestStore();
    const tracker = createSelectedSatellites({
      read: () => store.getState().selection,
      subscribe: store.subscribe,
    });
    store.dispatch(updateSelectionHover(ISS_REF));
    expect(tracker.any()).toBe(false);
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    expect(tracker.any()).toBe(true);
    tracker.stop();
  });
});
