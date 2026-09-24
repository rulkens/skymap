/**
 * blackHoleMarkerBrightness — a hole's far-field marker alpha: its base
 * intensity crossfaded OUT across its lens band, so the marker hands over to
 * the lens on approach. An unresolved anchor reads 0: there is nowhere to draw.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { fadeBand } from '../../../utils/math/fadeBand';
import { distanceMpc } from '../../../utils/math/distanceMpc';

export function blackHoleMarkerBrightness(
  row: BlackHoleRow,
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): number {
  const anchor = states.get(row.anchorId);
  if (anchor === undefined) return 0;
  const band = CUBEMAP_CAPTURES[row.capture].band;
  return row.glintBaseIntensity * (1 - fadeBand(band, distanceMpc(camPosMpc, anchor.positionMpc)));
}
