/**
 * HiiPalette — the pair of colours `hiiPalette(metallicity)` produces for a
 * galaxy's HII (ionized hydrogen) star-forming regions: a bright `core`
 * colour for the emission point itself, and a dimmer, more red-shifted
 * `halo` colour for the surrounding diffuse glow.
 */
import type { Vec3 } from '../math/Vec3';

export type HiiPalette = { readonly core: Vec3; readonly halo: Vec3 };
