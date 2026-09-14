import type { RungKind } from './RungKind';
import type { FrameOf } from './FrameOf';

/** The frame a stored or authored camera pose is expressed in (ruled, Q10). */
export type PoseFrame = FrameOf[RungKind];
