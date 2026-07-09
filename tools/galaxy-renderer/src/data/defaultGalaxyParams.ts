/**
 * DEFAULT_GALAXY_PARAMS — the spike's boot state, verbatim
 * (`Galaxy Renderer.dc.html:472-475`): a barred-arm Sc spiral, 200k stars,
 * seed 3. This is the one place the number lives — the Viewport seeds the
 * engine from it, and plan 03's params store slice seeds its initial state
 * from the same constant, so the two can never drift apart.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

export const DEFAULT_GALAXY_PARAMS: GalaxyParams = {
  type: 'Sc',
  starCount: 200000,
  radius: 0.9,
  bulgeSize: 0.7,
  armCount: 4,
  armWinding: 0.6,
  armWidth: 1.25,
  armStrength: 1.0,
  subArms: 0.66,
  armFalloff: 0.6,
  armClump: 0.52,
  armWave: 0.62,
  armEdgeVar: 0.48,
  waveSeed: 1,
  clumpSeed: 1,
  asymSeed: 1,
  barStrength: 1.1,
  diskThickness: 0.55,
  youngStars: 0.7,
  metallicity: 0.5,
  warpStrength: 0,
  warpTwist: 0,
  hii: 1.5,
  dust: 0.35,
  dustRing: 0.7,
  dustNoise: 0.76,
  dustNoiseScale: 2.05,
  dustRingStrength: 0,
  dustRingWidth: 0.12,
  globularCount: 50,
  globularSize: 1,
  globularBright: 0.6,
  irregularity: 0.5,
  bulgeFalloff: 0.5,
  seed: 3,
};
