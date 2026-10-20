/**
 * A short silent film that repeats without a seam, starting from the manifest picture `shot`. `motion`: `orbit` takes
 * the camera once round its target, `swayDeg` swings it to each side and back, `clockDays` runs the app's clock over
 * a span that must bring the scene back to where it began. `width` is the film's, in pixels, where it is not a disc;
 * its height follows the picture's shape.
 */
export type SiteLoop = {
  id: string;
  shot: string;
  motion: 'orbit' | { swayDeg: number } | { clockDays: number };
  seconds: number;
  width?: number;
};
