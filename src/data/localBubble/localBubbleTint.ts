import type { Vec3 } from '../../@types/math/Vec3';

/**
 * The shell's Fresnel-rim colour (RGB). Eye-tuned, not derived — the design
 * spec's open questions flag tint as one of the first levers if the additive
 * membrane doesn't read against the Milky Way backdrop.
 */
export const LOCAL_BUBBLE_TINT: Vec3 = [0.55, 0.68, 0.85];
