import type { GizmoHandleGeometry } from '../../@types/GizmoHandleGeometry';
import type { GridBox } from '../../@types/GridBox';
import type { Handle } from '../../@types/Handle';
import type { RingHandle } from '../../@types/RingHandle';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';

/** Arrow tip distance from center, as a fraction of that axis' half-extent — inside the face
 *  (< 1) so the arrow never pokes through the box wall. */
export const ARROW_REACH_FRACTION = 0.6;

/** World-space pick tolerance, as a fraction of min(halfExtentMpc) — sized off the box itself,
 *  not screen-space-constant (see spec §5's "Handle geometry and picking"). */
export const PICK_TOLERANCE_FRACTION = 0.05;

/** Rotate-ring radius, as a fraction of min(halfExtentMpc) — F2's constant, defined here beside
 *  its ARROW/PICK siblings; F1's rotate handles stay radiusMpc 0 stubs regardless. */
export const RING_RADIUS_FRACTION = 0.8;

function addScaled(center: Readonly<Vec3>, dir: Readonly<Vec3>, scale: number): Vec3 {
  return [center[0] + dir[0] * scale, center[1] + dir[1] * scale, center[2] + dir[2] * scale];
}

function translateHandle(
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  center: Readonly<Vec3>,
  half: Readonly<Vec3>,
): Handle {
  return {
    id: { kind: 'translate', axis },
    positionMpc: addScaled(center, axisDir, ARROW_REACH_FRACTION * half[axis]),
    axisDir: [axisDir[0], axisDir[1], axisDir[2]],
  };
}

function resizeHandle(
  axis: 0 | 1 | 2,
  sign: 1 | -1,
  axisDir: Readonly<Vec3>,
  center: Readonly<Vec3>,
  half: Readonly<Vec3>,
): Handle {
  return {
    id: { kind: 'resize', axis, sign },
    positionMpc: addScaled(center, axisDir, sign * half[axis]),
    axisDir: [axisDir[0], axisDir[1], axisDir[2]],
  };
}

function rotateHandle(
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  center: Readonly<Vec3>,
): RingHandle {
  return {
    id: { kind: 'rotate', axis },
    centerMpc: [center[0], center[1], center[2]],
    axisDir: [axisDir[0], axisDir[1], axisDir[2]],
    radiusMpc: 0, // F1 stub — F2 sets RING_RADIUS_FRACTION * min(halfExtentMpc)
  };
}

/**
 * gizmoHandleGeometry — world-space position/direction for every gizmo handle (spec §5's "Handle
 * set" table), built from `box` and the caller-supplied axis directions. F1 always passes
 * UNIT_AXES; F2 passes the box's own rotated basis instead — this function doesn't care which,
 * so it needs no change when F2 lands (spec §5, "Handle set").
 */
export function gizmoHandleGeometry(
  box: GridBox,
  axes: readonly [Readonly<Vec3>, Readonly<Vec3>, Readonly<Vec3>],
): GizmoHandleGeometry {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const center = box.centerMpc;

  return {
    translate: [
      translateHandle(0, axes[0], center, half),
      translateHandle(1, axes[1], center, half),
      translateHandle(2, axes[2], center, half),
    ],
    resize: [
      resizeHandle(0, 1, axes[0], center, half),
      resizeHandle(0, -1, axes[0], center, half),
      resizeHandle(1, 1, axes[1], center, half),
      resizeHandle(1, -1, axes[1], center, half),
      resizeHandle(2, 1, axes[2], center, half),
      resizeHandle(2, -1, axes[2], center, half),
    ],
    rotate: [
      rotateHandle(0, axes[0], center),
      rotateHandle(1, axes[1], center),
      rotateHandle(2, axes[2], center),
    ],
  };
}
