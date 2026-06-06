import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

describe('createEngineData', () => {
  it('assembles the three empty stores', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
    expect(d.filaments.loaded).toBe(false);
    expect('volumes' in d).toBe(false);
  });
});
