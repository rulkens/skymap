/** A place on the flight: the second in the recording where it is on screen, its name, and the fact whose `short` is its one-sentence caption. */
export type FlightStop = {
  atSec: number;
  name: string;
  factId?: string;
};
