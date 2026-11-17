/**
 * antiqueMoonSubject — how far the Moon has become the plate's subject, 0–1, on the
 * weight its cartouche title takes (`antiquePlateTitle`): the plate then fades what
 * belongs to a star chart (the sky's rulings, the border's keys and numerals, trails,
 * the figures), as a selenographer's plate carries none of it. Stars keep.
 */

import { ANTIQUE_GLOBE_TITLES } from '../../../../data/rendering/antiqueGlobeTitles';
import { antiqueGlobeSubject } from '../../../../utils/gpu/antiqueLook/antiqueGlobeSubject';
import type { antiqueTitleGlobe } from './antiqueTitleGlobe';

export function antiqueMoonSubject(globe: ReturnType<typeof antiqueTitleGlobe>): number {
  if (globe?.id !== 'moon') return 0;
  return antiqueGlobeSubject(globe, globe.centreLonLat !== null, ANTIQUE_GLOBE_TITLES.moon!);
}
