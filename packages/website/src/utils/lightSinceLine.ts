import { twoFigures } from './twoFigures';

const LIGHT_KM_PER_SEC = 299_792.458;
// NASA's mean Earth to Moon distance, the same figure as the `moon-orbit-light` fact.
const MOON_KM = 384_400;

/** The footer's line: how far light has gone in the `seconds` this page has been open. */
export function lightSinceLine(seconds: number): string {
  const km = LIGHT_KM_PER_SEC * seconds;
  const far =
    km >= 1e9
      ? `${twoFigures(km / 1e9)} billion km`
      : km >= 1e6
        ? `${twoFigures(km / 1e6)} million km`
        : `${twoFigures(km)} km`;
  const moons = km / MOON_KM;
  const compared = moons >= 2 ? `, or ${twoFigures(moons)} times the distance to the Moon` : '';
  return `Since you opened this page, light has travelled ${far}${compared}.`;
}
