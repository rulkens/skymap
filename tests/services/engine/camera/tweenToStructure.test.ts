/**
 * tweenToStructure — unit tests for the structure-side camera tween helper.
 *
 * Mirrors tweenToGalaxy.test.ts and shares the same plumbing contract (build
 * a CameraTween from a target, hand it to the tween manager). Differs only in
 * where toDistance comes from (`structureFocusDistance(apparentRadiusMpc,
 * fovYRad)` instead of the galaxy version). We assert the plumbing here —
 * including the apparent-radius fallback to the physical core — and leave
 * framing-math coverage to `structureFocusDistance.test.ts`.
 *
 * The scheduler wake is NOT asserted here — `tweens.start` owns it, and
 * wake coverage lives in tweenManager.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

import { tweenToStructure } from '../../../../src/services/engine/camera/tweenToStructure';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRecord } from '../../../../src/@types/data/structure/StructureRecord';

function makeState(opts: {
  cam: {
    target: [number, number, number];
    distance: number;
    yaw: number;
    pitch: number;
    fovYRad: number;
  } | null;
  start: ReturnType<typeof vi.fn>;
}): EngineState {
  return {
    cam: opts.cam,
    subsystems: {
      tweens: { start: opts.start },
    },
  } as unknown as EngineState;
}

const VIRGO: StructureRecord = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 20, 30],
  featured: true,
  physicalRadiusMpc: 2,
};

describe('tweenToStructure', () => {
  it('starts a CameraTween framed via structureFocusDistance', () => {
    const start = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0,
      pitch: 0,
      fovYRad: (Math.PI / 180) * 60,
    };
    const state = makeState({ cam, start });

    tweenToStructure(state, VIRGO);

    expect(start).toHaveBeenCalledOnce();
    const tween = start.mock.calls[0]![0];
    expect(Array.from(tween.toTarget as ArrayLike<number>)).toEqual([10, 20, 30]);
    // VIRGO has no apparentRadiusMpc → the helper frames the physical core
    // (2 Mpc), passing the camera's live fovY.
    expect(tween.toDistance).toBe(structureFocusDistance(2, cam.fovYRad));
  });

  it('frames the wider apparent radius when the structure carries one', () => {
    const start = vi.fn();
    const cam = {
      target: [0, 0, 0] as [number, number, number],
      distance: 100,
      yaw: 0,
      pitch: 0,
      fovYRad: (Math.PI / 180) * 60,
    };
    const state = makeState({ cam, start });

    // Apparent extent (6 Mpc) is wider than the physical core (2 Mpc); the
    // fade reads the apparent radius, so the framing must too.
    const withApparent: StructureRecord = { ...VIRGO, apparentRadiusMpc: 6 };
    tweenToStructure(state, withApparent);

    const tween = start.mock.calls[0]![0];
    expect(tween.toDistance).toBe(structureFocusDistance(6, cam.fovYRad));
  });

  it('is a no-op when cam is null', () => {
    const start = vi.fn();
    const state = makeState({ cam: null, start });

    tweenToStructure(state, VIRGO);

    expect(start).not.toHaveBeenCalled();
  });
});
