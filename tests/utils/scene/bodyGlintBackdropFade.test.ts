import { describe, expect, it } from 'vitest';
import { bodyGlintBackdropFade } from '../../../src/utils/scene/bodyGlintBackdropFade';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

const states = deriveBodyStates(CONST_J2000);
const star = states.get(asSceneBodyId('trappist-1'))!.positionMpc;
const nearTrappist: [number, number, number] = [
  star[0] + 0.2 * SCALE_UNITS.AU_TO_MPC,
  star[1],
  star[2],
];

describe('bodyGlintBackdropFade', () => {
  it("keeps a planet's glint inside its own system and dissolves the others", () => {
    expect(bodyGlintBackdropFade(asSceneBodyId('trappist-1-e'), nearTrappist, states)).toBe(1);
    expect(bodyGlintBackdropFade(asSceneBodyId('mars'), nearTrappist, states)).toBe(0);
  });
});
