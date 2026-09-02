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
});
