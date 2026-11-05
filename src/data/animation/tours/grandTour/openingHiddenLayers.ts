import type { VisibilityArg } from '../../../../@types/animation/VisibilityArg';

/** Beat 00 hides these over the park; beat 01 shows them again for every later beat. */
export const OPENING_HIDDEN_LAYERS = [
  'label:starCatalog', // `setLabelsFocusedOnly` does not gate the star names
  'orbitTrails', // planet and moon trails
  'sStarTrails',
  'missionTrails',
  'satellites', // Earth-orbit satellites and their orbits
] as const satisfies readonly VisibilityArg[];
