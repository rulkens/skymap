import type { VisibilityArg } from '../../../../@types/animation/VisibilityArg';

/** Beat 00 hides these over the park; beat 01 shows them again from orbit. */
export const OPENING_HIDDEN_LAYERS = [
  'orbitTrails', // planet and moon trails
  'sStarTrails',
  'satellites', // Earth-orbit satellites and their orbits
] as const satisfies readonly VisibilityArg[];
