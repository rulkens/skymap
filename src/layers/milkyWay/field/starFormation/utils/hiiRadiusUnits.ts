import { pcToUnits } from '../../mixture/utils/pcToUnits';

/** Strömgren radius of the faintest region drawn, parsecs — Orion-class. */
const RADIUS_MIN_PC = 10;

/**
 * R_s ~ Q^(1/3) and L_Ha ~ Q, so radius is the cube root of the luminosity
 * draw. Size and brightness come from ONE draw rather than two independent
 * ones — a bright compact knot and a faint giant are both unphysical.
 */
export function hiiRadiusUnits(luminosity: number, radiusScale: number): number {
  return pcToUnits(RADIUS_MIN_PC) * Math.cbrt(luminosity) * radiusScale;
}
