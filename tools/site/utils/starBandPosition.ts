import type { StarBandPosition } from '../@types/StarBandPosition';

const RAD = Math.PI / 180;

/**
 * A star's place on a band of sky round the great circle through both celestial poles and right ascension
 * `centreRaDeg`, with the band starting where that circle crosses the equator. Going south along the band is down
 * the page. Mercator across the band is conformal, so a constellation keeps its shape; at the 40° a wide screen
 * reaches it is stretched by 1.3, evenly in both directions.
 */
export function starBandPosition(raDeg: number, decDeg: number, centreRaDeg: number): StarBandPosition {
  const dRa = (raDeg - centreRaDeg) * RAD;
  const dec = decDeg * RAD;
  // The star's unit vector in a frame whose x points at the band's start, y east and z north.
  const x = Math.cos(dec) * Math.cos(dRa);
  const y = Math.cos(dec) * Math.sin(dRa);
  const z = Math.sin(dec);
  const north = Math.atan2(z, x) / RAD;
  const across = Math.asin(Math.max(-1, Math.min(1, y)));
  return {
    along: (((-north % 360) + 360) % 360),
    across: Math.log(Math.tan(Math.PI / 4 + across / 2)) / RAD,
  };
}
