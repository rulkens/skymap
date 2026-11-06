import type { ScopedVisibilityAddress } from '../../../../@types/animation/ScopedVisibilityAddress';
import type { VisibilityArg } from '../../../../@types/animation/VisibilityArg';

/**
 * The names `setLabelsFocusedOnly` does not gate, hidden by beat 00 and kept off
 * until a beat names them; Earth's own caption stays. The Milky Way beat shows
 * them again for now, until the Earth-and-Moon to Milky Way beats claim their own.
 */
export const OPENING_HIDDEN_LABELS = [
  'label:starCatalog',
  'label:body:planet', // moons too
  'label:body:small-body',
  'label:missions', // craft: Hubble beside the whole Earth
  'label:blackHole', // "Galactic Centre", full strength from home
] as const satisfies readonly (VisibilityArg | ScopedVisibilityAddress)[];
