/**
 * constellationLayerOpacity — the ONE home for the constellation overlay's
 * per-frame opacity scalar: the distance band (camera receding out of the
 * stellar neighbourhood) times the layer's fade-registry toggle opacity.
 *
 * Several sites need this exact product and must move in lock-step: the
 * `constellationsLayer` pass (the stick figures' `draw` alpha) and
 * `foregroundLabelsLayer` (the figure-name captions' per-frame fade TARGET,
 * before its declutter + envelope) both multiply band × toggle, so the names
 * dissolve together with the lines on both the ENABLE/DISABLE toggle and the
 * fly-away recession. Inlined, a tweak to the band lookup or the multiply could
 * drift the names off the lines; folding it here makes the lock-step structural
 * because they read the same function.
 *
 * The caller passes the fade-registry opacity it already has in hand (rather
 * than the `FadeRegistry` itself), keeping this a pure scalar function with no
 * subsystem coupling. The band-only HARD CULL reuses this same home by passing
 * opacity `1` — the product reduces to the raw distance band — in both the
 * pass's `enabled` (the stick figures) and the label layer's `enabled` (the
 * captions), so the single `fadeBand(SCALE_FADE_BANDS.constellations, …)` lookup
 * lives in exactly one place.
 */

import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function constellationLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc) * layerFadeOpacity;
}
