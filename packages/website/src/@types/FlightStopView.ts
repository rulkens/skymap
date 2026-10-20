import type { FlightStill } from './FlightStill';

/** A stop of the Home flight as the page draws it: the words, its picture, and how far down the spine its ring stands. */
export type FlightStopView = {
  id: string;
  name: string;
  line: string;
  alt: string;
  still: FlightStill;
  spineTop: string;
};
