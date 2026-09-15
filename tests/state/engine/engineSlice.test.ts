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
  engineStructureSearchListChanged,
  factsReported,
  layerFactsSeeded,
} from '../../../src/state/engine/engineSlice';
import type { EngineSliceState } from '../../../src/@types/store/EngineSliceState';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';
import { Source } from '../../../src/data/source';

/** A state widened with a stub Layer's facts key, standing in for a landed Layer. */
type WithStubFacts = EngineSliceState & { stub: { a: number; b: number; list?: number[] } };

const base = (): EngineSliceState => ({
  status: { kind: 'initializing' },
  scale: { label: '…', widthPx: 100 },
  focusedBodyDistanceMpc: null,
  hdrCapable: false,
  sourceCounts: {},
  structureCounts: {},
  provenanceCounts: {},
  loadProgress: null,
  structureSearchList: [],
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

describe('engineSlice — engineStructureSearchListChanged', () => {
  it('engineStructureSearchListChanged replaces the list wholesale', () => {
    const first: StructureSearchEntry = {
      id: 'cluster-virgo',
      name: 'Virgo Cluster',
      category: 'cluster',
      abell: null,
      description: '',
    };
    const s: EngineSliceState = { ...base(), structureSearchList: [first] };
    const second: StructureSearchEntry = { ...first, id: 'cluster-coma', name: 'Coma Cluster' };
    const next = reducer(s, engineStructureSearchListChanged([second]));
    expect(next.structureSearchList).toEqual([second]);
  });
});

describe('engineSlice — factsReported / layerFactsSeeded (D6, Ruling 7)', () => {
  it('factsReported merges a patch under the layer key and leaves sibling facts', () => {
    const s: WithStubFacts = { ...base(), stub: { a: 1, b: 2 } };
    const next = reducer(
      s as unknown as EngineSliceState,
      factsReported({ layer: 'stub', patch: { b: 3 } }),
    ) as unknown as WithStubFacts;
    expect(next.stub).toEqual({ a: 1, b: 3 });
    expect(next.status).toEqual(s.status);
  });

  it('factsReported replaces a field wholesale, it does not deep-merge', () => {
    const s: WithStubFacts = { ...base(), stub: { a: 1, b: 2, list: [0, 0] } };
    const next = reducer(
      s as unknown as EngineSliceState,
      factsReported({ layer: 'stub', patch: { list: [1] } }),
    ) as unknown as WithStubFacts;
    expect(next.stub.list).toEqual([1]);
  });

  it('layerFactsSeeded installs a Layer key and a later patch merges into it', () => {
    const s = base();
    const seeded = reducer(
      s,
      layerFactsSeeded({ layer: 'stub', facts: { a: 1, b: 2 } }),
    ) as unknown as WithStubFacts;
    const patched = reducer(
      seeded as unknown as EngineSliceState,
      factsReported({ layer: 'stub', patch: { b: 9 } }),
    ) as unknown as WithStubFacts;
    expect(patched.stub).toEqual({ a: 1, b: 9 });
  });
});
