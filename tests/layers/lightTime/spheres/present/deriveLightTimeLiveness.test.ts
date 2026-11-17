import { describe, it, expect } from 'vitest';

import { deriveLightTimeLiveness } from '../../../../../src/layers/lightTime/spheres/present/deriveLightTimeLiveness';
import { LIGHT_TIME_SPHERES } from '../../../../../src/layers/lightTime/spheres/data/lightTimeSpheres';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const radiusOf = (id: string) => LIGHT_TIME_SPHERES.find((s) => s.id === id)!.radiusMpc;
const indexOf = (id: string) => LIGHT_TIME_SPHERES.findIndex((s) => s.id === id);

// Far enough from the origin that measuring from the origin would miss every small sphere.
const EARTH: Vec3 = [5e-6, -2e-6, 1e-6];

// The default 60° lens on a 900 CSS px tall canvas at device pixel ratio 2 (1800 px).
const DEFAULT_FOCAL_PX = 1800 / (2 * Math.tan(Math.PI / 6));

function makeCtx(drawCamPos: Vec3, focalPx = DEFAULT_FOCAL_PX): FrameView {
  return {
    snapshot: {
      nowMs: 0,
      focusBlend: 0,
      bodyStates: new Map([['earth', { positionMpc: EARTH }]]),
    },
    drawCamPos,
    drawPxPerRad: focalPx,
    canvasSize: { width: 3200, height: 1800 },
    pxPerCssPx: 2,
  } as unknown as FrameView;
}

const threeLightHoursOut: Vec3 = [EARTH[0] + 3 * radiusOf('light-time:hour'), EARTH[1], EARTH[2]];

describe('deriveLightTimeLiveness', () => {
  it('is null when the handed value is 0', () => {
    expect(deriveLightTimeLiveness(makeCtx(threeLightHoursOut), 0)).toBeNull();
  });

  it('measures distance from Earth, not the origin', () => {
    const liveness = deriveLightTimeLiveness(makeCtx(threeLightHoursOut), 1)!;
    expect(liveness.centre).toEqual(EARTH);
    expect(liveness.opacities[indexOf('light-time:hour')]).toBe(1);
    expect(liveness.opacities[indexOf('light-time:day')]).toBe(0);
  });

  it('fades by apparent pixels: a long lens shrinks the window in distance, not the rule', () => {
    const hour = indexOf('light-time:hour');
    const at = (radii: number): Vec3 => [
      EARTH[0] + radii * radiusOf('light-time:hour'),
      EARTH[1],
      EARTH[2],
    ];
    // 60 radii out: 52 px across at the default lens (gone), 520 px at 10× (fully in).
    expect(deriveLightTimeLiveness(makeCtx(at(60)), 1)?.opacities[hour] ?? 0).toBe(0);
    expect(
      deriveLightTimeLiveness(makeCtx(at(60), DEFAULT_FOCAL_PX * 10), 1)!.opacities[hour],
    ).toBe(1);
  });

  it('fades out as the sphere fills the view, as its caption does', () => {
    const hour = indexOf('light-time:hour');
    // 1.2 radii out: 2.6 k px across on a 1800 px short side, past the fills-the-view band.
    const near: Vec3 = [EARTH[0] + 1.2 * radiusOf('light-time:hour'), EARTH[1], EARTH[2]];
    expect(deriveLightTimeLiveness(makeCtx(near), 1)?.opacities[hour] ?? 0).toBe(0);
  });
});
