/**
 * starCaptionFadeAlpha — the visibility ramp for a local-star caption, driven
 * by the camera's DISTANCE from the star: full alpha inside the stellar
 * neighbourhood, fading to nothing as the camera leaves it.
 *
 * ### Why distance, not apparent size
 *
 * An apparent-size gate (the sphere-promotion signal, `STAR_RESOLVE_PX`) was
 * tried first and made each caption a BODY caption: a solar-radius star only
 * subtends the resolve threshold within ~an AU, so a star's name appeared only
 * on final approach to that one star. But the captions' purpose is a LOCAL
 * STAR MAP — naming the neighbourhood from within it. The farthest seeded star
 * is Pollux at 10.34 pc, so a camera standing at Earth must see the whole map:
 * `STAR_CAPTION_FULL_PC` ≥ that distance is exactly what makes the map read
 * from Earth. Beyond `STAR_CAPTION_GONE_PC` the map is gone, which is what
 * stops the two dozen names clobbering into one pile when viewed from far
 * outside the neighbourhood.
 *
 * Deliberately INDEPENDENT of the sphere-resolve crossover
 * (`STAR_RESOLVE_PX`, `partitionStarsByResolution`): that gate is about
 * pixels-on-screen — when a star stops being a point sprite — while this one
 * is about neighbourhood membership — when the map is relevant at all.
 * Coupling them is what produced the body-caption behaviour.
 *
 * The smoothstep keeps the exit perceptually soft (same primitive as the
 * Milky-Way approach fade); the `1 −` flips it because this band fades OUT
 * with distance where a resolve band fades IN with size.
 */

import { smoothstep } from '../math/smoothstep';

/**
 * Full caption alpha within this camera-to-star distance (pc). Sized just past
 * Pollux (10.34 pc), the farthest seeded star, so the WHOLE map is at full
 * strength viewed from Earth. One of the user's two tuning knobs for the
 * map's reach.
 */
export const STAR_CAPTION_FULL_PC = 12;

/**
 * Captions fully faded beyond this camera-to-star distance (pc) — the edge of
 * "the neighbourhood". The other tuning knob.
 */
export const STAR_CAPTION_GONE_PC = 25;

export function starCaptionFadeAlpha(distPc: number): number {
  return 1 - smoothstep(STAR_CAPTION_FULL_PC, STAR_CAPTION_GONE_PC, distPc);
}
