import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

describe('createEngineData', () => {
  it('still exposes galaxies + structures stores', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
  });

  it('seeds the Earth body at construction', () => {
    const d = createEngineData();
    expect(d.bodies.earth?.id).toBe('earth');
    // Star/planet seeds are a later phase — the store stays otherwise empty.
    expect(d.bodies.stars).toEqual([]);
    expect(d.bodies.planets).toEqual([]);
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
