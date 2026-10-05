import type { FlightStop } from '../@types/FlightStop';

/**
 * The stops on the hero flight, as seconds into `earth-to-universe-v1.mp4`.
 * Timings were read by looking at sampled frames, and each name is something
 * drawn or labelled on screen at that second (the Moon never appears in this
 * recording, so it is not a stop). Re-check them if `tools/site/heroMediaPlan.ts`
 * changes its cut points.
 */
export const FLIGHT_STOPS: readonly FlightStop[] = [
  { atSec: 0, name: 'Earth' },
  { atSec: 28, name: 'The outer planets', factId: 'neptune-voyager2' },
  { atSec: 32.5, name: 'The nearby stars', factId: 'voyager1-to-proxima' },
  { atSec: 40, name: 'The Milky Way, drawn', factId: 'galactic-centre-light' },
  { atSec: 44, name: 'The Local Group', factId: 'andromeda-light' },
  { atSec: 47.5, name: 'The cosmic web', factId: 'cosmic-web-map' },
  { atSec: 55, name: 'The surveyed galaxies', factId: 'survey-gaps' },
  { atSec: 62, name: 'The observable universe' },
];
