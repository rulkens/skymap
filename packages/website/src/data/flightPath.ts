/**
 * The camera's path in the hero flight, copied from the clip the film was
 * recorded from (`earthUniverseLoop`, built by `makeEarthLoop` in the app):
 * one pull-back from `startKm` to `farKm` from Earth's centre over `legSec`
 * seconds, eased in and out, even in the logarithm of distance in between.
 * tests/packages/website/flightDistanceKm.test.ts holds these to the clip.
 */
export const FLIGHT_PATH = {
  startKm: 19_139.547,
  farKm: 29_500 * 3.085677581491367e19,
  legSec: 70,
} as const;
