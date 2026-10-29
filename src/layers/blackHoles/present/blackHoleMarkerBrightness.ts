/**
 * blackHoleMarkerBrightness — a hole's far-field marker alpha: its base
 * intensity crossfaded OUT across its lens band, so the marker hands over to
 * the lens on approach, and out across the foreground band from its own
 * anchor, so it yields where the rest of NEAR0 does. An unresolved anchor
 * reads 0: there is nowhere to draw.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { FOREGROUND_RECEDE_FADE_BAND } from '../../../data/bands/foregroundRecedeFadeBand';
import { fadeBand } from '../../../utils/math/fadeBand';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { blackHoleAnchorId } from './blackHoleAnchorId';

export function blackHoleMarkerBrightness(
  row: BlackHoleRow,
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): number {
  const anchor = states.get(blackHoleAnchorId(row));
  if (anchor === undefined) return 0;
  const distance = distanceMpc(camPosMpc, anchor.positionMpc);
  const lensFade = 1 - fadeBand(CUBEMAP_CAPTURES[row.capture].band, distance);
  return row.glintBaseIntensity * lensFade * fadeBand(FOREGROUND_RECEDE_FADE_BAND, distance);
}
