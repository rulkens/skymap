/**
 * Slice reducers — verifies immutable, surgical updates + spike-parity defaults.
 *
 * Each reducer must return a NEW slice that changes only the named field and
 * leaves every untouched sub-object referentially identical (so a downstream
 * shallow-equal selector can skip work). The flow defaults are pinned to the
 * exact spike values: the visualization tuning was hand-dialled there and any
 * drift would silently change the look.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultFlowSlice,
  setFlowMode,
  setFlowParam,
} from '../../../../tools/flow-workbench/src/state/slices/flowSlice';
import { defaultViewSlice, toggleLayer } from '../../../../tools/flow-workbench/src/state/slices/viewSlice';
import {
  defaultCameraSlice,
  setCameraViewProj,
  setCameraYawPitch,
  setCameraDistance,
  setAutoRotate,
} from '../../../../tools/flow-workbench/src/state/slices/cameraSlice';
import type { Mat4 } from '../../../../src/@types/math/Mat4';

describe('flowSlice', () => {
  it('defaultFlowSlice matches the spike advect/streamline defaults', () => {
    expect(defaultFlowSlice).toEqual({
      mode: 'streamline',
      advect: {
        count: 40000,
        flowSpeed: 0.06,
        densityBias: 1,
        wander: 0.15,
        trail: 0.003,
        size: 0.0012,
        exposure: 0.3,
        contrast: 2.3,
      },
      streamline: {
        count: 40000,
        flowSpeed: 0.49,
        densityBias: 1,
        wander: 0,
        trail: 0.013,
        size: 0.001,
        exposure: 0.22,
        contrast: 3,
      },
    });
  });

  it('setFlowParam updates only the named param of the active mode, immutably', () => {
    const result = setFlowParam(defaultFlowSlice, 'advect', 'flowSpeed', 0.1);
    expect(result.advect.flowSpeed).toBe(0.1);
    // The other mode's object keeps its reference.
    expect(result.streamline).toBe(defaultFlowSlice.streamline);
    // The original slice is untouched.
    expect(defaultFlowSlice.advect.flowSpeed).toBe(0.06);
  });

  it('setFlowMode switches mode without touching either mode params', () => {
    const result = setFlowMode(defaultFlowSlice, 'advect');
    expect(result.mode).toBe('advect');
    expect(result.advect).toBe(defaultFlowSlice.advect);
    expect(result.streamline).toBe(defaultFlowSlice.streamline);
  });
});

describe('viewSlice', () => {
  it('toggleLayer flips the named view boolean immutably', () => {
    const result = toggleLayer(defaultViewSlice, 'densityVolume');
    expect(result.densityVolume).toBe(true);
    expect(result.flowField).toBe(defaultViewSlice.flowField);
    expect(defaultViewSlice.densityVolume).toBe(false);
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

  it('setCameraDistance clamps to [0.6, 7]', () => {
    expect(setCameraDistance(defaultCameraSlice, 100).distance).toBe(7);
    expect(setCameraDistance(defaultCameraSlice, 0.1).distance).toBe(0.6);
    expect(setCameraDistance(defaultCameraSlice, 2).distance).toBe(2);
  });

  it('setAutoRotate flips the flag immutably', () => {
    const result = setAutoRotate(defaultCameraSlice, false);
    expect(result.autoRotate).toBe(false);
    expect(defaultCameraSlice.autoRotate).toBe(true);
  });
});
