/**
 * sampleClipPath — precompute a clip's camera path into a `ClipPathSnapshot` for
 * the debug inspector.
 *
 * Runs ONCE on the "Calculate" click (never per frame). It walks the clip
 * uniformly in TIME via the pure `evaluateClip`, reconstructs the eye from each
 * pose, and tags every sample with a perceived (scale-space) speed normalised to
 * [0,1] across the path.
 *
 * ### Why scale-space speed, normalised
 *
 * Raw world speed (|Δeye|/Δt) is dominated by the long cosmic fly-in legs and
 * goes ~0 near a framed waypoint — it can't show a corner-whip. The flyPath
 * primitive paces in SCALE space (lateral motion as angular size + radial motion
 * in log-distance per second), so we measure speed the same way:
 *
 *   ds = sqrt( (|Δeye| / midDist)² + (Δ ln distance)² )   ,   speed = ds / Δt
 *
 * The dynamic range across a path is huge, so we normalise to the path's own
 * [min,max] → the blue→red colour ramp always uses its full range regardless of
 * the absolute scale. A degenerate flat path (max==min) maps everything to 0.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { ClipId } from '../../../@types/animation/ClipId';
import type { ClipPathSnapshot } from '../../../@types/engine/debug/ClipPathSnapshot';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import { evaluateClip } from '../camera/evaluateClip';
import { yawPitchToDir } from '../../../utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../utils/math/rotateVec3ByTightMat3';

/** Reconstruct the eye position from a pose via the orbit convention. */
function eyeOf(
  target: Vec3,
  distance: number,
  yaw: number,
  pitch: number,
  frameBasis: Mat3 | undefined,
): Vec3 {
  const dir = rotateVec3ByTightMat3(yawPitchToDir(yaw, pitch), frameBasis);
  return [
    target[0] + distance * dir[0],
    target[1] + distance * dir[1],
    target[2] + distance * dir[2],
  ];
}

export function sampleClipPath(
  clipId: ClipId,
  data: ClipData,
  durationSec: number,
  sampleCount: number,
  frameBasis?: Mat3,
): ClipPathSnapshot {
  const n = Math.max(2, Math.floor(sampleCount));

  // Pass 1: poses + eyes at uniform times.
  const t: number[] = new Array(n);
  const eye: Vec3[] = new Array(n);
  const target: Vec3[] = new Array(n);
  const distance: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ti = (i / (n - 1)) * durationSec;
    const pose = evaluateClip(data, ti, frameBasis);
    t[i] = ti;
    eye[i] = eyeOf(pose.target, pose.distance, pose.yaw, pose.pitch, frameBasis);
    target[i] = pose.target;
    distance[i] = pose.distance;
  }

  // Pass 2: raw scale-space speed per sample (forward difference; the last
  // sample reuses the prior segment's speed so the array is fully populated).
  const rawSpeed: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const dt = t[i + 1]! - t[i]!;
    const a = eye[i]!;
    const b = eye[i + 1]!;
    const lateral = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const midDist = Math.exp(0.5 * (Math.log(distance[i]!) + Math.log(distance[i + 1]!)));
    const dLog = Math.log(distance[i + 1]!) - Math.log(distance[i]!);
    const angular = lateral / midDist;
    const ds = Math.sqrt(angular * angular + dLog * dLog);
    rawSpeed[i] = dt > 0 ? ds / dt : 0;
  }
  rawSpeed[n - 1] = rawSpeed[n - 2]!;

  // Pass 3: normalise to [0,1] across the path's own range.
  let min = Infinity;
  let max = -Infinity;
  for (const v of rawSpeed) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;

  return {
    clipId,
    durationSec,
    samples: Array.from({ length: n }, (_, i) => ({
      t: t[i]!,
      eye: eye[i]!,
      target: target[i]!,
      distance: distance[i]!,
      speed01: span > 0 ? (rawSpeed[i]! - min) / span : 0,
    })),
  };
}
