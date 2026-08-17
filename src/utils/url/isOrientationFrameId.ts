import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';

// The accepted set is the registry's own keys, so a new frame added to
// ORIENTATION_FRAMES is recognised here with no second edit; a literal list
// would be a place for the two to silently drift apart.
const ORIENTATION_FRAME_IDS = Object.keys(ORIENTATION_FRAMES);

/**
 * Narrow an arbitrary string to OrientationFrameId. The URL `orientation` param
 * is external input (a share link's hash can carry a hand-typed junk value), so
 * the read path routes it through this classifier before dispatching, rather
 * than trusting the string. Mirrors `isStructureId`'s registry-derived shape.
 */
export function isOrientationFrameId(value: string): value is OrientationFrameId {
  return ORIENTATION_FRAME_IDS.includes(value);
}
