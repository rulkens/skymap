/**
 * forwardProjectPoint — the column-major mat4·vec4 world→clip→screen step
 * shared by the label declutter loop (`label2DDirector`), the star pick
 * projection (`projectToScreenPx`), and the leader-line lift
 * (`labelLeaderLine`): three sites that must agree on this arithmetic and,
 * before this primitive, didn't call each other to guarantee it. Mutates the
 * caller-owned `out` scratch rather than returning a fresh object, so a
 * per-label hot loop (`label2DDirector`'s `projectLabels`) allocates nothing.
 */
import type { Vec2 } from '../../@types/math/Vec2';
import type { ForwardProjectedPoint } from '../../@types/camera/ForwardProjectedPoint';

export function forwardProjectPoint(
  vp: Float32Array | Float64Array,
  x: number,
  y: number,
  z: number,
  viewportPx: Readonly<Vec2>,
  out: ForwardProjectedPoint,
): ForwardProjectedPoint {
  out.clipX = vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!;
  out.clipY = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
  out.clipZ = vp[2]! * x + vp[6]! * y + vp[10]! * z + vp[14]!;
  out.clipW = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
  if (out.clipW <= 0) {
    // Behind (or on) the camera plane: no meaningful screen position.
    // screenX/screenY are left stale — every caller checks clipW first.
    out.onScreen = false;
    return out;
  }
  const ndcX = out.clipX / out.clipW;
  const ndcY = out.clipY / out.clipW;
  out.screenX = (ndcX * 0.5 + 0.5) * viewportPx[0];
  // Flip Y: NDC +Y is up, screen +Y is down.
  out.screenY = (0.5 - ndcY * 0.5) * viewportPx[1];
  out.onScreen = ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
  return out;
}
