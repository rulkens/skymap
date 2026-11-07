/**
 * skyLookFor — where a search while standing turns the head (spec §7): at the target, framed by
 * its angular size, or, below the horizon, at where it rises (D7). One physical rule by range:
 * beyond `SKY_FIXED_BEYOND_MPC` a target is fixed on the sky and never rises when its declination
 * against the host's equator says so (D8), else rises where `nextRiseAt` finds it; nearer, the
 * 48 h rise search follows it (by its pose id, else where it is now). The Sun in a polar night
 * is near: it rises again, just not soon.
 */
import type { PlacedRow } from '../../@types/engine/selection/PlacedRow';
import type { SkyLook } from '../../@types/sky/SkyLook';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { BodyState } from '../../@types/scene/BodyState';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { altAzFromSpot } from '../../utils/sky/altAzFromSpot';
import { framedLensRad } from '../../utils/sky/framedLensRad';
import { declinationAt } from '../../utils/sky/declinationAt';
import { neverRises } from '../../utils/sky/neverRises';
import { nextRiseAt } from '../../utils/sky/nextRiseAt';
import { spotWorldMpc } from '../../utils/sky/spotWorldMpc';
import { selectionDriver } from '../../utils/selection/selectionDriver';
import { SKY_RISE_HORIZON_DAYS } from '../../data/sky/skyRiseHorizonDays';
import { SKY_FIXED_BEYOND_MPC } from '../../data/sky/skyFixedBeyondMpc';

export function skyLookFor(
  row: PlacedRow,
  spot: SkySpot,
  simDays: number,
  currentLensRad: number,
): SkyLook {
  const bodies = deriveBodyStates(simDays);
  const now = altAzFromSpot(spot, row.positionMpc, bodies);
  const eye = spotWorldMpc(spot, bodies.get(spot.body as unknown as PositionedId)!);
  const p = row.positionMpc;
  const distanceMpc = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
  if (now.altitudeRad >= 0) {
    const isStar = row.type === 'starCatalog';
    return {
      kind: 'look',
      ...now,
      fovYRad: framedLensRad(row.radiusMpc, distanceMpc, currentLensRad, isStar),
    };
  }
  const fixed = distanceMpc > SKY_FIXED_BEYOND_MPC;
  if (fixed && neverRises(declinationAt(spot.body, row.positionMpc, bodies), spot.latRad)) {
    return { kind: 'belowHorizon', azimuthRad: now.azimuthRad, riseAt: null, neverRises: true };
  }
  const poseId = fixed ? null : (selectionDriver(row)?.poseId ?? null);
  const targetAt = (at: ReadonlyMap<PositionedId, BodyState>) =>
    poseId === null ? row.positionMpc : (at.get(poseId)?.positionMpc ?? row.positionMpc);
  const riseAt = nextRiseAt(spot, simDays, targetAt, SKY_RISE_HORIZON_DAYS);
  if (riseAt === null) {
    return { kind: 'belowHorizon', azimuthRad: now.azimuthRad, riseAt, neverRises: false };
  }
  const atRise = deriveBodyStates(riseAt);
  const { azimuthRad } = altAzFromSpot(spot, targetAt(atRise), atRise);
  return { kind: 'belowHorizon', azimuthRad, riseAt, neverRises: false };
}
