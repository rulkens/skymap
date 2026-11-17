/**
 * stellarStreamsLookLive — whether one look draws this frame. The haze producer and its upsample
 * consumer both gate on it, so the upsample never composites an offscreen nobody wrote; the
 * streak pass shares it for its own look. Core folds the fade in before `enabled` runs.
 */

import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import type { StellarStreamsLook } from '../@types/StellarStreamsLook';

export function stellarStreamsLookLive(
  runtime: StellarStreamsRuntime,
  look: StellarStreamsLook,
): boolean {
  return runtime.renderer.hasData() && look.intensity > 0;
}
