/**
 * Where the flight is at one scroll position: the stop it is on or leaving
 * (`index`; the arrival is one past the last stop), how far it has travelled
 * towards the next (`travel`, 0 while resting), how much of the next stop's
 * still shows (`mix`), and the film time in seconds.
 */
export type FlightPose = {
  index: number;
  travel: number;
  mix: number;
  sec: number;
};
