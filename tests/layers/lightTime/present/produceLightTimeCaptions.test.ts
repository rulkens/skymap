import { describe, it, expect } from 'vitest';

import { produceLightTimeCaptions } from '../../../../src/layers/lightTime/present/produceLightTimeCaptions';
import { LIGHT_TIME_SPHERES } from '../../../../src/data/lightTime/lightTimeSpheres';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const EARTH: Vec3 = [5e-6, -2e-6, 1e-6];
const HOUR = LIGHT_TIME_SPHERES[2]!;
const DAY = LIGHT_TIME_SPHERES[3]!;

// 1.6 light-days out: the hour sphere is past its recede band's start (ratio
// 38.4) and the day sphere mid-approach (1.6), so the two opacities differ.
const ctx = {
  snapshot: {
    nowMs: 0,
    focusBlend: 0,
    bodyStates: new Map([['earth', { positionMpc: EARTH }]]),
  },
  cam: { yaw: 0, pitch: 0, fovYRad: Math.PI / 3, aspect: 1 },
  drawCamPos: [EARTH[0], EARTH[1], EARTH[2] + 1.6 * DAY.radiusMpc],
} as unknown as FrameView;

function makeState(toggleOpacity: number): EngineState {
  return {
    subsystems: {
      fades: { opacityOf: () => toggleOpacity },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('produceLightTimeCaptions', () => {
  it('captions carry their sphere’s opacity and none are emitted when the Layer is off', () => {
    const { labels } = produceLightTimeCaptions(makeState(0.5), ctx);
    expect(labels.map((l) => l.id)).toEqual([HOUR.id, DAY.id]);
    const [hour, day] = labels;
    expect(hour!.fadeAlpha).toBeGreaterThan(0);
    expect(hour!.fadeAlpha).toBeLessThan(day!.fadeAlpha!);
    expect(day!.fadeAlpha).toBeCloseTo(0.5 * 0.5, 1);
    // On the day sphere, eye-relative: |worldPos − (Earth − eye)| = R.
    const p = day!.worldPos;
    expect(Math.hypot(p[0], p[1], p[2] + 1.6 * DAY.radiusMpc) / DAY.radiusMpc).toBeCloseTo(1, 6);

    expect(produceLightTimeCaptions(makeState(0), ctx).labels).toEqual([]);
  });
});
