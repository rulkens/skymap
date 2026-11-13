/**
 * antiqueGlobeSubject — how far a globe with a title (`ANTIQUE_GLOBE_TITLES` row) is the
 * plate's subject, 0–1: its size (`antiqueGlobePlateWeight`), and, beside the plate's
 * centre, the share of the plate it covers. On the ground looking up the plate is the
 * sky's, unless the globe is airless and lists `groundCover`: on the Moon its ground in
 * the frame keeps the selenographer's plate (earthrise).
 */

import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../data/rendering/antiqueLook';
import { smoothstep } from '../../math/smoothstep';
import { antiqueGlobePlateWeight } from './antiqueGlobePlateWeight';

const COVER = [0.3, 0.5] as const;

export function antiqueGlobeSubject(
  globe: { readonly radiusUnits: number; readonly coverage: number },
  centreOnGlobe: boolean,
  row: {
    readonly span?: readonly [number, number];
    readonly groundCover?: readonly [number, number];
  },
): number {
  // Underfoot: wider than the plate is tall, the eye stands on it.
  const cover =
    row.groundCover && globe.radiusUnits > ANTIQUE_REFERENCE_HEIGHT_CSS ? row.groundCover : COVER;
  const centred = centreOnGlobe ? 1 : smoothstep(cover[0], cover[1], globe.coverage);
  return antiqueGlobePlateWeight(globe.radiusUnits, row.span) * centred;
}
