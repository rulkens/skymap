/**
 * The site's copy of the flight's camera path against the clip the film was
 * recorded from: a re-tuned clip (new far distance, new duration, another
 * ease) must fail here, or the distance printed beside the flight goes wrong
 * without anything else noticing.
 */
import { describe, expect, it } from 'vitest';

import { FLIGHT_PATH } from '../../../packages/website/src/data/flightPath';
import { fact } from '../../../packages/website/src/data/fact';
import { flightDistanceKm } from '../../../packages/website/src/utils/flightDistanceKm';
import { earthUniverseLoop } from '../../../src/data/animation/clips/earthUniverseLoop';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const clip = earthUniverseLoop(0).data;
// The timeline is all([seq([the pull-back, ...]), the turn]); JSON flattens its readonly unions for the test.
const flight = JSON.parse(JSON.stringify(clip.timeline[0])).children[0].children[0];
const startMpc = (clip.start as { distance: number }).distance;
const MOON_KM = 384_400;

describe('flight camera path', () => {
  it('matches the clip: start, far end, duration, ease and log spacing', () => {
    expect(FLIGHT_PATH.startKm).toBeCloseTo(startMpc / SCALE_UNITS.KM_TO_MPC, 2);
    expect(FLIGHT_PATH.farKm / (flight.to / SCALE_UNITS.KM_TO_MPC)).toBeCloseTo(1, 9);
    expect(flight).toMatchObject({
      ch: 'distance',
      over: FLIGHT_PATH.legSec,
      ease: 'easeInOutCubic',
      space: 'log',
    });
  });

  it('starts and ends on the clip’s distances and is half way, in decades, at half time', () => {
    expect(flightDistanceKm(0)).toBeCloseTo(FLIGHT_PATH.startKm, 6);
    expect(flightDistanceKm(FLIGHT_PATH.legSec) / FLIGHT_PATH.farKm).toBeCloseTo(1, 9);
    const mid = Math.sqrt(FLIGHT_PATH.startKm * FLIGHT_PATH.farKm);
    expect(flightDistanceKm(FLIGHT_PATH.legSec / 2) / mid).toBeCloseTo(1, 9);
  });

  it('is a few Moon distances out at the Moon’s-orbit stop: the orbit fits, Mars does not', () => {
    const moons = flightDistanceKm(20.5) / MOON_KM;
    expect(moons).toBeGreaterThan(2);
    expect(moons).toBeLessThan(20);
  });

  it('the fact row states the same numbers', () => {
    const text = fact('flight-camera-path').text;
    expect((Math.round(FLIGHT_PATH.startKm / 10) * 10).toLocaleString('en-GB')).toBe('19,140');
    expect(text).toContain('19,140 kilometres');
    expect(text).toContain(
      `${flight.to.toLocaleString('en-GB')} megaparsecs in ${flight.over} seconds`,
    );
  });
});
