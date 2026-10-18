/**
 * constellationLayerOpacity — distance band times the layer's fade opacity, the
 * one place the `SCALE_FADE_BANDS.constellations` lookup lives so the figures
 * and their names can never read different bands.
 *
 * The only caller, `constellationsBand`, passes opacity 1, so today this is the
 * raw band; the pass and the caption producer multiply their own fade on top.
 */

import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';

export function constellationLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc) * layerFadeOpacity;
}
