import { describe, expect, it } from 'vitest';

import { asteroidWindowFade } from '../../../../src/layers/asteroids/kepler/utils/asteroidWindowFade';
import { ASTEROID_WINDOW } from '../../../../src/layers/asteroids/kepler/data/asteroidWindow';

const JD_2000 = 2451544.5;

describe('asteroidWindowFade', () => {
  it('window fade is 0 before 1900, 1 in 2000, 0 after 2100, and monotone over the last year', () => {
    expect(asteroidWindowFade(ASTEROID_WINDOW.startJd - 1)).toBe(0);
    expect(asteroidWindowFade(JD_2000)).toBe(1);
    expect(asteroidWindowFade(ASTEROID_WINDOW.endJd + 1)).toBe(0);
    let previous = 1;
    for (let day = 0; day <= ASTEROID_WINDOW.fadeDays; day += 5) {
      const fade = asteroidWindowFade(ASTEROID_WINDOW.endJd - ASTEROID_WINDOW.fadeDays + day);
      expect(fade).toBeLessThanOrEqual(previous);
      previous = fade;
    }
    expect(previous).toBeLessThan(0.01);
  });
});
