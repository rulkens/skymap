/**
 * Free look over a paused clip (S4 spec §2.4), through the real frame loop and the real player:
 * the clip driver yields, the drag moves the camera from the pose the clip drew, and re-attaching
 * shows the pose at t again.
 */

import { describe, expect, it, vi } from 'vitest';

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import {
  clipStarted,
  clipTransportSet,
  resolveClipStart,
} from '../../../../src/state/camera/cameraSlice';
import { tween } from '../../../../src/services/engine/animation/effectHelpers';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import type { CameraPose } from '../../../../src/@types/camera/pose/CameraPose';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };

describe('free look over a paused clip', () => {
  it('a sky drag moves the camera from the drawn pose; re-attaching shows the pose at t again', () => {
    const h = makeCameraSimHarness({ focusBody: null, bootHR: null, realClipPlayer: true });
    h.frame(2);
    const data = resolveClipStart(
      { timeline: [tween('yaw', { to: 1, over: 4, ease: 'linear' })] },
      START,
    );
    h.store.dispatch(clipStarted({ data, frame: DEFAULT_ORIENTATION, atEnd: 'revert' }));
    h.store.dispatch(clipTransportSet({ kind: 'paused', atSec: 2, camera: 'clip' }));
    h.frame(2);
    const atT = liveWorldPose(h.state);
    expect(atT.yaw).toBeCloseTo(0.5, 9);

    h.store.dispatch(clipTransportSet({ kind: 'paused', atSec: 2, camera: 'free' }));
    h.frame(1);
    expect(liveWorldPose(h.state).yaw).toBeCloseTo(0.5, 9);
    h.press('orbit', [50, 50]);
    h.moveTo([60, 50]);
    h.frame(1);
    h.release();
    h.frame(2);
    const flown = liveWorldPose(h.state);
    // The drag turned the camera from where the clip left it, not from the clip's start.
    expect(flown.yaw).not.toBeCloseTo(0.5, 3);
    expect(Math.abs(flown.yaw - 0.5)).toBeLessThan(Math.PI / 2);

    h.store.dispatch(clipTransportSet({ kind: 'paused', atSec: 2, camera: 'clip' }));
    h.frame(1);
    expect(liveWorldPose(h.state).yaw).toBeCloseTo(0.5, 9);
  });
});
