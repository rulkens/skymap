/**
 * The hero flight's stops drive captions that scroll over footage: out of
 * order, past the cut or over budget they break silently, so they are pinned here.
 */
import { describe, expect, it } from 'vitest';

import { FLIGHT_STOPS } from '../../../packages/website/src/data/flightStops';
import { fact } from '../../../packages/website/src/data/fact';
import { HERO_MEDIA } from '../../../tools/site/heroMediaPlan';

describe('flight stops', () => {
  it('rise strictly through the cut, starting at the first frame', () => {
    expect(FLIGHT_STOPS[0]!.atSec).toBe(0);
    FLIGHT_STOPS.forEach((stop, i) => {
      if (i > 0) expect(stop.atSec, stop.name).toBeGreaterThan(FLIGHT_STOPS[i - 1]!.atSec);
      expect(stop.atSec, stop.name).toBeLessThan(HERO_MEDIA.outSec - HERO_MEDIA.inSec);
    });
  });

  it('every caption is a sourced fact of at most 25 words', () => {
    for (const stop of FLIGHT_STOPS.filter((s) => s.factId)) {
      const line = fact(stop.factId!).short;
      expect(line, stop.name).toBeTruthy();
      expect(line!.split(/\s+/).length, stop.name).toBeLessThanOrEqual(25);
    }
  });
});
