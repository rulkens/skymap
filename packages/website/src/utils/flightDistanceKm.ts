import { FLIGHT_PATH } from '../data/flightPath';

/** The app's `easeInOutCubic`, the ease the clip's pull-back uses. */
const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

/** How far the flight's camera is from Earth's centre, in km, `sec` seconds into the film. */
export function flightDistanceKm(sec: number): number {
  const { startKm, farKm, legSec } = FLIGHT_PATH;
  const u = easeInOutCubic(Math.max(0, Math.min(1, sec / legSec)));
  return startKm * (farKm / startKm) ** u;
}
