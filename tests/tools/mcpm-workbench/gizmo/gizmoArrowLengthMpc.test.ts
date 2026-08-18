import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { gizmoArrowLengthMpc } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoArrowLengthMpc';

describe('gizmoArrowLengthMpc', () => {
  it('holds 12% of the viewport-height fraction at the box center depth', () => {
    // eye at [0,0,-100], box center at origin ⇒ distToBoxCenter = 100. fovYRad picked
    // so tan(fovYRad/2) = 0.5 exactly (fovYRad = 2·atan(0.5)).
    // 0.12 · 2 · 100 · 0.5 = 12.
    const eyeMpc: Vec3 = [0, 0, -100];
    const boxCenterMpc: Vec3 = [0, 0, 0];
    const fovYRad = 2 * Math.atan(0.5);

    expect(gizmoArrowLengthMpc(eyeMpc, boxCenterMpc, fovYRad)).toBeCloseTo(12, 10);
  });

  it('scales only with camera distance, not box size — the constant-screen-size point', () => {
    const nearMpc: Vec3 = [0, 0, -100];
    const farMpc: Vec3 = [0, 0, -200];
    const boxCenterMpc: Vec3 = [0, 0, 0];
    const fovYRad = 2 * Math.atan(0.5);

    const near = gizmoArrowLengthMpc(nearMpc, boxCenterMpc, fovYRad);
    const far = gizmoArrowLengthMpc(farMpc, boxCenterMpc, fovYRad);

    expect(far).toBeCloseTo(2 * near, 10);
  });
});
