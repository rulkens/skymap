/**
 * constellationLayerOpacity — the ONE home for the constellation overlay's
 * per-frame opacity scalar: the distance band (camera receding out of the
 * stellar neighbourhood) times the layer's fade-registry toggle opacity.
 *
 * Three sites need this exact product and must move in lock-step: the
 * `constellationsLayer` pass (the stick figures' `draw` alpha) and
 * `produceConstellationLabels` (the names' `fadeAlpha`) both multiply band ×
 * toggle, and the pass's `enabled` hard-culls on the band factor alone. Inlined
 * three times, a tweak to the band lookup or the multiply could drift the names
 * off the lines. Folding it here makes the lock-step structural: the lines and
 * their names dissolve together on both the ENABLE/DISABLE toggle and the
 * fly-away recession because they read the same function.
 *
 * The caller passes the fade-registry opacity it already has in hand (rather
 * than the `FadeRegistry` itself), keeping this a pure scalar function with no
 * subsystem coupling. `enabled`'s band-only hard cull reuses this same home by
 * passing opacity `1` — the product then reduces to the raw distance band, so
 * the `fadeBand(SCALE_FADE_BANDS.constellations, …)` lookup lives in exactly one
 * place.
 */

import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function constellationLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc) * layerFadeOpacity;
}
