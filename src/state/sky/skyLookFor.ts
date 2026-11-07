/**
 * skyLookFor — where a search while standing turns the head (spec §7): at the target, framed by
 * its angular size, or, below the horizon, at where it rises (D7). A row with a body-table pose
 * (planets, moons, craft, the Sun) is placed through the 48 h rise search at its own position;
 * anything else is fixed on the sky and never rises when its declination against the host's
 * equator says so (D8). The Sun in a polar night is a body: it rises again, just not soon.
 */
import type { PlacedRow } from '../../@types/engine/selection/PlacedRow';
import type { SkyLook } from '../../@types/sky/SkyLook';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { BodyState } from '../../@types/scene/BodyState';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { altAzFromSpot } from '../../utils/sky/altAzFromSpot';
import { framedLensRad } from '../../utils/sky/framedLensRad';
import { neverRises } from '../../utils/sky/neverRises';
import { nextRiseAt } from '../../utils/sky/nextRiseAt';
import { spotWorldMpc } from '../../utils/sky/spotWorldMpc';
import { selectionDriver } from '../../utils/selection/selectionDriver';
import { SKY_RISE_HORIZON_DAYS } from '../../data/sky/skyRiseHorizonDays';

export function skyLookFor(
  row: PlacedRow,
  spot: SkySpot,
  simDays: number,
  currentLensRad: number,
): SkyLook {
  const bodies = deriveBodyStates(simDays);
  const now = altAzFromSpot(spot, row.positionMpc, bodies);
  if (now.altitudeRad >= 0) {
    const eye = spotWorldMpc(spot, bodies.get(spot.body as unknown as PositionedId)!);
    const p = row.positionMpc;
    const distanceMpc = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    const isStar = row.type === 'starCatalog';
    return {
      kind: 'look',
      ...now,
      fovYRad: framedLensRad(row.radiusMpc, distanceMpc, currentLensRad, isStar),
    };
  }
  const poseId = selectionDriver(row)?.poseId ?? null;
  if (poseId === null) {
    // Seen from the host's north pole, a target's altitude is its declination.
    const pole: SkySpot = { body: spot.body, lonRad: 0, latRad: Math.PI / 2 };
    const declinationRad = altAzFromSpot(pole, row.positionMpc, bodies).altitudeRad;
    if (neverRises(declinationRad, spot.latRad)) {
      return { kind: 'belowHorizon', azimuthRad: now.azimuthRad, riseAt: null, neverRises: true };
    }
  }
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
