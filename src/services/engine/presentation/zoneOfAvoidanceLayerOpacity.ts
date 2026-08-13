/**
 * zoneOfAvoidanceLayerOpacity — the ONE home for the zone-of-avoidance
 * overlay's per-frame opacity scalar: the distance band (camera receding from
 * Earth toward Local-Group framing) times a layer's fade-registry toggle
 * opacity.
 *
 * Called TWICE per frame with two different `layerFadeOpacity` inputs — the
 * band's own toggle opacity and the label's — so the dust band and its
 * "Zone of Avoidance" lettering dissolve on the SAME distance band (one
 * `fadeBand(SCALE_FADE_BANDS.zoneOfAvoidance, …)` lookup) while still toggling
 * independently, mirroring `constellationLayerOpacity`'s shape.
 */

import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function zoneOfAvoidanceLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return fadeBand(SCALE_FADE_BANDS.zoneOfAvoidance, camDistMpc) * layerFadeOpacity;
}
