import { describe, it, expect } from 'vitest';

import { refOf } from '../../../../src/services/engine/helpers/refOf';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import { Source } from '../../../../src/data/sources';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

/**
 * Minimal GalaxyInfo fixture — only `type`, `source`, and `index` are read by
 * `refOf`; the rest of the rich display shape is irrelevant here, so we cast
 * to sidestep building a complete record.
 */
const galaxyTarget = {
  type: 'galaxyCatalog',
  source: Source.SDSS,
  index: 7,
} as unknown as GalaxyInfo;

/**
 * Minimal StructureInfo fixture — `refOf` reads only `type` and `id`.
 */
const structureTarget = {
  type: 'structure',
  category: 'cluster',
  id: 'virgo',
} as unknown as StructureInfo;

describe('refOf', () => {
  it('galaxy → galaxyCatalog ref with correct source and index', () => {
    expect(refOf(galaxyTarget)).toEqual({
      type: 'galaxyCatalog',
      source: Source.SDSS,
      index: 7,
    });
  });

  it('structure → structure ref with id only', () => {
    expect(refOf(structureTarget)).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('milkyWay → milkyWay ref', () => {
    expect(refOf(MILKY_WAY_INFO)).toEqual({ type: 'milkyWay' });
  });
});
