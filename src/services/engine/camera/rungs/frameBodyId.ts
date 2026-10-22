/** The body a frame NAMES — its own id, not its host: `hostOf` answers a site's
 *  PLANET, and the two differ exactly where a caller needs to ask this. */
import type { BodySourceId } from '../../../../@types/data/body/BodySourceId';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';
import { rungKindOf } from './rungKindOf';

export function frameBodyId(frame: PoseFrame): BodySourceId | null {
  if (frame === 'absolute') return null;
  // The kind IS the key the tag carries its id under (§2.1) — a fact the union
  // type cannot state, hence the cast.
  return (frame as Record<RungKind, BodySourceId>)[rungKindOf(frame)];
}
