/** galacticYearMyr — Sun's orbital period (lap time = circumference / speed), Myr. */
import { SCALE_UNITS } from '../../data/scaleUnits';

const SECONDS_PER_MYR = 60 * 60 * 24 * 365.25 * 1e6; // Julian year × 1e6

export function galacticYearMyr(sunToCentreMpc: number, orbitSpeedKmS: number): number {
  const sunToCentreKm = sunToCentreMpc / SCALE_UNITS.KM_TO_MPC;
  const circumferenceKm = 2 * Math.PI * sunToCentreKm;
  return circumferenceKm / orbitSpeedKmS / SECONDS_PER_MYR;
}
