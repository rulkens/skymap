import type { FlightStop } from '../@types/FlightStop';

/**
 * The stops on the hero flight, as seconds into `earth-to-universe-v1.mp4`.
 * This table drives the page (captions, scroll pacing, where the film rests)
 * and `npm run site:media`, which cuts one still per stop at `atSec`: change a
 * time and re-run the tool, or the still and the film disagree. Each name is
 * something drawn or labelled on screen at that second; every time is a whole
 * frame of the 24 fps film (a multiple of 0.5 s).
 */
export const FLIGHT_STOPS: readonly FlightStop[] = [
  { id: 'earth', atSec: 0, name: 'Earth' },
  { id: 'moon-orbit', atSec: 20.5,name: 'The Moon’s orbit', factId: 'moon-orbit-light' },
  { id: 'outer-planets', atSec: 28, name: 'The outer planets', factId: 'neptune-voyager2' },
  { id: 'nearby-stars', atSec: 32.5, name: 'The nearby stars', factId: 'voyager1-to-proxima' },
  { id: 'milky-way', atSec: 41, name: 'The Milky Way, drawn', factId: 'galactic-centre-light' },
  { id: 'local-group', atSec: 44, name: 'The Local Group', factId: 'andromeda-light', portraitX: 0.56 },
  { id: 'cosmic-web', atSec: 49, name: 'The cosmic web, computed', factId: 'cosmic-web-map', portraitX: 0.27 },
  { id: 'surveys', atSec: 55, name: 'The galaxy surveys', factId: 'survey-gaps' },
  { id: 'universe', atSec: 65.5,name: 'The observable universe', factId: 'observable-edge', portraitZoom: 0.4 },
];
