/**
 * commitMilkyWayFocus — invariants for the Milky Way focus-commit protocol.
 *
 * Parallel to `commitGalaxyFocus.test.ts` / `commitStructureFocus.test.ts`:
 *   1. setSelected(MILKY_WAY_INFO)
 *   2. setFocused(MILKY_WAY_INFO)
 *   3. tweenToCameraSnapshot(state, snapshot @ MILKY_WAY_VIEW_DISTANCE_MPC)
 *
 * The Milky Way is a singleton, so both slots latch the same static const.
 * Guard: a no-op when `state.cam` is null (pre-bootstrap / post-destroy),
 * mirroring the retired `focusOnMilkyWay` method's guard.
 *
 * `tweenToCameraSnapshot` is mocked so we assert call shape without driving
 * the tween subsystem (it has its own coverage in `cameraSnapshot.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const tweenSpy = vi.fn();
vi.mock('../../../../src/services/engine/camera/cameraSnapshot', () => ({
  tweenToCameraSnapshot: (...args: unknown[]) => tweenSpy(...args),
}));

import { commitMilkyWayFocus } from '../../../../src/services/engine/helpers/commitMilkyWayFocus';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../../src/data/milkyWay/galacticCenter';

function makeFixtures(camNull = false) {
  const setSelected = vi.fn<(t: unknown) => void>();
  const setFocused = vi.fn<(t: unknown) => void>();
  const cam = camNull ? null : { yaw: 1, pitch: 0.2, fovYRad: 1.0, near: 0.01, far: 1000 };
  const state = {
    cam,
    subsystems: { selection: { setSelected, setFocused } },
  } as unknown as EngineState;
  return { state, setSelected, setFocused };
}

describe('commitMilkyWayFocus', () => {
  beforeEach(() => {
    tweenSpy.mockClear();
  });

  it('sets both the select and focus slots to MILKY_WAY_INFO', () => {
    const { state, setSelected, setFocused } = makeFixtures();
    commitMilkyWayFocus(state);
    expect(setSelected).toHaveBeenCalledWith(MILKY_WAY_INFO);
    expect(setFocused).toHaveBeenCalledWith(MILKY_WAY_INFO);
  });

  it('tweens to MILKY_WAY_VIEW_DISTANCE_MPC at MILKY_WAY_CENTER_WORLD', () => {
    const { state } = makeFixtures();
    commitMilkyWayFocus(state);
    expect(tweenSpy).toHaveBeenCalledOnce();
    const snapshot = tweenSpy.mock.calls[0]![1]!;
    expect(snapshot.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(snapshot.target[0]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[0]);
    expect(snapshot.target[1]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[1]);
    expect(snapshot.target[2]).toBeCloseTo(MILKY_WAY_CENTER_WORLD[2]);
  });

  it('is a no-op when state.cam is null', () => {
    const { state, setSelected, setFocused } = makeFixtures(true);
    commitMilkyWayFocus(state);
    expect(setSelected).not.toHaveBeenCalled();
    expect(setFocused).not.toHaveBeenCalled();
    expect(tweenSpy).not.toHaveBeenCalled();
  });
});
