import { describe, expect, it } from 'vitest';
import { structureIdOf } from '../../../../src/services/engine/helpers/structureIdOf';
import { Source } from '../../../../src/data/sources';
import type { FocusableTarget } from '../../../../src/@types/engine/FocusableTarget';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';

describe('structureIdOf', () => {
  it('returns null for a null target', () => {
    expect(structureIdOf(null)).toBeNull();
  });

  it('returns the id for a structure target', () => {
    const target = { type: 'structure', id: 'virgo' } as unknown as StructureInfo;
    expect(structureIdOf(target satisfies FocusableTarget)).toBe('virgo');
  });

  it('returns null for a non-structure (galaxy) target', () => {
    const target = {
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 7,
    } as unknown as GalaxyInfo;
    expect(structureIdOf(target satisfies FocusableTarget)).toBeNull();
  });
});
