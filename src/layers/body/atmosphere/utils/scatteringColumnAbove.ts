import type { AtmosphereConstituent } from '../@types/AtmosphereConstituent';

/**
 * scatteringColumnAbove — 0..1, the share of the scattering column (channel-mean scatter ×
 * scale height, per exponential constituent) above `altitudeKm` over the floor sphere. A
 * tent constituent (a layer aloft: Earth's ozone, Neptune's haze) is skipped: the sky that
 * lights the ground eye's surroundings is the exponential air.
 */
export function scatteringColumnAbove(
  constituents: readonly AtmosphereConstituent[],
  altitudeKm: number,
): number {
  let total = 0;
  let above = 0;
  for (const { scatter, profile } of constituents) {
    if (profile.kind !== 'exponential') continue;
    const column = ((scatter[0] + scatter[1] + scatter[2]) / 3) * profile.scaleHeightKm;
    total += column;
    above += column * Math.exp(-Math.max(altitudeKm, 0) / profile.scaleHeightKm);
  }
  return total > 0 ? above / total : 0;
}
