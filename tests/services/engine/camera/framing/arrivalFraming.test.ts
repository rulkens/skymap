import { describe, expect, it } from 'vitest';
import { arrivalFraming } from '../../../../../src/services/engine/camera/framing/arrivalFraming';
import { BODY_FOCUS } from '../../../../../src/data/selection/bodyFocus';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';

const FOV60 = Math.PI / 3;
const at = (radiusMpc: number): PlacedRow => ({ type: 'test', positionMpc: [1, 2, 3], radiusMpc });

describe('arrivalFraming', () => {
  it('arrivalFraming frames a degenerate radius at 0.1 Mpc', () => {
    for (const radius of [0, -1, Number.NaN]) {
      const framing = arrivalFraming(at(radius), BODY_FOCUS, FOV60);
      expect(framing.distance).toBe(0.1);
      // No pass-by extent either: a NaN radius must never reach `flyPath`'s offset.
      expect(framing.radius).toBe(0);
    }
  });
});
