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
  setFlowEnabled,
  setFlowMode,
  setFlowParam,
} from '../../../../tools/flow-workbench/src/state/slices/flowSlice';
import { DEFAULT_FLOW } from '../../../../src/data/defaults';
import {
  defaultCameraSlice,
  setCameraViewProj,
  setCameraYawPitch,
  setCameraDistance,
  setAutoRotate,
} from '../../../../tools/flow-workbench/src/state/slices/cameraSlice';
import type { Mat4 } from '../../../../src/@types/math/Mat4';

describe('flowSlice', () => {
  it('defaultFlowSlice is DEFAULT_FLOW with enabled forced true', () => {
    expect(defaultFlowSlice).toEqual({ ...DEFAULT_FLOW, enabled: true });
  });

  it('setFlowEnabled flips the master gate immutably', () => {
    const result = setFlowEnabled(defaultFlowSlice, false);
    expect(result.enabled).toBe(false);
    expect(defaultFlowSlice.enabled).toBe(true); // prev untouched
  });

  it('setFlowMode switches mode without touching other fields', () => {
    const result = setFlowMode(defaultFlowSlice, 'streamline');
    expect(result.mode).toBe('streamline');
    expect(result.intensity).toBe(defaultFlowSlice.intensity);
    expect(result.count).toBe(defaultFlowSlice.count);
    expect(defaultFlowSlice.mode).toBe('advect'); // DEFAULT_FLOW mode, prev untouched
  });

  it('setFlowParam updates only the named numeric key, immutably', () => {
    const result = setFlowParam(defaultFlowSlice, 'flowSpeed', 0.1);
    expect(result.flowSpeed).toBe(0.1);
    expect(result.trail).toBe(defaultFlowSlice.trail);
    expect(defaultFlowSlice.flowSpeed).toBe(DEFAULT_FLOW.flowSpeed); // prev untouched
  });
});

describe('cameraSlice', () => {
  it('setCameraViewProj replaces only viewProj', () => {
    const next: Mat4 = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    const result = setCameraViewProj(defaultCameraSlice, next);
    expect(result.viewProj).toBe(next);
    expect(result.yaw).toBe(defaultCameraSlice.yaw);
    expect(result.pitch).toBe(defaultCameraSlice.pitch);
    expect(result.distance).toBe(defaultCameraSlice.distance);
    expect(result.autoRotate).toBe(defaultCameraSlice.autoRotate);
  });

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

  it('setAutoRotate flips the flag immutably', () => {
    const result = setAutoRotate(defaultCameraSlice, false);
    expect(result.autoRotate).toBe(false);
    expect(defaultCameraSlice.autoRotate).toBe(true);
  });
});
