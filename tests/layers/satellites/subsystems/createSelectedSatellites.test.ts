/**
 * createSelectedSatellites — the satellites the orbit rings draw are exactly the selected and
 * focused ones, a hover gets none, and a deep-linked satellite is reported before its catalog has
 * loaded so the catalog is demanded.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createSelectedSatellites } from '../../../../src/layers/satellites/subsystems/createSelectedSatellites';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import {
  clearSelection,
  updateSelectionFocus,
  updateSelectionHover,
  updateSelectionSelect,
} from '../../../../src/state/selection/selectionSlice';
import { createTestStore } from '../../../support/createTestStore';
import type { SatelliteCatalog } from '../../../../src/@types/satellites/SatelliteCatalog';
import { ISS } from '../fixtures/celestrakRecords';

const { catalog: ISS_CATALOG } = buildSatelliteCatalog(
  [{ group: { group: 'active', class: 'active' }, records: [ISS] }],
  0,
);
const ISS_REF = { type: 'satellite', noradId: 25544 } as const;

function setup(catalog: SatelliteCatalog | null) {
  const { store } = createTestStore();
  const listeners = new Set<() => void>();
  let current = catalog;
  const tracker = createSelectedSatellites(
    { read: () => store.getState().selection, subscribe: store.subscribe },
    {
      slot: {
        subscribe: (l: () => void) => {
          listeners.add(l);
          return () => void listeners.delete(l);
        },
      },
      propagator: { catalog: () => current },
    },
  );
  const land = (next: SatelliteCatalog | null) => {
    current = next;
    for (const l of listeners) l();
  };
  return { store, tracker, land };
}

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

describe('createSelectedSatellites', () => {
  it('reports a linked satellite before its catalog loads, and tracks it once it lands', () => {
    const { store, tracker, land } = setup(null);
    stop = tracker.stop;
    expect(tracker.any()).toBe(false);
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    expect(tracker.any()).toBe(true);
    expect(tracker.tracked()).toEqual([]);
    land(ISS_CATALOG);
    expect(tracker.tracked()).toHaveLength(1);
  });

  it('exposes the satrec of what it tracks, never a hovered one, and empties on clear', () => {
    const { store, tracker } = setup(ISS_CATALOG);
    stop = tracker.stop;
    store.dispatch(updateSelectionHover(ISS_REF));
    expect(tracker.tracked()).toEqual([]);
    store.dispatch(updateSelectionSelect(ISS_REF));
    const [iss] = tracker.tracked();
    expect(iss?.satrec.satnum).toBe('25544');
    expect(iss?.epochMs).toBe(ISS_CATALOG.epochMs[0]);
    expect(tracker.tracked()).toBe(tracker.tracked());
    store.dispatch(clearSelection());
    expect(tracker.tracked()).toEqual([]);
  });

  it('drops everything it tracks when it stops', () => {
    const { store, tracker } = setup(ISS_CATALOG);
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    tracker.stop();
    expect(tracker.tracked()).toEqual([]);
  });
});
