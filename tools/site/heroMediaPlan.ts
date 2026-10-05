import type { HeroMediaPlan } from './@types/HeroMediaPlan';

/**
 * Cut points were chosen by looking at sampled frames of the August 2026
 * Earth-to-universe recording: the flight ends when the observable-universe
 * sphere stops shrinking (about 66 s); the rest of that file is a static hold
 * and the loop back in.
 *
 * Encode, measured on this footage: 1280x720 at 24 fps, CRF 33 and a one second
 * GOP come to 13.3 MB; CRF 32 was 16 MB and CRF 30 doubled it. 960x540 at CRF 30
 * was 14 MB and visibly softer on the Gaia star field. Stills: AVIF quality 50
 * holds the star field; the site derives smaller widths and WebP at build.
 */
export const HERO_MEDIA: HeroMediaPlan = {
  videoFile: 'earth-to-universe-v1.mp4',
  inSec: 0,
  outSec: 66,
  width: 1280,
  fps: 24,
  crf: 33,
  stillLandscapeWidth: 1600,
  stillPortraitWidth: 720,
  stillQuality: 50,
};
