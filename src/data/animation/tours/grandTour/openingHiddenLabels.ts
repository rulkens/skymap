import type { ScopedVisibilityAddress } from '../../../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityArg } from '../../../../@types/animation/VisibilityArg';

/**
 * The names `setLabelsFocusedOnly` does not gate, hidden by beat 00 and kept off
 * until a beat names them; Earth's own caption stays. Earth and Moon shows the
 * planets' and moons' names, the Solar System the Sun's, the stellar
 * neighbourhood the star map's; the Milky Way beat shows the rest again for now.
 */
export const OPENING_HIDDEN_LABELS = [
  'label:starCatalog',
  'label:body:planet', // moons too
  'label:body:small-body',
  'label:missions', // craft: Hubble beside the whole Earth
  'label:blackHole', // "Galactic Centre", full strength from home
] as const satisfies readonly (VisibilityArg | ScopedVisibilityAddress)[];
