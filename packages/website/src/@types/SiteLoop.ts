/**
 * A short silent film that repeats without a seam, starting from the manifest picture `shot`. `motion`: `orbit` takes
 * the camera once round its target, `swayDeg` swings it to each side and back, `clockDays` runs the app's clock over
 * a span that must bring the scene back to where it began.
 */
export type SiteLoop = {
  id: string;
  shot: string;
  motion: 'orbit' | { swayDeg: number } | { clockDays: number };
  seconds: number;
};
