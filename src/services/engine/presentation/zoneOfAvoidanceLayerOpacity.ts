/**
 * zoneOfAvoidanceLayerOpacity — the ONE home for the zone-of-avoidance
 * overlay's per-frame opacity scalar: a visibility WINDOW (approach band ×
 * recede band) times a layer's fade-registry toggle opacity. The band fades
 * IN as the Milky Way frames up (`zoneOfAvoidance`) and back OUT once the
 * Local Group is the subject (`zoneOfAvoidanceRecede`) — the guide is scoped
 * to the Milky-Way-context shot, not a permanent cosmic-scale fixture.
 *
 * Called TWICE per frame with two different `layerFadeOpacity` inputs — the
 * band's own toggle opacity and the label's — so the dust band and its
 * "Zone of Avoidance" lettering dissolve on the SAME window (one
 * `fadeBand(...) * fadeBand(...)` pair) while still toggling independently,
 * mirroring `constellationLayerOpacity`'s shape.
 */

import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';

export function zoneOfAvoidanceLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number {
  return (
    fadeBand(SCALE_FADE_BANDS.zoneOfAvoidance, camDistMpc) *
    fadeBand(SCALE_FADE_BANDS.zoneOfAvoidanceRecede, camDistMpc) *
    layerFadeOpacity
  );
}
