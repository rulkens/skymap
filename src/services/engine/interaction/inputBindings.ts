/**
 * inputBindings — the engine's one remaining DOM listener: a window resize
 * wakes the loop, so `resizeCanvasToDisplay` (top of the next frame body) sees
 * the new size and recreates the HDR target instead of drawing at the old
 * backing-store resolution until some other event schedules a frame.
 *
 * Pointer and wheel input reach the engine only through the `input` slice;
 * Escape is the keyboard shortcut table's.
 */

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { AttachEngineInputsOptions } from '../../../@types/input/AttachEngineInputsOptions';
import type { InputBindings } from '../../../@types/input/InputBindings';

export function attachEngineInputs({ scheduler }: AttachEngineInputsOptions): InputBindings {
  const onResize = (): void => scheduler.requestRender();
  window.addEventListener('resize', onResize);

  const bindings: InputBindings = {
    destroy(): void {
      window.removeEventListener('resize', onResize);
    },
  };
  bindings satisfies Destroyable;
  return bindings;
}
