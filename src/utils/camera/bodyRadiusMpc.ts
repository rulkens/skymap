import { SOLAR_RADIUS_KM } from '../../data/bodies/solarRadiusKm';
import { SCENE_CELESTIAL_BODIES } from '../../data/bodies/sceneCelestialBodies';
import { SCALE_UNITS } from '../../data/scaleUnits';

/** A planet's datum radius in Mpc; the Sun's for `undefined`; 0 for an id the scene does not hold. */
export function bodyRadiusMpc(planetId: string | undefined): number {
  if (planetId === undefined) return SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC;
  const row = SCENE_CELESTIAL_BODIES.find((b) => b.id === planetId);
  return row === undefined ? 0 : (row.surface.datumRadiusM / 1000) * SCALE_UNITS.KM_TO_MPC;
}
