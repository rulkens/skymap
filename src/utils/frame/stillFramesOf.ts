import type { Mat4 } from 'wgpu-matrix';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { Size } from '../../@types/rendering/Size';

/**
 * Frames since a view last moved: `previous.stillFrames + 1` when `vp` and the size equal last
 * frame's exactly, else 0. Exact on purpose: a camera at rest reproduces its matrix bit for bit
 * (the navigator snaps sub-epsilon velocities to 0), so any difference is real motion.
 */
export function stillFramesOf(
  previous: Pick<FrameView, 'vp' | 'canvasSize' | 'stillFrames'> | undefined,
  vp: Mat4,
  sizePx: Size,
): number {
  if (previous === undefined) return 0;
  if (previous.canvasSize.width !== sizePx.width) return 0;
  if (previous.canvasSize.height !== sizePx.height) return 0;
  for (let i = 0; i < vp.length; i++) if (previous.vp[i] !== vp[i]) return 0;
  return previous.stillFrames + 1;
}
