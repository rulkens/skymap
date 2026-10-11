/**
 * The mission's exit edge: the row bakes the pose the visitor SAW, and whichever row takes over
 * renders the same eye on the edge frame. Before the bake, the follow rows counted the mission
 * as their own author, so the approach eased toward the stale pre-exhibit `base` instead.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { isWorldArm } from '../../../../src/services/engine/camera/rungs/isWorldArm';
import { clearMission, setMission } from '../../../../src/state/camera/cameraSlice';
import { setSimDays } from '../../../../src/state/time/timeSlice';
import { missionStops } from '../../../../src/utils/exhibits/mission/missionStops';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { displayedEye } from '../../../helpers/camera/displayedEye';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { loadVoyagerStopWindows } from '../../../helpers/missions/loadVoyagerStopWindows';
import type { DriverId } from '../../../../src/@types/engine/camera/DriverId';

/** Voyager 1's mission camera in 1990, then the exit with `home` back in focus. */
function exitMission(home: 'earth' | null, successor: DriverId) {
  loadVoyagerStopWindows();
  const h = makeCameraSimHarness();
  h.frame(80);
  // Entry: the exhibit clears the focus and hands the camera to the craft.
  h.store.dispatch(setSimDays({ simDays: unixMsToJulianDays(Date.UTC(1990, 0, 1)), nowMs: 0 }));
  h.focus(null);
  h.store.dispatch(
    setMission({
      craftId: 'voyager1',
      stops: missionStops(MISSION_EVENTS.filter((e) => e.bodyId === 'voyager1')),
      cruise: { yaw: 0, pitch: 0.26 },
      offsets: { yaw: 0, pitch: 0, zoom: 1 },
      speedIndex: 2,
      reaim: false,
    }),
  );
  h.frame(30);
  expect(h.state.cameraRuntime.register.winner).toBe('mission');
  const lastEye = displayedEye(h.state);
  const shown = h.state.cameraRuntime.outputs.displayed;
  if (!isWorldArm(shown)) throw new Error('the mission flies the world arm');

  // The hold's `finally` clears the mission; the scene restore puts the home focus back.
  h.store.dispatch(clearMission());
  h.focus(home);
  h.frame(1);
  expect(h.state.cameraRuntime.register.winner).toBe(successor);
  const edgeEye = displayedEye(h.state);
  const step = Math.hypot(...edgeEye.map((v, i) => v - lastEye[i]!));
  return { step: step / shown.pose.distance, base: h.store.getState().camera.base, shown };
}

describe('exiting a mission', () => {
  it('to a moving home focus: the approach eases out of the eye on screen', () => {
    const { step, base, shown } = exitMission('earth', 'followApproach');
    expect(step).toBeLessThan(1e-9);
    expect(base).toEqual(shown);
  });

  it('with no home focus: the camera rests where the mission left it', () => {
    const { step, base, shown } = exitMission(null, 'resting');
    expect(step).toBeLessThan(1e-9);
    expect(base).toEqual(shown);
  });
});
