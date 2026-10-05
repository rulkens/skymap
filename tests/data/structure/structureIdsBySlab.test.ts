import { describe, expect, it } from 'vitest';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { STRUCTURE_IDS_BY_SLAB } from '../../../src/data/structure/structureIdsBySlab';

describe('STRUCTURE_IDS_BY_SLAB', () => {
  it('every structure category is drawn by exactly one marker pass', () => {
    const all = [...STRUCTURE_IDS_BY_SLAB.cosmo, ...STRUCTURE_IDS_BY_SLAB.near0];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...STRUCTURE_IDS].sort());
  });
});
