import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import type { LensSpec } from '../../@types/rendering/LensSpec';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Select and weight the in-view cluster lenses for one frame.
 *
 * Gravitational lensing in the points pass needs a short list of foreground
 * clusters, each with an Einstein radius. This picks them:
 *
 *   - Only `category === 'cluster'` structures lens (superclusters/voids/groups
 *     are diffuse or underdense — not point-like deflectors).
 *   - Only clusters IN FRONT of the camera (a background source must sit behind
 *     the lens to be deflected; a cluster behind the eye can't lens what you
 *     see). "In front" is `dot(cam→cluster, cam→target) > 0`.
 *   - Each cluster's Einstein radius is the master angle scaled by its
 *     normalised-M500 `significance` (a coarse mass proxy). Clusters with no
 *     significance carry no mass estimate, so they're skipped rather than given
 *     an invented strength.
 *   - Capped to the `maxLenses` most significant, since the shader loops over
 *     every lens per vertex (the per-vertex ALU + iOS-headroom bound).
 *
 * `masterThetaRad` is the UI Einstein radius (radians) for a significance-1
 * cluster; `0` (slider at rest) returns no lenses. The result feeds
 * `PointDrawSettings.lenses` → `packPointUniforms`.
 */
export function buildClusterLenses(
  structures: readonly StructureInfo[],
  camPos: Readonly<Vec3>,
  target: Readonly<Vec3>,
  masterThetaRad: number,
  maxLenses: number,
): LensSpec[] {
  if (masterThetaRad <= 0 || maxLenses <= 0) return [];

  // Camera forward (need not be unit — we only test the sign of the dot).
  const fx = target[0] - camPos[0];
  const fy = target[1] - camPos[1];
  const fz = target[2] - camPos[2];

  const candidates: { center: Vec3; significance: number }[] = [];
  for (const s of structures) {
    if (s.category !== 'cluster') continue;
    const significance = s.significance ?? 0;
    if (significance <= 0) continue;

    const dx = s.worldPos[0] - camPos[0];
    const dy = s.worldPos[1] - camPos[1];
    const dz = s.worldPos[2] - camPos[2];
    // In front of the camera: positive projection onto the view direction.
    if (dx * fx + dy * fy + dz * fz <= 0) continue;

    candidates.push({ center: [s.worldPos[0], s.worldPos[1], s.worldPos[2]], significance });
  }

  // Most massive first, then keep the top maxLenses.
  candidates.sort((a, b) => b.significance - a.significance);
  candidates.length = Math.min(candidates.length, maxLenses);

  return candidates.map((c) => ({ center: c.center, thetaERad: masterThetaRad * c.significance }));
}
