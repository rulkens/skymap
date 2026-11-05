/**
 * SCENE_SUN comes from a generated seed table now, not hand-written constants.
 * This pins the derived unit conversion (`radiusSolar: 1` → `696_340_000` m)
 * against `sun.seed.json`, so a bad edit there fails here rather than as a
 * subtly mis-sized Sun.
 */
import { describe, it, expect } from 'vitest';
import { SCENE_SUN } from '../../../src/data/bodies/sceneSun';

describe('SCENE_SUN', () => {
  it('is one star at exactly one solar radius, IAU-nominal in metres', () => {
    expect(SCENE_SUN).toHaveLength(1);
    const sun = SCENE_SUN[0]!;
    expect(sun.surface.datumRadiusM).toBe(696_340_000);
  });
});
