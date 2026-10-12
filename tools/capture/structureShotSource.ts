import { STRUCTURE_IDS_BY_SCALE } from '../../src/data/structure/structureIdsByScale';
import { structureAngularDiameterDeg } from './structureAngularDiameterDeg';
import type { StructureId } from '../../src/@types/data/structure/StructureId';
import type { StructureShotSource } from './@types/StructureShotSource';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';

/**
 * Past this angular diameter a cluster or group fills too much sky for a
 * survey cutout to frame (the Local Group surrounds us; Virgo, Fornax and the
 * nearest groups would show empty plate), so the app renders them instead.
 */
const MAX_CUTOUT_DIAMETER_DEG = 5;

/** Categories shot as a sky cutout when compact enough; the rest render in-app. */
const CUTOUT_IF_COMPACT: readonly StructureId[] = ['galaxy-cluster', 'galaxy-group'];

/**
 * Where a featured anchor's thumbnail comes from — the one decision both
 * capture tools share, so each anchor is shot by exactly one of them.
 */
export function structureShotSource(s: StructureInfo): StructureShotSource {
  if (STRUCTURE_IDS_BY_SCALE.milkyWay.includes(s.category)) return 'cutout';
  if (!CUTOUT_IF_COMPACT.includes(s.category)) return 'render';
  const diameter = structureAngularDiameterDeg(s.physicalRadiusMpc, Math.hypot(...s.worldPos));
  return diameter > MAX_CUTOUT_DIAMETER_DEG ? 'render' : 'cutout';
}
