/** The body a frame NAMES — its own id, not its host: `hostOf` answers a site's
 *  PLANET, and the two differ exactly where a caller needs to ask this. */
import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';
import { rungKindOf } from './rungKindOf';

export function frameBodyId(frame: PoseFrame): BodyId | null {
  if (frame === 'absolute') return null;
  // The kind IS the key the tag carries its id under (§2.1), so one index
  // spells every rung; the index is what the union type cannot state.
  return (frame as Record<RungKind, BodyId>)[rungKindOf(frame)];
}
