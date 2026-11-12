import { describe, it, expect } from 'vitest';
import { initialState } from '../../../../src/layers/asteroids/state/asteroids/initialState';
import { ASTEROID_CLASSES } from '../../../../src/data/asteroids/asteroidClasses';

describe('asteroids initialState', () => {
  it('settings start off with every class on and brightness 1', () => {
    expect(initialState.enabled).toBe(false);
    expect(Object.keys(initialState.items).sort()).toEqual([...ASTEROID_CLASSES].sort());
    for (const cls of ASTEROID_CLASSES) expect(initialState.items[cls].enabled).toBe(true);
    expect(initialState.brightness).toBe(1);
  });
});
