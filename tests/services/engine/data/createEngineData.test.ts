import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

describe('createEngineData', () => {
  it('assembles the two empty stores (galaxies + structures)', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
  });

  it('has no store for types whose status/state lives elsewhere', () => {
    const d = createEngineData();
    // Filaments and flow read "loaded" from their asset slot (slotReady), not a
    // status-store mirror; volume fields' state is settings (ADR 0006).
    expect('filaments' in d).toBe(false);
    expect('flow' in d).toBe(false);
    expect('volumes' in d).toBe(false);
  });
});
