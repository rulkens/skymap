import type { FeedbackFlight } from '../../../../../tools/site/@types/FeedbackFlight';
import type { FlightTimeline } from '../../@types/FlightTimeline';
import { clamp } from '../../utils/clamp';
import { flightAt } from '../../utils/flightAt';

// The tall track the flight scrolls through (`Flight-track`, the module's class).
const FLIGHT_TRACK = '[class*="Flight-track"]';

/** The flight's progress, read the way the flight reads it, so a note says where in the film it was. */
export function flightState(): FeedbackFlight | null {
  const flight = document.querySelector<HTMLElement>('[data-flight]');
  const track = flight?.querySelector<HTMLElement>(FLIGHT_TRACK);
  if (!flight?.dataset.timeline || !track) return null;
  const timeline = JSON.parse(flight.dataset.timeline) as FlightTimeline;
  const progress = clamp(
    -track.getBoundingClientRect().top / (track.offsetHeight - innerHeight),
    0,
    1,
  );
  return {
    progress: Number(progress.toFixed(4)),
    filmSec: Number(flightAt(timeline, progress).sec.toFixed(3)),
  };
}
