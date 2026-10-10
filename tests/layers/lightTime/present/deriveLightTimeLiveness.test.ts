import { describe, it, expect } from 'vitest';

import { deriveLightTimeLiveness } from '../../../../src/layers/lightTime/present/deriveLightTimeLiveness';
import { LIGHT_TIME_SPHERES } from '../../../../src/data/lightTime/lightTimeSpheres';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const radiusOf = (id: string) => LIGHT_TIME_SPHERES.find((s) => s.id === id)!.radiusMpc;
const indexOf = (id: string) => LIGHT_TIME_SPHERES.findIndex((s) => s.id === id);

// Far enough from the origin that measuring from the origin would miss every small sphere.
const EARTH: Vec3 = [5e-6, -2e-6, 1e-6];

function makeCtx(drawCamPos: Vec3): FrameView {
  return {
    snapshot: {
      nowMs: 0,
      focusBlend: 0,
      bodyStates: new Map([['earth', { positionMpc: EARTH }]]),
    },
    drawCamPos,
  } as unknown as FrameView;
}

function makeState(toggleOpacity: number): PassState {
  return {
    subsystems: {
      fades: { opacityOf: () => toggleOpacity },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as PassState;
}

const threeLightHoursOut: Vec3 = [EARTH[0] + 3 * radiusOf('light-time:hour'), EARTH[1], EARTH[2]];

describe('deriveLightTimeLiveness', () => {
  it('is null when the toggle fade is 0', () => {
    expect(deriveLightTimeLiveness(makeState(0), makeCtx(threeLightHoursOut))).toBeNull();
  });

  it('measures distance from Earth, not the origin', () => {
    const liveness = deriveLightTimeLiveness(makeState(1), makeCtx(threeLightHoursOut))!;
    expect(liveness.centre).toEqual(EARTH);
    expect(liveness.opacities[indexOf('light-time:hour')]).toBe(1);
    expect(liveness.opacities[indexOf('light-time:day')]).toBe(0);
  });
});
