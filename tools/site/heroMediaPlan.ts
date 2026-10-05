import type { HeroMediaPlan } from './@types/HeroMediaPlan';

/**
 * Cut points were chosen by looking at sampled frames of the August 2026
 * Earth-to-universe recording: the flight ends when the observable-universe
 * sphere stops shrinking (about 66 s); the rest of that file is a static hold
 * and the loop back in.
 *
 * Encode, measured on this footage: 1280x720 at 24 fps, CRF 33 and a one second
 * GOP come to 13.3 MB; CRF 32 was 16 MB and CRF 30 doubled it. 960x540 at CRF 30
 * was 14 MB and visibly softer on the Gaia star field.
 */
export const HERO_MEDIA: HeroMediaPlan = {
  videoFile: 'earth-to-universe-v1.mp4',
  inSec: 0,
  outSec: 66,
  width: 1280,
  fps: 24,
  crf: 33,
  stills: [
    { file: 'poster-earth.webp', atSec: 0, width: 1920 },
    { file: 'still-solar-system.webp', atSec: 30, width: 1600 },
    { file: 'still-milky-way.webp', atSec: 40.5, width: 1600 },
    { file: 'still-local-group.webp', atSec: 44.5, width: 1600 },
    { file: 'still-cosmic-web.webp', atSec: 49, width: 1600 },
    { file: 'still-universe.webp', atSec: 64, width: 1600 },
  ],
};
