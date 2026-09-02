import { describe, expect, it } from 'vitest';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import { volpathKeyFor } from '../../../../tools/mcpm-workbench/src/render/volpathKeyFor';
import type { McpmCameraView } from '../../../../tools/mcpm-workbench/src/render/writeMcpmCamera';

const CAM: McpmCameraView = {
  eyeMpc: [0, 0, 600],
  targetMpc: [0, 0, 0],
  upMpc: [0, 1, 0],
  fovYRad: 1,
  viewportPx: [800, 600],
};

const { pathTracer } = defaultAppState.view;

describe('volpathKeyFor', () => {
  it('is unchanged when only sampleCap moves — a cap change must not reset accumulation', () => {
    const before = volpathKeyFor(CAM, pathTracer);
    const after = volpathKeyFor(CAM, { ...pathTracer, sampleCap: pathTracer.sampleCap * 8 });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('differs when a real pathTracer param moves', () => {
    const before = volpathKeyFor(CAM, pathTracer);
    const after = volpathKeyFor(CAM, { ...pathTracer, divisor: pathTracer.divisor + 1 });
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });

  it('differs when the camera moves', () => {
    const before = volpathKeyFor(CAM, pathTracer);
    const after = volpathKeyFor({ ...CAM, eyeMpc: [1, 0, 600] }, pathTracer);
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });
});
