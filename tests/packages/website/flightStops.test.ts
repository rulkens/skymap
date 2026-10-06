/**
 * The stop table drives three things that must agree: the captions, the stills
 * `npm run site:media` cuts, and the frame the film rests on. Out of order,
 * off a film frame, past the cut or without its stills, the flight breaks
 * silently (a still that pops against the film, a blank stop), so it is pinned here.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLIGHT_STOPS } from '../../../packages/website/src/data/flightStops';
import { fact } from '../../../packages/website/src/data/fact';
import { HERO_MEDIA } from '../../../tools/site/heroMediaPlan';

const stills = resolve(import.meta.dirname, '../../../packages/website/src/assets/flight');

describe('flight stops', () => {
  it('rise strictly through the cut, starting at the first frame', () => {
    expect(FLIGHT_STOPS[0]!.atSec).toBe(0);
    FLIGHT_STOPS.forEach((stop, i) => {
      if (i > 0) expect(stop.atSec, stop.name).toBeGreaterThan(FLIGHT_STOPS[i - 1]!.atSec);
      expect(stop.atSec, stop.name).toBeLessThan(HERO_MEDIA.outSec - HERO_MEDIA.inSec);
    });
  });

  it('each rests on a whole film frame, so the still and the film show the same picture', () => {
    for (const stop of FLIGHT_STOPS) {
      expect(Number.isInteger(stop.atSec * HERO_MEDIA.fps), stop.name).toBe(true);
    }
  });

  it('each has a unique id with both committed stills', () => {
    expect(new Set(FLIGHT_STOPS.map((s) => s.id)).size).toBe(FLIGHT_STOPS.length);
    for (const stop of FLIGHT_STOPS) {
      for (const shape of ['landscape', 'portrait']) {
        const file = resolve(stills, `${stop.id}-${shape}.avif`);
        expect(existsSync(file), `${file} (run npm run site:media)`).toBe(true);
      }
    }
  });

  it('every caption is a sourced fact of at most 25 words', () => {
    for (const stop of FLIGHT_STOPS.filter((s) => s.factId)) {
      const line = fact(stop.factId!).short;
      expect(line, stop.name).toBeTruthy();
      expect(line!.split(/\s+/).length, stop.name).toBeLessThanOrEqual(25);
    }
  });
});
