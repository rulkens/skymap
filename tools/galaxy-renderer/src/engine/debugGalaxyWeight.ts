/**
 * debugGalaxyWeight — combined dimming weight for the galaxy under the debug
 * views. The four views crossfade INDEPENDENTLY rather than replace the
 * galaxy, so this is 1 minus the LARGEST intensity, not the sum: summing
 * would double-dim the galaxy wherever two views are live at once.
 *
 * Adding a fifth debug view means adding its intensity to the `Math.max`
 * call below too — skip that and the galaxy will not dim under it.
 */
import type { RenderSettings } from '../../@types/engine/RenderSettings';

export function debugGalaxyWeight(render: RenderSettings): number {
  return Math.max(
    0,
    1 -
      Math.max(
        render.dustViewIntensity,
        render.sfMapViewIntensity,
        render.orientationViewIntensity,
        render.bubbleViewIntensity,
      ),
  );
}
