import type { ResidentSlot } from '../../stream/@types/ResidentSlot';
import type { ResolvedTileResidency } from '../../stream/@types/ResolvedTileResidency';

/** An ancestor's own atlas rect, narrowed to leaf `(x, y)`'s share of it —
 *  the low `levelDelta` bits of each, in the row order the header derives. */
export function flattenAtlasRect(
  found: ResidentSlot,
  levelDelta: number,
  x: number,
  y: number,
): Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'> {
  const span = 1 << levelDelta;
  const offsetU = (x - (x >> levelDelta) * span) / span;
  const offsetV = (y - (y >> levelDelta) * span) / span;
  return {
    atlasUvOrigin: [
      found.atlasUvOrigin[0] + offsetU * found.atlasUvScale[0],
      found.atlasUvOrigin[1] + offsetV * found.atlasUvScale[1],
    ],
    atlasUvScale: [found.atlasUvScale[0] / span, found.atlasUvScale[1] / span],
  };
}
