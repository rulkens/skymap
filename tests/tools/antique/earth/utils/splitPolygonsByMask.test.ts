/**
 * Cuts run in sequence, so a later cut's mask often borders, along shared
 * vertices, the notch an earlier cut took out of the unit: here DE-NW less the
 * Duchy of Westphalia against the Westphalian part of Kurköln's OHM shape
 * (both simplified to a few vertices; the mask touches the subject only along
 * the notch). mapshaper's -clip called that whole part inside, so the two
 * cuts' pieces overlapped and the dissolve gave Westphalia to Kurköln.
 */

import { describe, it, expect } from 'vitest';

import type { LonLatPolygons } from '../../../../../tools/antique/earth/@types/LonLatPolygons';
import { ringAreaKm2 } from '../../../../../tools/antique/earth/utils/ringAreaKm2';
import { splitPolygonsByMask } from '../../../../../tools/antique/earth/utils/splitPolygonsByMask';

const R = 6371;
// prettier-ignore
const SUBJECT: LonLatPolygons = [[[
  [8.8935613, 51.4714664], [9.335999, 51.553959], [9.460901, 51.831669], [8.983256, 52.264975],
  [8.022901, 52.06615], [7.97355, 52.312104], [7.561585, 52.371842], [6.981878, 52.213997],
  [6.716675, 51.899262], [5.928041, 51.806736], [6.193348, 51.509338], [5.972999, 50.781811],
  [6.372458, 50.329436], [7.599464, 50.733441], [7.8511691, 50.9242732], [7.7039909, 51.0621935],
  [7.8397858, 51.5565222], [8.8935613, 51.4714664],
]]];
// prettier-ignore
const MASK: LonLatPolygons = [[[
  [8.8935613, 51.4714664], [7.8397858, 51.5565222], [7.7039909, 51.0621935], [7.8511691, 50.9242732],
  [8.7576484, 51.1770831], [8.8935613, 51.4714664],
]]];
const areaOf = (polygons: LonLatPolygons) =>
  polygons.reduce(
    (sum, [outer, ...holes]) =>
      sum + ringAreaKm2(outer!, R) - holes.reduce((h, ring) => h + ringAreaKm2(ring, R), 0),
    0,
  );

describe('splitPolygonsByMask', () => {
  it('takes nothing for a mask that only borders the notch an earlier cut left', () => {
    const { inside, outside } = splitPolygonsByMask(SUBJECT, MASK);
    expect(areaOf(inside)).toBeLessThan(1);
    expect(areaOf(outside)).toBeCloseTo(areaOf(SUBJECT), 0);
  });
});
