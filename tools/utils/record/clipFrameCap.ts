/**
 * clipFrameCap — the frame budget the recorder allocates for a whole clip
 * take, in virtual frames at the take's fps.
 *
 * Exists so a clip take stuck on `watchClipSaga`'s
 * `waitUntil(clipFociReady && cameraRuntime)` fails loudly instead of
 * spinning forever. Margin rationale lives at `frameCapFor`.
 */
import type { ClipData } from '../../../src/@types/animation/ClipData';
import { clipDurationSec } from '../animation/clipDurationSec';
import { frameCapFor } from './frameCapFor';

export function clipFrameCap(clip: ClipData, fps: number): number {
  return frameCapFor(clipDurationSec(clip), fps);
}
