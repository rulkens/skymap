/** lensFramingWindow — the whole lens as a framing window: nothing covers the view. */

import type { FramingWindow } from '../../@types/camera/FramingWindow';

export function lensFramingWindow(fovYRad: number, aspect: number): FramingWindow {
  const tanHalfY = Math.tan(fovYRad / 2);
  return { tanHalfX: tanHalfY * aspect, tanHalfY };
}
