/**
 * Slice reducers — verifies immutable, surgical updates + canonical defaults.
 *
 * The flow slice is now the canonical flat `FlowSettings`. Each reducer must
 * return a NEW slice that changes only the named field and leaves the rest
 * untouched, so the store's reference-equality gate sees a real change. The
 * default is `DEFAULT_FLOW` with `enabled` forced true (the workbench is a
 * flow-tuning harness, so it shows ribbons immediately).
 */
import { describe, expect, it } from 'vitest';
import {
  defaultFlowSlice,
  setFlowParam,
} from '../../../../tools/flow-workbench/src/state/slices/flowSlice';
import { DEFAULT_FLOW } from '../../../../src/layers/flow/settings/defaults';
import {
  defaultCameraSlice,
  setCameraYawPitch,
  setCameraDistance,
} from '../../../../tools/flow-workbench/src/state/slices/cameraSlice';

describe('flowSlice', () => {
  it('setFlowParam updates only the named numeric key, immutably', () => {
    const result = setFlowParam(defaultFlowSlice, 'flowSpeed', 0.1);
    expect(result.flowSpeed).toBe(0.1);
    expect(result.trail).toBe(defaultFlowSlice.trail);
    expect(defaultFlowSlice.flowSpeed).toBe(DEFAULT_FLOW.flowSpeed); // prev untouched
  });
});

describe('cameraSlice', () => {
  it('setCameraYawPitch clamps pitch to [-1.5, 1.5]', () => {
    expect(setCameraYawPitch(defaultCameraSlice, 2, 5).pitch).toBe(1.5);
    expect(setCameraYawPitch(defaultCameraSlice, 2, -5).pitch).toBe(-1.5);
    expect(setCameraYawPitch(defaultCameraSlice, 2, 0).yaw).toBe(2);
    expect(defaultCameraSlice.pitch).toBe(0.35); // prev untouched
  });

  it('setCameraDistance clamps to the Mpc range [300, 4000]', () => {
    expect(setCameraDistance(defaultCameraSlice, 9999).distance).toBe(4000);
    expect(setCameraDistance(defaultCameraSlice, 10).distance).toBe(300);
    expect(setCameraDistance(defaultCameraSlice, 1200).distance).toBe(1200);
  });
});
