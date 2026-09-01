import { describe, expect, it } from 'vitest';
import {
  defaultViewSlice,
  viewSlice,
} from '../../../../tools/mcpm-workbench/src/state/view/viewSlice';

const PITCH_LIMIT = 1.5;

describe('viewSlice setCameraYawPitch', () => {
  it('clamps pitch to +/-PITCH_LIMIT when out of range', () => {
    const over = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.setCameraYawPitch({ yaw: 0, pitch: PITCH_LIMIT + 1 }),
    );
    expect(over.camera.pitch).toBe(PITCH_LIMIT);

    const under = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.setCameraYawPitch({ yaw: 0, pitch: -PITCH_LIMIT - 1 }),
    );
    expect(under.camera.pitch).toBe(-PITCH_LIMIT);
  });

  it('passes pitch through unchanged when within range', () => {
    const next = viewSlice.reducer(
      defaultViewSlice,
      viewSlice.actions.setCameraYawPitch({ yaw: 0.2, pitch: 0.5 }),
    );
    expect(next.camera.yaw).toBe(0.2);
    expect(next.camera.pitch).toBe(0.5);
  });
});

describe('viewSlice setCameraDistance', () => {
  it('floors distance at 1 when the payload is below it', () => {
    const next = viewSlice.reducer(defaultViewSlice, viewSlice.actions.setCameraDistance(0.1));
    expect(next.camera.distance).toBe(1);
  });

  it('passes distance through unchanged when at or above the floor', () => {
    const next = viewSlice.reducer(defaultViewSlice, viewSlice.actions.setCameraDistance(42));
    expect(next.camera.distance).toBe(42);
  });
});
