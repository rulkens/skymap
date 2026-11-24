import { describe, it, expect } from 'vitest';
import { SCENE_EARTH_BODIES } from '../../../src/data/bodies/sceneEarthBodies';

describe('SCENE_EARTH_BODIES', () => {
  it("holds the app's one Earth row", () => {
    expect(SCENE_EARTH_BODIES.map((body) => body.id)).toEqual(['earth']);
  });
});
