import { describe, expect, it } from 'vitest';
import { arrivalFraming } from '../../../../../src/services/engine/camera/framing/arrivalFraming';
import { BODY_FOCUS } from '../../../../../src/data/selection/bodyFocus';
import type { SelectionFocus } from '../../../../../src/@types/engine/layer/SelectionFocus';
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';

const FOV60 = Math.PI / 3;
const CAPPED: SelectionFocus = { arrivalSize: 2.2, maxDistanceMpc: 800, flyInto: true, ring: null };
const at = (radiusMpc: number): PlacedRow => ({ type: 'test', positionMpc: [1, 2, 3], radiusMpc });

describe('arrivalFraming', () => {
  it('arrivalFraming clamps to maxDistanceMpc for an infinite radius', () => {
    expect(arrivalFraming(at(Number.POSITIVE_INFINITY), CAPPED, FOV60).distance).toBe(800);
  });

  it('arrivalFraming frames a degenerate radius at 0.1 Mpc', () => {
    for (const radius of [0, -1, Number.NaN]) {
      const framing = arrivalFraming(at(radius), BODY_FOCUS, FOV60);
      expect(framing.distance).toBe(0.1);
      // No pass-by extent either: a NaN radius must never reach `flyPath`'s offset.
      expect(framing.radius).toBe(0);
    }
  });

  it('arrivalFraming keeps the same screen fill at any FOV', () => {
    const radiusMpc = 2e-16;
    for (const fovYRad of [FOV60, Math.PI / 6]) {
      const { distance } = arrivalFraming(at(radiusMpc), BODY_FOCUS, fovYRad);
      expect(radiusMpc / (distance * Math.tan(fovYRad / 2))).toBeCloseTo(
        BODY_FOCUS.arrivalSize,
        12,
      );
    }
  });
});
