import { describe, it, expect, vi } from 'vitest';

// The sim harness runs `runFrame`; these two reach past the camera into the
// catalogs' demand and the DOM, neither of which a node test has.
vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { focusMoveClip } from '../../../../src/services/engine/camera/focusMoveClip';
import { focusMoveDurationMs } from '../../../../src/services/engine/camera/focusMoveDurationMs';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { setLens, startCameraTween } from '../../../../src/state/camera/cameraSlice';
import { degToRad } from '../../../../src/utils/math/degToRad';
import { DEFAULT_GEODESIC_TUNING } from '../../../../src/data/camera/focusMoveDefaults';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { relErr } from '../../../support/relErr';
import type { CameraTweenDescriptor } from '../../../../src/@types/camera/CameraTweenDescriptor';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const FOV = Math.PI / 3;

function geodesicMove(from: CameraPose, to: CameraPose): CameraTweenDescriptor {
  return {
    from,
    to,
    motion: { style: 'geodesic', tuning: DEFAULT_GEODESIC_TUNING, fovYRad: FOV },
    frame: DEFAULT_ORIENTATION,
  };
}

const unclamped = (ms: number) =>
  ms > DEFAULT_GEODESIC_TUNING.minMs && ms < DEFAULT_GEODESIC_TUNING.maxMs;

describe('focusMotions', () => {
  it('the geodesic clip ends exactly at focusMoveDurationMs', () => {
    const d = geodesicMove(
      { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
      { target: [500, 0, 0], yaw: 1, pitch: 0.2, distance: 2 },
    );
    const durationMs = focusMoveDurationMs(d);
    expect(unclamped(durationMs)).toBe(true);

    expect(relErr(compileClip(focusMoveClip(d)).durationSec * 1000, durationMs)).toBeLessThan(
      1e-12,
    );
  });

  it('a geodesic re-focus with to.target === from.target is a finite pure zoom', () => {
    const target: Vec3 = [3, -2, 1];
    const d = geodesicMove(
      { target, yaw: 0.4, pitch: 0.1, distance: 10 },
      { target, yaw: 0.4, pitch: 0.1, distance: 0.01 },
    );
    const endSec = focusMoveDurationMs(d) / 1000;
    expect(unclamped(endSec * 1000)).toBe(true);

    const data = focusMoveClip(d);
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = evaluateClip(data, f * endSec);
      expect([...pose.target, pose.distance].every(Number.isFinite)).toBe(true);
    }
    const landed = evaluateClip(data, endSec);
    expect(landed.target).toEqual(target);
    expect(relErr(landed.distance, 0.01)).toBeLessThan(1e-9);
  });

  it('a geodesic move ignores the live FOV', () => {
    const fly = (fovDeg: number | null) => {
      const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
      h.store.dispatch(
        startCameraTween(
          geodesicMove(
            { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 },
            { target: [30, 0, 0], yaw: 0.5, pitch: 0.1, distance: 5 },
          ),
        ),
      );
      // Before the first frame, so the clip compiles (and memoises) under the new lens.
      if (fovDeg !== null) h.store.dispatch(setLens(degToRad(fovDeg)));
      // 1.6 s, past the ~0.83 s flight: the retirement frame is compared too.
      return Array.from({ length: 100 }, () => {
        h.frame();
        const { register, outputs } = h.state.cameraRuntime;
        return {
          winner: register.winner,
          displayed: outputs.displayed,
          fovYRad: outputs.projection.fovYRad,
        };
      });
    };
    const steady = fly(null);
    const dragged = fly(100);

    expect(dragged[0]!.fovYRad).not.toBe(steady[0]!.fovYRad);
    expect(dragged[10]!.winner).toBe('tween');
    expect(dragged.at(-1)!.winner).not.toBe('tween');
    const flight = (frames: typeof steady) =>
      frames.map(({ winner, displayed }) => ({ winner, displayed }));
    expect(flight(dragged)).toEqual(flight(steady));
  });
});
