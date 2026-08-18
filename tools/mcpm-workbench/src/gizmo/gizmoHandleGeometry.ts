import type { GizmoHandleGeometry } from '../../@types/GizmoHandleGeometry';
import type { GridBox } from '../../@types/GridBox';
import type { Handle } from '../../@types/Handle';
import type { RingHandle } from '../../@types/RingHandle';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { boxHalfExtentMpc } from '../field/boxHalfExtentMpc';

/** World-space pick tolerance, as a fraction of min(halfExtentMpc) — sized off the box itself,
 *  not screen-space-constant. Resize handles only; translate arrows rebase onto their own
 *  arrowLengthMpc (see pickGizmoHandle.ts) since they hold a constant screen size instead. */
export const PICK_TOLERANCE_FRACTION = 0.05;

/** Rotate-ring radius, as a fraction of `arrowLengthMpc` — the SAME constant-screen-size
 *  length the translate arrows use, NOT a fraction of half-extent (spec §5's original
 *  sizing). RULING (supersedes spec §5, same reasoning as F1.11's arrow-length change): a
 *  box-scaled ring would swallow a tiny box or vanish off-screen on a huge one — the exact
 *  problem F1.11 fixed for the arrows. 1.3 (revised from an initial 0.8) sits the rings
 *  OUTSIDE the arrow tips — clear visual separation between the two handle families, at
 *  maintainer request. */
export const RING_RADIUS_FRACTION = 1.3;

function addScaled(center: Readonly<Vec3>, dir: Readonly<Vec3>, scale: number): Vec3 {
  return [center[0] + dir[0] * scale, center[1] + dir[1] * scale, center[2] + dir[2] * scale];
}

function translateHandle(
  axis: 0 | 1 | 2,
  axisDir: Readonly<Vec3>,
  center: Readonly<Vec3>,
  arrowLengthMpc: number,
): Handle {
  return {
    id: { kind: 'translate', axis },
    positionMpc: addScaled(center, axisDir, arrowLengthMpc),
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
  radiusMpc: number,
): RingHandle {
  return {
    id: { kind: 'rotate', axis },
    centerMpc: [center[0], center[1], center[2]],
    axisDir: [axisDir[0], axisDir[1], axisDir[2]],
    radiusMpc,
  };
}

/**
 * gizmoHandleGeometry — world-space position/direction for every gizmo handle (spec §5's "Handle
 * set" table), built from `box` and the caller-supplied axis directions. Callers pass UNIT_AXES
 * before the box has a rotation, `boxBasisVectors(box.rotation)` after (F2.5's axes swap) — this
 * function doesn't care which. `arrowLengthMpc` is the translate-arrow reach, computed by the
 * caller via gizmoArrowLengthMpc.ts so it holds a constant screen size instead of scaling with
 * the box; resize stays box-scaled, rotate rides arrowLengthMpc too (RING_RADIUS_FRACTION above).
 */
export function gizmoHandleGeometry(
  box: GridBox,
  axes: readonly [Readonly<Vec3>, Readonly<Vec3>, Readonly<Vec3>],
  arrowLengthMpc: number,
): GizmoHandleGeometry {
  const half = boxHalfExtentMpc(box.sizeMpc);
  const center = box.centerMpc;
  const ringRadiusMpc = RING_RADIUS_FRACTION * arrowLengthMpc;

  return {
    translate: [
      translateHandle(0, axes[0], center, arrowLengthMpc),
      translateHandle(1, axes[1], center, arrowLengthMpc),
      translateHandle(2, axes[2], center, arrowLengthMpc),
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
      rotateHandle(0, axes[0], center, ringRadiusMpc),
      rotateHandle(1, axes[1], center, ringRadiusMpc),
      rotateHandle(2, axes[2], center, ringRadiusMpc),
    ],
  };
}
