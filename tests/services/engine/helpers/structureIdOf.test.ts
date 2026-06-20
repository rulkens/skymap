import { describe, expect, it } from 'vitest';
import { structureIdOf } from '../../../../src/services/engine/helpers/structureIdOf';
import { Source } from '../../../../src/data/sources';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';

describe('structureIdOf', () => {
  it('returns null for a null ref', () => {
    expect(structureIdOf(null)).toBeNull();
  });

  it('returns the id for a structure ref', () => {
    const ref: SelectionRef = { type: 'structure', id: 'virgo' };
    expect(structureIdOf(ref)).toBe('virgo');
  });

  it('returns null for a galaxy ref', () => {
    const ref: SelectionRef = { type: 'galaxyCatalog', source: Source.SDSS, index: 7 };
    expect(structureIdOf(ref)).toBeNull();
  });

  it('returns null for a milkyWay ref', () => {
    const ref: SelectionRef = { type: 'milkyWay' };
    expect(structureIdOf(ref)).toBeNull();
  });
});
