/** constantSunField — the bench's manual-sun comparison: one `g` everywhere,
 *  as the smallest `SunField` `sampleSunField` can bilinearly interpolate
 *  (a 2×2 grid, corners at `bounds`) without a degenerate single-post axis. */
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { SunField } from '../../textures/SunField';

export function constantSunField(bounds: LonLatBounds, g: readonly [number, number]): SunField {
  return {
    bounds,
    width: 2,
    height: 2,
    gx: new Float32Array(4).fill(g[0]),
    gy: new Float32Array(4).fill(g[1]),
    confidence: new Float32Array(4).fill(1),
  };
}
