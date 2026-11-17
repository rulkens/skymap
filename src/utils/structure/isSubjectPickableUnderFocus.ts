import type { Vec3 } from '../../@types/math/Vec3';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import { isPickableUnderFocus } from './isPickableUnderFocus';

/**
 * A named subject's pick gate under a focus: inside the sphere, or the focused subject itself,
 * which the sphere may not hold (a stream's recede-all sphere; a structure's own while the
 * previous one fades out).
 */
export function isSubjectPickableUnderFocus(
  subjectId: number,
  worldPos: Readonly<Vec3>,
  snapshot: Pick<ReadyFrameContext, 'focus' | 'focusPickId'>,
): boolean {
  return subjectId === snapshot.focusPickId || isPickableUnderFocus(worldPos, snapshot.focus);
}
