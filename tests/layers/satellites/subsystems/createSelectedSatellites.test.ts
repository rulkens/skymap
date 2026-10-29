/**
 * createSelectedSatellites — the satellites the camera may follow are exactly the selected and
 * focused ones: each gets a transient position while it stays selected, a hover gets none, and a
 * deep-linked satellite is reported before its catalog has loaded so the catalog is demanded.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createSelectedSatellites } from '../../../../src/layers/satellites/subsystems/createSelectedSatellites';
import { satelliteTransientId } from '../../../../src/layers/satellites/present/satelliteTransientId';
import { buildSatelliteCatalog } from '../../../../tools/satellites/buildSatelliteCatalog';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
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
const ISS_ID = satelliteTransientId(25544);
const AT = unixMsToJulianDays(Date.parse('2026-10-28T12:00:00Z'));

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
  it('positions a focused satellite, moving with the clock, until it is cleared', () => {
    const { store, tracker } = setup(ISS_CATALOG);
    stop = tracker.stop;
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    const fromEarthKm = (days: number) => {
      const states = deriveBodyStates(days);
      const p = states.get(ISS_ID)!.positionMpc;
      const e = states.get(SCENE_EARTH.id)!.positionMpc;
      return [0, 1, 2].map((i) => (p[i]! - e[i]!) / SCALE_UNITS.KM_TO_MPC);
    };
    // Ten seconds on, ~77 km along its orbit, measured from Earth (which moves ~300 km meanwhile).
    const before = fromEarthKm(AT);
    const after = fromEarthKm(AT + 10 / 86_400);
    const movedKm = Math.hypot(...[0, 1, 2].map((i) => after[i]! - before[i]!));
    expect(movedKm).toBeGreaterThan(70);
    expect(movedKm).toBeLessThan(85);

    store.dispatch(clearSelection());
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(false);
  });

  it('positions a selected satellite too, but never a hovered one', () => {
    const { store, tracker } = setup(ISS_CATALOG);
    stop = tracker.stop;
    store.dispatch(updateSelectionHover(ISS_REF));
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(false);
    store.dispatch(updateSelectionSelect(ISS_REF));
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(true);
  });

  it('reports a linked satellite before its catalog loads, and positions it once it lands', () => {
    const { store, tracker, land } = setup(null);
    stop = tracker.stop;
    expect(tracker.any()).toBe(false);
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    expect(tracker.any()).toBe(true);
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(false);
    land(ISS_CATALOG);
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(true);
  });

  it('drops every position when it stops', () => {
    const { store, tracker } = setup(ISS_CATALOG);
    store.dispatch(updateSelectionFocus(ISS_REF, 'cut'));
    tracker.stop();
    expect(deriveBodyStates(AT).has(ISS_ID)).toBe(false);
  });
});
