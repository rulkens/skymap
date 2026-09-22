/**
 * SCENE_SUN comes from a generated seed table now, not hand-written constants.
 * These pin the two values the descent renders against to the literals the
 * hand-authored table carried, so a wrong `radiusSolar`/`temperatureK` in
 * `sun.seed.json` fails here rather than as a subtly mis-sized, mis-coloured Sun.
 */
import { describe, it, expect } from 'vitest';
import { SCENE_SUN } from '../../../src/data/bodies/sceneSun';
import { temperatureToLinearRgb } from '../../../src/utils/color/temperatureToLinearRgb';

describe('SCENE_SUN', () => {
  it('is one star at exactly one solar radius, IAU-nominal in metres', () => {
    expect(SCENE_SUN).toHaveLength(1);
    const sun = SCENE_SUN[0]!;
    expect(sun.id).toBe('sun');
    expect(sun.label).toBe('Sun');
    expect(sun.surface.datumRadiusM).toBe(696_340_000);
    expect(sun.absMag).toBe(4.83);
  });

  it('is tinted from the IAU 2015 nominal effective temperature', () => {
    expect(SCENE_SUN[0]!.color).toEqual(temperatureToLinearRgb(5772));
  });
});
