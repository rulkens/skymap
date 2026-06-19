import { describe, it, expect } from 'vitest';

import reducer, { catalogLoaded } from '../../../src/state/dataStatus/dataStatusSlice';
import { Source } from '../../../src/data/sources';

describe('dataStatusSlice', () => {
  it('seeds empty', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ catalogGen: {}, structureGen: 0 });
  });
  it('catalogLoaded records the per-source generation', () => {
    const next = reducer(undefined, catalogLoaded({ source: Source.SDSS, generation: 3 }));
    expect(next.catalogGen[Source.SDSS]).toBe(3);
  });
  it('a later commit bumps the same source to a new generation', () => {
    let s = reducer(undefined, catalogLoaded({ source: Source.SDSS, generation: 3 }));
    s = reducer(s, catalogLoaded({ source: Source.SDSS, generation: 4 }));
    expect(s.catalogGen[Source.SDSS]).toBe(4);
  });
  it('records two sources independently', () => {
    let s = reducer(undefined, catalogLoaded({ source: Source.SDSS, generation: 1 }));
    s = reducer(s, catalogLoaded({ source: Source.TwoMRS, generation: 2 }));
    expect(s.catalogGen[Source.SDSS]).toBe(1);
    expect(s.catalogGen[Source.TwoMRS]).toBe(2);
  });
});
