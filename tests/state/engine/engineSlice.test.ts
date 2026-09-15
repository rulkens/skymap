/**
 * engineSlice — unit tests for the inline-Immer RTK engine slice.
 *
 * Each test calls the slice reducer directly with an action creator's output
 * (`reducer(state, actionCreator(payload))`) and asserts the single field the
 * reducer writes. The `base()` factory returns a fresh `EngineSliceState` so tests
 * are isolated from one another.
 *
 * The same-state-reference test for `engineScaleChanged` is the load-bearing
 * contract for the DEDUP-ON-WRITE guard: when the incoming `ScaleInfo` is
 * equal to the current one, Immer must return the same slice reference so
 * `useSelector(selectScale)` does not re-fire on every autorotate frame.
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  engineSourceCountReported,
  engineProvenanceCountsReported,
  engineScaleChanged,
  engineBodyDistanceReported,
} from '../../../src/state/engine/engineSlice';
import type { EngineSliceState } from '../../../src/@types/store/EngineSliceState';
import { Source } from '../../../src/data/source';

const base = (): EngineSliceState => ({
  status: { kind: 'initializing' },
  scale: { label: '…', widthPx: 100 },
  focusedBodyDistanceMpc: null,
  hdrCapable: false,
  sourceCounts: {},
  structureCounts: {},
  provenanceCounts: {},
  loadProgress: null,
  meta: { famousGalaxies: [], famousStars: [] },
});

describe('engineSlice — engineSourceCountReported', () => {
  it('engineSourceCountReported merges a second source without dropping the first', () => {
    const after1 = reducer(base(), engineSourceCountReported({ source: Source.SDSS, count: 5 }));
    const after2 = reducer(after1, engineSourceCountReported({ source: Source.TwoMRS, count: 42 }));
    expect(after2.sourceCounts[Source.SDSS]).toBe(5);
    expect(after2.sourceCounts[Source.TwoMRS]).toBe(42);
  });
});

describe('engineSlice — engineProvenanceCountsReported', () => {
  it('engineProvenanceCountsReported merges a second source without dropping the first', () => {
    const first = { total: 100, estimated: { orientation: 10, size: 5 } };
    const second = { total: 200, estimated: { orientation: 20, size: 15 } };
    const after1 = reducer(
      base(),
      engineProvenanceCountsReported({ source: Source.SDSS, counts: first }),
    );
    const after2 = reducer(
      after1,
      engineProvenanceCountsReported({ source: Source.TwoMRS, counts: second }),
    );
    expect(after2.provenanceCounts[Source.SDSS]).toEqual(first);
    expect(after2.provenanceCounts[Source.TwoMRS]).toEqual(second);
  });
});

describe('engineSlice — engineScaleChanged', () => {
  it('engineScaleChanged returns the same state reference when label and widthPx are unchanged', () => {
    // Seed a state with a known scale value.
    const s: EngineSliceState = { ...base(), scale: { label: '500 Mpc', widthPx: 120 } };
    // Dispatch with a freshly-allocated ScaleInfo whose fields are identical.
    const next = reducer(s, engineScaleChanged({ label: '500 Mpc', widthPx: 120 }));
    // The DEDUP-ON-WRITE guard must leave the slice reference unchanged so
    // useSelector(selectScale) does not re-fire on every autorotate frame.
    expect(next).toBe(s);
  });

  it('engineScaleChanged replaces scale when widthPx differs', () => {
    const s: EngineSliceState = { ...base(), scale: { label: '500 Mpc', widthPx: 120 } };
    const next = reducer(s, engineScaleChanged({ label: '500 Mpc', widthPx: 150 }));
    expect(next.scale.widthPx).toBe(150);
  });
});

describe('engineSlice — engineBodyDistanceReported', () => {
  it('engineBodyDistanceReported returns the same state reference when the distance is unchanged', () => {
    const s: EngineSliceState = { ...base(), focusedBodyDistanceMpc: 1.2e-6 };
    // A republished-but-identical distance must be deduped away so the
    // InfoCard subscriber does not re-fire a few Hz on a body at rest.
    const next = reducer(s, engineBodyDistanceReported(1.2e-6));
    expect(next).toBe(s);
  });

  it('engineBodyDistanceReported writes when the focused-body distance changes', () => {
    const s: EngineSliceState = { ...base(), focusedBodyDistanceMpc: null };
    const next = reducer(s, engineBodyDistanceReported(3.4e-6));
    expect(next.focusedBodyDistanceMpc).toBe(3.4e-6);
  });
});
