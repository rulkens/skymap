import { describe, expect, it } from 'vitest';
import { lightSourceMpc } from '../../../src/utils/scene/lightSourceMpc';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { RENDER_ORIGIN_MPC } from '../../../src/data/renderOrigin';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

const states = deriveBodyStates(CONST_J2000);

describe('lightSourceMpc', () => {
  it('lights a solar-system body from the Sun at the render origin', () => {
    for (const id of ['mars', 'moon']) {
      expect(lightSourceMpc(asSceneBodyId(id), states)).toEqual(RENDER_ORIGIN_MPC);
    }
  });

  it("lights a star's planet from that star", () => {
    const star = states.get(asSceneBodyId('trappist-1'))!.positionMpc;
    expect(lightSourceMpc(asSceneBodyId('trappist-1-e'), states)).toEqual(star);
  });
});
