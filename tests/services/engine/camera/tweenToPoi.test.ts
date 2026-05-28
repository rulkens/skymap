/**
 * tweenToPoi — unit tests for the POI-side camera tween helper.
 *
 * Mirrors tweenToGalaxy.test.ts; the helper is the POI sibling of
 * tweenToGalaxy and shares the same plumbing contract (build a
 * CameraTween from a target, hand it to the tween manager, kick the
 * scheduler).  Differs only in where toDistance comes from
 * (`poiFocusDistance(category, radiusMpc)` instead of the galaxy
 * version).  We assert the plumbing here and leave the framing-math
 * coverage to `poiFocusDistance.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

import { tweenToPoi } from '../../../../src/services/engine/camera/tweenToPoi';
import { poiFocusDistance } from '../../../../src/services/engine/camera/poiFocusDistance';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { PointOfInterest } from '../../../../src/@types/engine/subsystems/PointOfInterest';

function makeState(opts: {
  cam: { target: [number, number, number]; distance: number; yaw: number; pitch: number } | null;
  start: ReturnType<typeof vi.fn>;
  requestRender: ReturnType<typeof vi.fn>;
}): EngineState {
  return {
    cam: opts.cam,
    subsystems: {
      tweens: { start: opts.start },
      scheduler: { requestRender: opts.requestRender },
    },
  } as unknown as EngineState;
}

const VIRGO: PointOfInterest = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 20, 30],
  physicalRadiusMpc: 2,
};

describe('tweenToPoi', () => {
  it('starts a CameraTween with poiFocusDistance(category, radius) and requests a render', () => {
    const start = vi.fn();
    const requestRender = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0,
      pitch: 0,
    };
    const state = makeState({ cam, start, requestRender });

    tweenToPoi(state, VIRGO);

    expect(start).toHaveBeenCalledOnce();
    const tween = start.mock.calls[0]![0];
    expect(Array.from(tween.toTarget as ArrayLike<number>)).toEqual([10, 20, 30]);
    expect(tween.toDistance).toBe(poiFocusDistance('cluster', 2));
    expect(requestRender).toHaveBeenCalledOnce();
  });

  it('is a no-op when cam is null', () => {
    const start = vi.fn();
    const requestRender = vi.fn();
    const state = makeState({ cam: null, start, requestRender });

    tweenToPoi(state, VIRGO);

    expect(start).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
