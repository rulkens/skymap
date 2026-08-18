import { describe, expect, it } from 'vitest';
import type { Ray } from '../../../../tools/mcpm-workbench/@types/Ray';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { dragRotate } from '../../../../tools/mcpm-workbench/src/gizmo/dragRotate';
import { multiplyQuat } from '../../../../src/utils/math/multiplyQuat';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import { rotateVec3ByQuat } from '../../../../src/utils/math/rotateVec3ByQuat';

// Ring in the xy plane (axisDir = +z), referenceDir = +x (0°-angle reference), so
// perp = axisDir x referenceDir = +y (90°-angle reference) — a plain unit circle.
const CENTER: Vec3 = [0, 0, 0];
const AXIS_DIR: Vec3 = [0, 0, 1];
const REFERENCE_DIR: Vec3 = [1, 0, 0];

describe('dragRotate', () => {
  it('returns a hand-computed angle for a known pick point', () => {
    // Pick point at 60° around the ring, radius 5: [5cos60°, 5sin60°, 0] = [2.5, 5*sqrt(3)/2, 0].
    // A ray straight along +z through that point hits the ring's own (z=0) plane exactly there.
    const pickPoint: Vec3 = [2.5, (5 * Math.sqrt(3)) / 2, 0];
    const ray: Ray = { origin: [pickPoint[0], pickPoint[1], -10], dir: [0, 0, 1] };

    const angle = dragRotate(ray, CENTER, AXIS_DIR, REFERENCE_DIR);

    expect(angle).not.toBeNull();
    expect(angle as number).toBeCloseTo(Math.PI / 3, 10);
  });

  it('returns null for a ray parallel to the ring plane', () => {
    // dir=[1,0,0] is perpendicular to axisDir=[0,0,1] — the ray never crosses the z=0 plane.
    const ray: Ray = { origin: [0, 0, 5], dir: [1, 0, 0] };

    expect(dragRotate(ray, CENTER, AXIS_DIR, REFERENCE_DIR)).toBeNull();
  });

  it('a full-turn composition from a fixed anchor reproduces the anchor rotation (spec §6)', () => {
    // The fixed-anchor recompute Viewport performs every pointermove: rotation' =
    // multiplyQuat(quatFromAxisAngle(axisDir, angle_now - angle_anchor), anchorRotation).
    // angle_now - angle_anchor = 2π (one full drag around the ring back to the start) must
    // reproduce anchorRotation, up to quaternion sign (q and -q are the same rotation) — compared
    // via rotateVec3ByQuat on a test vector, not raw component equality (spec §6).
    const anchorRotation = quatFromAxisAngle([0, 1, 0], Math.PI / 4); // some non-identity anchor
    const fullTurn = quatFromAxisAngle(AXIS_DIR, 2 * Math.PI);
    const composed = multiplyQuat(fullTurn, anchorRotation);

    const probe: Vec3 = [1, 2, 3];
    const expected = rotateVec3ByQuat(anchorRotation, probe);
    const actual = rotateVec3ByQuat(composed, probe);

    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
    expect(actual[2]).toBeCloseTo(expected[2], 9);
  });
});
