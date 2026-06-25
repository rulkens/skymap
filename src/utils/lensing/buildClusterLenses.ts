import type { StructureInfo } from '../../@types/data/structure/StructureInfo';
import type { LensSpec } from '../../@types/rendering/LensSpec';
import type { Vec3 } from '../../@types/math/Vec3';
import { clusterLensDeflection } from './clusterLensDeflection';

/**
 * Select the in-view cluster lenses for one frame and precompute their
 * eye-relative geometry.
 *
 * ### What drives lensing
 *
 * Lensing is now driven by each cluster's PHYSICAL R500 (`physicalRadiusMpc`)
 * via the SIS closed-form `α∞ = K · R500²` from `clusterLensDeflection`.
 * Every cluster with a positive R500 can lens — `significance` is a display
 * weight (ring brightness, label priority) but carries no lensing meaning.
 * Sorting by R500 descending (equivalently by α∞, since α∞ ∝ R500²) and
 * capping to `maxLenses` keeps the most strongly-deflecting clusters when
 * the cap bites.
 *
 * ### lensStrength
 *
 * `lensStrength` is a dimensionless multiplier applied to `α∞`:
 *   - 0   → off (early-out; no lenses returned)
 *   - 1   → physical deflection (tens of arcsec for a Coma-class cluster)
 *   - ~1000 → artistically exaggerated, visible to the eye
 *
 * ### Eye-relative geometry
 *
 * `dirLens` and `dL` are precomputed here so the shader does no per-vertex
 * world-space subtract, length, or normalize. Both are derived from the same
 * `toLens = worldPos − camPos` vector used for the in-front dot test — it is
 * never recomputed. The shader receives `dirLens` (unit vector, eye → cluster)
 * and `dL` (Mpc distance), and applies only the per-source `D_ls/D_s` factor
 * at draw time.
 *
 * ### Geometry is frame-local
 *
 * The result is valid only for the current camera pose. Call once per frame
 * before writing `packLensingUniforms`.
 *
 *   - Only `category === 'cluster'` structures lens; superclusters, voids, and
 *     groups are diffuse or underdense — not point-like deflectors.
 *   - Only clusters IN FRONT of the camera (`dot(cam→cluster, cam→target) > 0`).
 *   - Capped to `maxLenses` per the shader's ALU + iOS headroom budget.
 */
export function buildClusterLenses(
  structures: readonly StructureInfo[],
  camPos: Readonly<Vec3>,
  target: Readonly<Vec3>,
  lensStrength: number,
  maxLenses: number,
): LensSpec[] {
  if (lensStrength <= 0 || maxLenses <= 0) return [];

  // Camera forward vector — need not be unit; we only test the sign of the dot.
  const fx = target[0] - camPos[0];
  const fy = target[1] - camPos[1];
  const fz = target[2] - camPos[2];

  type Candidate = { dirLens: Vec3; dL: number; physicalRadiusMpc: number };
  const candidates: Candidate[] = [];

  for (const s of structures) {
    if (s.category !== 'cluster') continue;
    if (s.physicalRadiusMpc <= 0) continue;

    // Reuse toLens for both the in-front dot test and the geometry computation.
    const tx = s.worldPos[0] - camPos[0];
    const ty = s.worldPos[1] - camPos[1];
    const tz = s.worldPos[2] - camPos[2];

    // In front of the camera: positive projection onto the view direction.
    if (tx * fx + ty * fy + tz * fz <= 0) continue;

    const dL = Math.sqrt(tx * tx + ty * ty + tz * tz);
    // Skip degenerate case where the cluster is exactly at the camera position —
    // cannot normalise a zero-length vector.
    if (dL <= 0) continue;

    const dirLens: Vec3 = [tx / dL, ty / dL, tz / dL];
    candidates.push({ dirLens, dL, physicalRadiusMpc: s.physicalRadiusMpc });
  }

  // Sort by R500 descending (monotone in α∞ since α∞ ∝ R500²) so the most
  // strongly-deflecting clusters survive the cap.
  candidates.sort((a, b) => b.physicalRadiusMpc - a.physicalRadiusMpc);
  candidates.length = Math.min(candidates.length, maxLenses);

  return candidates.map((c) => {
    const { alphaInfRad, rsMpc } = clusterLensDeflection(c.physicalRadiusMpc);
    return {
      dirLens: c.dirLens,
      dL: c.dL,
      thetaERad: lensStrength * alphaInfRad,
      rsMpc,
    };
  });
}
