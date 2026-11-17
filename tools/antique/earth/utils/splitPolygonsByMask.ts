/**
 * splitPolygonsByMask — the parts of `subject` inside and outside `mask`
 * (polygon-clipping, planar in lon/lat). Not mapshaper -clip: it called a mask
 * part inside whole when it only bordered the subject along shared vertices,
 * which is exactly how a later cut meets the notch an earlier cut left.
 */

import polygonClipping from 'polygon-clipping';

import type { LonLatPolygons } from '../@types/LonLatPolygons';

export function splitPolygonsByMask(
  subject: LonLatPolygons,
  mask: LonLatPolygons,
): { inside: LonLatPolygons; outside: LonLatPolygons } {
  if (mask.length === 0) return { inside: [], outside: subject };
  const s = subject as polygonClipping.MultiPolygon;
  const m = mask as polygonClipping.MultiPolygon;
  return { inside: polygonClipping.intersection(s, m), outside: polygonClipping.difference(s, m) };
}
