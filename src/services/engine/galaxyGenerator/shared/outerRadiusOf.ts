/**
 * outerRadiusOf — the single home of the galaxy's outer-radius formula:
 * `10 * (params.radius || 1)`, the base scale every other length (disk
 * scale, bulge, bar, dust ring, ...) derives from. `describeGalaxy` (which
 * carries the result on `GalaxyDescription.outerRadius`) and `carveDustLayout`
 * (which has no description to read it from) both call this directly — a
 * second copy of the formula in either would desync them.
 */
import type { GalaxyParams } from '../../../../@types/galaxy/GalaxyParams';

export function outerRadiusOf(params: GalaxyParams): number {
  return 10 * (params.shared.radius || 1);
}
