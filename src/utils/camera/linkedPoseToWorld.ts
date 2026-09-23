/**
 * linkedPoseToWorld — a `#pose=` link value as the world `CameraPose` it shows
 * at `simDays`, so a clip can open (or land) on a pose someone shared. The
 * body and site arms co-rotate with their host, hence the instant; the
 * ladder's own `refoldTo` does the descent, so a clip reads a link exactly as
 * the app does on load.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { CameraPose } from '../../@types/camera/CameraPose';
import type { Mat3 } from '../../@types/math/Mat3';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { refoldTo } from '../../services/engine/camera/rungs/refoldTo';
import { isWorldArm } from '../../services/engine/camera/rungs/isWorldArm';
import { decodeFramedPose } from '../url/decodeFramedPose';
import { datumOnlyTerrainHeight } from './datumOnlyTerrainHeight';

export function linkedPoseToWorld(
  value: string,
  simDays: number,
  basis: Readonly<Mat3>,
): CameraPose {
  const framed = decodeFramedPose(value);
  if (framed === null) throw new Error(`linkedPoseToWorld: undecodable pose '${value}'`);
  const world = refoldTo(framed, 'absolute', {
    bodies: deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>,
    poseBasis: basis,
    upBasis: basis,
    terrainHeightAt: datumOnlyTerrainHeight,
  });
  if (!isWorldArm(world)) throw new Error('linkedPoseToWorld: refoldTo did not land the world arm');
  return world.pose;
}
