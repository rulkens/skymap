/**
 * Where the flight is at one scroll position: the stop it has last passed
 * (`index`; the film's end is one past the last stop), how far it is towards
 * the next (`travel`, 0 to 1), and the film time in seconds.
 */
export type FlightPose = {
  index: number;
  travel: number;
  sec: number;
};
