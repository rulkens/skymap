import { describe, expect, it } from 'vitest';
import { structureIdOf } from '../../../../src/services/engine/helpers/structureIdOf';
import { Source } from '../../../../src/data/sources';
import type { Selection } from '../../../../src/@types/engine/subsystems/Selection';

describe('structureIdOf', () => {
  it('returns null for a null selection', () => {
    expect(structureIdOf(null)).toBeNull();
  });

  it('returns the id for a structure selection', () => {
    const sel: Selection = { kind: 'structure', id: 'virgo' };
    expect(structureIdOf(sel)).toBe('virgo');
  });

  it('returns null for a non-structure (galaxy) selection', () => {
    const sel: Selection = { kind: 'galaxy', source: Source.SDSS, localIdx: 7 };
    expect(structureIdOf(sel)).toBeNull();
  });
});
