import { describe, expect, it } from 'vitest';
import { starFocusRelCam } from '../../../../../src/layers/starCatalog/render/cut/starFocusRelCam';
import { ZERO_FOCUS } from '../../../../../src/services/engine/subsystems/structureFocusSubsystem';

describe('starFocusRelCam', () => {
  it('the packed focus centre is camera-relative', () => {
    // 1 kpc + 3 pc away on x: the f64 subtraction keeps the 3 pc that an f32
    // subtraction of the absolute coordinates would round off.
    const camera: [number, number, number] = [1e-3, 0, 0];
    const focus = {
      center: [1e-3 + 3e-6, 2e-6, 0] as const,
      apparentRadiusMpc: 1e-5,
      physicalRadiusMpc: 5e-6,
      blend: 1,
    };
    const sphere = starFocusRelCam(focus, camera);
    expect(sphere.centerRelCamMpc[0]).toBeCloseTo(3e-6, 12);
    expect(sphere.centerRelCamMpc[1]).toBeCloseTo(2e-6, 12);
    expect(sphere.blend).toBe(1);
  });

  it('blend 0 packs a multiplier-neutral sphere', () => {
    const sphere = starFocusRelCam(ZERO_FOCUS, [0.5, 0.5, 0.5]);
    expect(sphere.blend).toBe(0);
    // Equal smoothstep edges would give the shader a NaN even at blend 0.
    expect(sphere.apparentRadiusMpc).not.toBe(sphere.physicalRadiusMpc);
    expect(sphere.apparentRadiusMpc).toBeGreaterThan(0);
  });
});
