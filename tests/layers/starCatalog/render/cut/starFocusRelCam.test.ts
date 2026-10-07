import { describe, expect, it } from 'vitest';
import { starFocusRelCam } from '../../../../../src/layers/starCatalog/render/cut/starFocusRelCam';
import {
  writeStarFocus,
  FOCUS_CENTER_FLOAT_INDEX,
  FOCUS_APPARENT_FLOAT_INDEX,
  FOCUS_PHYSICAL_FLOAT_INDEX,
  FOCUS_BLEND_FLOAT_INDEX,
  STAR_UNIFORM_BYTES,
} from '../../../../../src/layers/starCatalog/render/starCatalogLayout';
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
    const scratch = new Float32Array(STAR_UNIFORM_BYTES / 4);
    writeStarFocus(scratch, starFocusRelCam(focus, camera));
    expect(scratch[FOCUS_CENTER_FLOAT_INDEX]).toBeCloseTo(3e-6, 12);
    expect(scratch[FOCUS_CENTER_FLOAT_INDEX + 1]).toBeCloseTo(2e-6, 12);
    expect(scratch[FOCUS_BLEND_FLOAT_INDEX]).toBe(1);
  });

  it('at rest the packed sphere is multiplier-neutral with non-degenerate radii', () => {
    const scratch = new Float32Array(STAR_UNIFORM_BYTES / 4);
    writeStarFocus(scratch, starFocusRelCam(ZERO_FOCUS, [0.5, 0.5, 0.5]));
    expect(scratch[FOCUS_BLEND_FLOAT_INDEX]).toBe(0);
    // Equal smoothstep edges would give the shader a NaN even at blend 0.
    expect(scratch[FOCUS_APPARENT_FLOAT_INDEX]).not.toBe(scratch[FOCUS_PHYSICAL_FLOAT_INDEX]);
    expect(scratch[FOCUS_APPARENT_FLOAT_INDEX]).toBeGreaterThan(0);
  });
});
