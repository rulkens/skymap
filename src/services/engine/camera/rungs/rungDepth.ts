/** Rungs between a kind and the world arm, read off the rows' own `parent` so a
 *  new rung needs no line here. `refoldTo` compares depths to know which end to move. */
import type { RungKind } from '../../../../@types/camera/RungKind';
import { CAMERA_RUNGS } from './cameraRungs';

export function rungDepth(kind: RungKind): number {
  return kind === 'absolute' ? 0 : rungDepth(CAMERA_RUNGS[kind].parent) + 1;
}
