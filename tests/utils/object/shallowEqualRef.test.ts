import { describe, it, expect } from 'vitest';

import { shallowEqualRef } from '../../../src/utils/object/shallowEqualRef';
import { Source } from '../../../src/data/sources';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';

describe('shallowEqualRef', () => {
  it('returns true for the same object reference', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 3 };
    expect(shallowEqualRef(ref, ref)).toBe(true);
  });

  it('returns true for two fresh equal objects (structurally equivalent)', () => {
    const a: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 3 };
    const b: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 3 };
    expect(shallowEqualRef(a, b)).toBe(true);
  });

  it('returns false for refs with differing index', () => {
    const a: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 3 };
    const b: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 7 };
    expect(shallowEqualRef(a, b)).toBe(false);
  });

  it('returns false for refs with differing type', () => {
    const a: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 0 };
    const b: SelectionRef = { type: 'milkyWay' };
    expect(shallowEqualRef(a, b)).toBe(false);
  });

  it('returns false when one is null and the other is not', () => {
    const ref: SelectionRef = { type: 'milkyWay' };
    expect(shallowEqualRef(null, ref)).toBe(false);
    expect(shallowEqualRef(ref, null)).toBe(false);
  });

  it('returns true for both null', () => {
    expect(shallowEqualRef(null, null)).toBe(true);
  });

  it('returns true for two equal structure refs', () => {
    const a: SelectionRef = { type: 'structure', id: 'abell-2065' };
    const b: SelectionRef = { type: 'structure', id: 'abell-2065' };
    expect(shallowEqualRef(a, b)).toBe(true);
  });

  it('returns false for structure refs with differing id', () => {
    const a: SelectionRef = { type: 'structure', id: 'abell-2065' };
    const b: SelectionRef = { type: 'structure', id: 'virgo-cluster' };
    expect(shallowEqualRef(a, b)).toBe(false);
  });

  it('returns true for two milkyWay refs', () => {
    const a: SelectionRef = { type: 'milkyWay' };
    const b: SelectionRef = { type: 'milkyWay' };
    expect(shallowEqualRef(a, b)).toBe(true);
  });
});
