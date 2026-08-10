/**
 * sampleArmRidgeNodes — the arm-ridge walk shared by `pushArmRidges`
 * (galaxyFieldMixture.ts) and the young-star chain producer (see
 * docs/superpowers/specs/2026-08-09-young-stars-field-design.md §3):
 * uniform log-radius steps along `armRidgeCurvePoint`, each node's arc
 * spacing to its neighbour (forward difference, backward at the open
 * end — an arm isn't periodic like a ring) and its fade*clump*survival
 * modulation, left un-normalized so each consumer picks its own law.
 */
import { armFadeEnvelope, armRidgeCurvePoint, armRidgeFrameAt } from './armRidgeGeometry';
import { distance3 } from '../../../../utils/math/distance3';
import type { GalaxyArmRidgeNode } from '../../../../@types/galaxy/GalaxyArmRidgeNode';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** armStarSample's along-arm low-frequency modulation; 1 (no modulation) when clumpAmount is 0. */
function armClumpMod(logR: number, geometry: GalaxyDescription, arm: GalaxyFieldArmRecord): number {
  if (geometry.clumpAmount <= 0) return 1;
  const noise =
    Math.sin(logR * arm.clumpF1 + arm.clumpP1) * 0.6 +
    Math.sin(logR * arm.clumpF2 + arm.clumpP2) * 0.4;
  return 1 - geometry.clumpAmount * (0.5 - 0.5 * noise);
}

/** armStarSample's gap-survival fraction for non-HII stars — the smooth stand-in for the WGSL gate's coin flip. */
function armSurvival(clumpMod: number, geometry: GalaxyDescription): number {
  return geometry.clumpAmount > 0 ? Math.min(1, 0.4 + 0.6 * clumpMod) : 1;
}

export function sampleArmRidgeNodes(
  count: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): readonly GalaxyArmRidgeNode[] {
  const logStart = arm.spanStartLogR;
  const logEnd = Math.log(arm.fadeRadius / geometry.armStartRadius);
  if (count < 2 || logEnd <= logStart) return [];

  // Centres first, uniform steps in log-radius — spacing/frame/mod below
  // are all derived from this curve.
  const logRs: number[] = [];
  const radii: number[] = [];
  const centers: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    const logR = logStart + ((logEnd - logStart) * k) / (count - 1);
    logRs.push(logR);
    radii.push(geometry.armStartRadius * Math.exp(logR));
    centers.push(armRidgeCurvePoint(logR, geometry, arm));
  }

  const nodes: GalaxyArmRidgeNode[] = [];
  for (let k = 0; k < count; k++) {
    const spacing =
      k < count - 1
        ? distance3(centers[k]!, centers[k + 1]!)
        : distance3(centers[k - 1]!, centers[k]!);
    const fade = armFadeEnvelope(radii[k]!, geometry, arm);
    const clump = armClumpMod(logRs[k]!, geometry, arm);
    const survival = armSurvival(clump, geometry);
    nodes.push({
      logR: logRs[k]!,
      radius: radii[k]!,
      center: centers[k]!,
      spacing,
      frame: armRidgeFrameAt(logRs[k]!, geometry, arm),
      mod: fade * clump * survival,
    });
  }
  return nodes;
}
