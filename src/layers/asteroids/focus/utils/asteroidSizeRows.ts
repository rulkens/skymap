/**
 * asteroidSizeRows — the card's size rows as [label, value]: a measured diameter (three figures) and
 * albedo, or a diameter range estimated from H over `ASTEROID_ESTIMATE_ALBEDOS` (two figures, since the
 * albedo guess spans a factor of 2.2), or nothing for a row with neither.
 */
import type { AsteroidInfo } from '../../selection/@types/AsteroidInfo';
import { ASTEROID_ESTIMATE_ALBEDOS as ALBEDOS } from '../data/asteroidEstimateAlbedos';
import { asteroidDiameterKmFromH } from '../../../../utils/photometry/asteroidDiameterKmFromH';
import { formatAsteroidDiameter } from './formatAsteroidDiameter';

export function asteroidSizeRows(
  target: Pick<AsteroidInfo, 'measuredSize' | 'absoluteMagnitude'>,
): readonly (readonly [string, string])[] {
  const { measuredSize, absoluteMagnitude: h } = target;
  if (measuredSize !== null) {
    const diameter = ['Diameter', formatAsteroidDiameter(measuredSize.diameterKm, 3)] as const;
    return measuredSize.albedo === null
      ? [diameter]
      : [diameter, ['Albedo', measuredSize.albedo.toPrecision(2)]];
  }
  if (h === null) return [];
  const low = formatAsteroidDiameter(asteroidDiameterKmFromH(h, ALBEDOS.bright), 2);
  const high = formatAsteroidDiameter(asteroidDiameterKmFromH(h, ALBEDOS.dark), 2);
  const unit = (text: string) => text.slice(text.lastIndexOf(' '));
  const range =
    unit(low) === unit(high) ? `${low.slice(0, -unit(low).length)}–${high}` : `${low}–${high}`;
  return [['Diameter (estimate)', range]];
}
