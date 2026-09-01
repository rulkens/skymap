import { describe, expect, it } from 'vitest';
import {
  defaultViewSlice,
  viewSlice,
} from '../../../../tools/mcpm-workbench/src/state/view/viewSlice';

const PITCH_LIMIT = 1.5;

describe('viewSlice commitCameraPose', () => {
  it('clamps pitch to +/-PITCH_LIMIT when out of range', () => {
    const over = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({
        yaw: 0,
        pitch: PITCH_LIMIT + 1,
        distance: 10,
        targetMpc: [0, 0, 0],
      }),
    );
    expect(over.camera.pitch).toBe(PITCH_LIMIT);

    const under = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({
        yaw: 0,
        pitch: -PITCH_LIMIT - 1,
        distance: 10,
        targetMpc: [0, 0, 0],
      }),
    );
    expect(under.camera.pitch).toBe(-PITCH_LIMIT);
  });

  it('floors distance at 1 when the payload is below it', () => {
    const next = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({ yaw: 0, pitch: 0, distance: 0.1, targetMpc: [0, 0, 0] }),
    );
    expect(next.camera.distance).toBe(1);
  });

  it('passes yaw/pitch/distance/targetMpc through unchanged when within range', () => {
    const next = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.commitCameraPose({
        yaw: 0.2,
        pitch: 0.5,
        distance: 42,
        targetMpc: [1, 2, 3],
      }),
    );
    expect(next.camera.yaw).toBe(0.2);
    expect(next.camera.pitch).toBe(0.5);
    expect(next.camera.distance).toBe(42);
    expect(next.camera.targetMpc).toEqual([1, 2, 3]);
  });
});
