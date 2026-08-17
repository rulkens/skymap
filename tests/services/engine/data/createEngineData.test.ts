import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_S_STARS } from '../../../../src/data/bodies/sceneSStars';

describe('createEngineData', () => {
  it('still exposes galaxies + structures stores', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
  });

  it('seeds the Earth body at construction', () => {
    const d = createEngineData();
    expect(d.bodies.earth?.id).toBe('earth');
  });

  it('seeds both star tables (local map + S-stars) and the planets at construction', () => {
    // Seed-data-early: the body store is filled the moment it exists, not at a
    // later wiring phase. Stars and planets flow in from their authored seed
    // tables alongside Earth. The two star tables stay separate seeds — the
    // packed pick id indexes one of them — but land in the ONE store list the
    // star layers iterate, which `visibleStars` then gates apart.
    const d = createEngineData();
    expect(d.bodies.stars).toEqual([...SCENE_STARS, ...SCENE_S_STARS]);
    expect(d.bodies.planets).toEqual(SCENE_PLANETS);
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
