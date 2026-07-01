/**
 * cameraGizmoLines — the scrub gizmo for the debug clip-path inspector: at a
 * scrubbed instant it draws the camera's sightline (eye→target) and a frustum
 * outline (four edges from the eye to the corners of the view rectangle at the
 * target plane, plus that rectangle), so you can see where the camera looks and
 * roughly what it frames. Output order is fixed: [sight, edge×4, rect×4].
 */

import { describe, it, expect } from 'vitest';
import { cameraGizmoLines } from '../../../../src/services/engine/presentation/cameraGizmoLines';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const EYE: Vec3 = [0, 0, 0];
const TARGET: Vec3 = [0, 0, -10]; // looking down -Z
const FOV_Y = 0.5;
const ASPECT = 1;

describe('cameraGizmoLines', () => {
  it('emits a sightline plus a four-edge frustum and its rectangle (9 lines)', () => {
    const lines = cameraGizmoLines(EYE, TARGET, FOV_Y, ASPECT);
    expect(lines).toHaveLength(9);
    for (const l of lines) {
      expect(l.color).toHaveLength(4);
      expect(l.width).toBeGreaterThan(0);
    }
  });

  it('draws the sightline (line 0) from the eye to the target', () => {
    const sight = cameraGizmoLines(EYE, TARGET, FOV_Y, ASPECT)[0]!;
    expect(sight.from[0]).toBeCloseTo(0, 6);
    expect(sight.from[2]).toBeCloseTo(0, 6);
    expect(sight.to[2]).toBeCloseTo(-10, 6);
  });

  it('places the frustum corners (edges 1..4) at the target plane sized by fov + aspect', () => {
    const lines = cameraGizmoLines(EYE, TARGET, FOV_Y, ASPECT);
    const h = 10 * Math.tan(FOV_Y / 2); // half-extent at the target plane
    const corners = lines.slice(1, 5).map((l) => l.to);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(c[2]).toBeCloseTo(-10, 4); // on the target plane
      expect(Math.abs(c[0])).toBeCloseTo(h * ASPECT, 4);
      expect(Math.abs(c[1])).toBeCloseTo(h, 4);
    }
  });
});
