/**
 * A short silent film that repeats without a seam, starting from the manifest picture `shot`. `motion`: `orbit` takes
 * the camera once round its target, `swayDeg` swings it to each side and back, `live` leaves camera and clock alone
 * for a scene that moves by itself (flow ribbons) and blends its end into its start, `clockDays` runs the app's
 * clock over a span that must bring the scene back to where it began, `orbitTurns` also taking the camera that many
 * times round its target over the span and `swayDeg` swinging it that far to each side and back. `width` is the
 * film's, in pixels, where it is not a disc; its height follows the picture's shape.
 */
export type SiteLoop = {
  id: string;
  shot: string;
  motion:
    | 'orbit'
    | 'live'
    | { swayDeg: number }
    | { clockDays: number; orbitTurns?: number; swayDeg?: number };
  seconds: number;
  width?: number;
};
