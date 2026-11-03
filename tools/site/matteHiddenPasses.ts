/**
 * MATTE_HIDDEN_PASSES — every pass that draws sky, not subject: a `matte` shot
 * leaves them all out so only the bodies and craft stand on the cleared
 * background. Strings, as in `tools/utils/capture/hiddenPasses.ts`; a test
 * keeps them FRAME_ORDER names.
 */
export const MATTE_HIDDEN_PASSES: readonly string[] = [
  'point-sprites',
  'procedural-disks',
  'textured-disks',
  'cosmic-web-filaments',
  'cosmic-web-density',
  'cosmic-web-density-upsample',
  'zone-of-avoidance',
  'zone-of-avoidance-upsample',
  'flow',
  'labels-world',
  'horizon-shell',
  'structure-markers-cosmo',
  'structure-markers-near',
  'milky-way-aggregate',
  'milky-way-upsample',
  'milky-way',
  'local-bubble',
  'light-time-spheres',
  'star-aggregates',
  'star-points',
  'star-catalog',
  'star-upsample',
  'field-star-sphere',
  'constellations',
  'black-hole-marker',
  'orbit-trails',
  'mission-trails',
  'satellite-orbits',
  'satellites',
];
