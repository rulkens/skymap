import { describe, expect, it } from 'vitest';
import { asteroidClassFade } from '../../../../src/layers/asteroids/kepler/utils/asteroidClassFade';
import { ASTEROID_CLASSES } from '../../../../src/data/asteroids/asteroidClasses';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { AsteroidClass } from '../../../../src/@types/asteroids/AsteroidClass';

const ON = Object.fromEntries(ASTEROID_CLASSES.map((c) => [c, 1])) as Record<AsteroidClass, number>;
const eyeAt = (au: number): [number, number, number] => [
  RENDER_ORIGIN_MPC[0] + au * SCALE_UNITS.AU_TO_MPC,
  RENDER_ORIGIN_MPC[1],
  RENDER_ORIGIN_MPC[2],
];

describe('asteroidClassFade', () => {
  it('keeps every class inside 60 AU, drops the rest beyond 200, keeps distant at 300', () => {
    for (const cls of ASTEROID_CLASSES) expect(asteroidClassFade(ON, eyeAt(60))[cls]).toBe(1);
    const at300 = asteroidClassFade(ON, eyeAt(300));
    for (const cls of ASTEROID_CLASSES) expect(at300[cls]).toBe(cls === 'distant' ? 1 : 0);
  });

  it('is partial between 60 and 200 AU and scales the layer fade', () => {
    const half = asteroidClassFade({ ...ON, mainBelt: 0.5 }, eyeAt(130));
    expect(half.mainBelt).toBeGreaterThan(0);
    expect(half.mainBelt).toBeLessThan(0.5);
    expect(half.distant).toBe(1);
  });
});
