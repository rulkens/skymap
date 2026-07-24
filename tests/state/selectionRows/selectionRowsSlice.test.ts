import { describe, it, expect } from 'vitest';

import reducer, { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { SelectionRowsState } from '../../../src/@types/store/SelectionRowsState';

const galaxyRow = makeGalaxyRow({
  index: 42,
  objId: '1237668347496587264',
  x: 100,
  y: 200,
  z: 300,
  redshift: 0.05,
  magU: 17.1,
  magG: 16.2,
  magR: 15.8,
  magI: 15.5,
  magZ: 15.3,
  diameterKpc: 18,
  axisRatio: 0.7,
  positionAngleDeg: 45,
  classByte: 3,
});

describe('selectionRowsSlice', () => {
  it('setSelectionRow writes a GalaxyRow into the correct slot', () => {
    const next = reducer(undefined, setSelectionRow({ slot: 'select', row: galaxyRow }));
    expect(next.select).toEqual(galaxyRow);
    expect(next.hover).toBeNull();
    expect(next.focus).toBeNull();
  });

  it('setSelectionRow null clears a previously-set slot', () => {
    let s: SelectionRowsState = reducer(
      undefined,
      setSelectionRow({ slot: 'focus', row: galaxyRow }),
    );
    s = reducer(s, setSelectionRow({ slot: 'focus', row: null }));
    expect(s.focus).toBeNull();
  });

  it('setSelectionRow to one slot does not disturb other slots', () => {
    let s: SelectionRowsState = reducer(
      undefined,
      setSelectionRow({ slot: 'hover', row: galaxyRow }),
    );
    s = reducer(s, setSelectionRow({ slot: 'select', row: { type: 'milkyWay' } }));
    expect(s.hover).toEqual(galaxyRow);
    expect(s.select).toEqual({ type: 'milkyWay' });
    expect(s.focus).toBeNull();
  });
});
