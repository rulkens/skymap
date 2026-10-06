/**
 * A short silent film of one manifest picture in motion, made to repeat
 * without a seam. `shot` is the row of siteShots.ts it starts from, so its
 * first frame is that picture and the picture can stand in until the film
 * arrives. `motion`, with the clock stopped: `orbit` takes the camera once
 * round what it looks at, `swayDeg` swings it that many degrees to each side
 * and back. `clockDays` leaves the camera where it is and runs the app's
 * clock over that many days, which must bring the scene back to where it
 * began.
 */
export type SiteLoop = {
  id: string;
  shot: string;
  motion: 'orbit' | { swayDeg: number } | { clockDays: number };
  seconds: number;
};
