import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

describe('createEngineData', () => {
  it('assembles the four empty stores', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
    expect(d.volumes.registered()).toEqual([]);
    expect(d.filaments.loaded).toBe(false);
  });

  it('includes a seeded flow store', () => {
    const d = createEngineData();
    expect(d.flow.mode).toBe('advect');
    expect(d.flow.enabled).toBe(false);
  });
});
