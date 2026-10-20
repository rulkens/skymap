/**
 * attachResizeWake — a window `resize` requests a render, so the next frame's
 * `resizeCanvasToDisplay` recreates the render target at the new size.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { RenderScheduler } from '../../../@types/engine/subsystems/RenderScheduler';

export function attachResizeWake(scheduler: RenderScheduler): Destroyable {
  const onResize = (): void => scheduler.requestRender();
  window.addEventListener('resize', onResize);
  return {
    destroy(): void {
      window.removeEventListener('resize', onResize);
    },
  };
}
