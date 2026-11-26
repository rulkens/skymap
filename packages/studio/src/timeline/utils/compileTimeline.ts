/**
 * Compile a resolved clip for the timeline model: the compiler's spans and duration, or on a
 * `ClipCompileError` its culprits and the spans walked so far, so a broken draft still draws at
 * true times. Any other throw is a programmer error and propagates.
 */
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { ClipCompileError } from '../../../../../src/services/engine/animation/ClipCompileError';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { OrientationFrameId } from '../../../../../src/@types/camera/orientation/OrientationFrameId';
import type { TimelineCompile } from '../../@types/rows/TimelineCompile';

export function compileTimeline(resolved: ClipData, frame: OrientationFrameId): TimelineCompile {
  try {
    const { spans, durationSec } = compileClip(resolved, ORIENTATION_FRAMES[frame]);
    return { ok: true, spans, durationSec };
  } catch (error) {
    if (!(error instanceof ClipCompileError)) throw error;
    const { reason, paths, spans } = error;
    return { ok: false, spans, error: { reason, paths } };
  }
}
