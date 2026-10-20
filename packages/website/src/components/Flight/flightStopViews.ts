/* flightStopViews — the flight's stops joined to their stills, their captions and what each still shows. */
import type { FlightStill } from '../../@types/FlightStill';
import type { FlightStopView } from '../../@types/FlightStopView';
import { FLIGHT_STOPS } from '../../data/flightStops.ts';
import { fact } from '../../data/fact.ts';

// What each still shows, by stop id: written from the frames, so re-read them after `npm run site:media`.
const ALT: Record<string, string> = {
  earth:
    'Earth seen from space, with labelled stars and galaxies around it. This is the first frame of the flight.',
  'moon-orbit': 'The Moon’s orbit as a thin ring around a small Earth, against labelled stars.',
  'outer-planets': 'The orbits of the planets as nested rings around the Sun, against the stars.',
  'nearby-stars': 'A dense field of stars, some with name labels.',
  'milky-way':
    'A spiral galaxy seen from outside under the label You are here, with two small companion galaxies below it.',
  'local-group':
    'A pale disc labelled Local Group among other labelled discs, on a field of points.',
  'cosmic-web':
    'A purple and gold glow across one corner of a field of galaxies, with pale discs marking clusters.',
  surveys: 'A bright knot of points with dark gaps cut into it, thinning outwards.',
  universe: 'A thin blue sphere enclosing a small cloud of galaxies in two fans.',
};

export function flightStopViews(stills: readonly FlightStill[]): FlightStopView[] {
  return FLIGHT_STOPS.map((stop, i) => ({
    id: stop.id,
    name: stop.name,
    line: stop.line ?? (stop.factId ? (fact(stop.factId).short ?? '') : ''),
    alt: ALT[stop.id]!,
    still: stills[i]!,
    // Evenly spaced, whatever the scroll between two stops; the fill of the line follows the same spacing.
    spineTop: `${((i / (FLIGHT_STOPS.length - 1)) * 100).toFixed(2)}%`,
  }));
}
